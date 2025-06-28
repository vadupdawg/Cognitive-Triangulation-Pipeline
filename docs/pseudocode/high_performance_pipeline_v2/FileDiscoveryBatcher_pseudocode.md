# FileDiscoveryBatcher Worker Pseudocode

**Version--** 2.0
**Date--** 2025-06-27
**Author--** Pseudocode Writer Mode (Revised based on critique)

## 1. Overview

This document provides a detailed, language-agnostic pseudocode blueprint for the `FileDiscoveryBatcher` worker. This worker is a stateless Node.js process responsible for scanning a directory, batching files based on token count, and enqueuing them for further analysis. It is designed for high performance, scalability, and resilience, incorporating a robust distributed locking mechanism with lease renewal, memory-efficient streaming, and graceful shutdown procedures.

## 2. Dependencies and Modules

- **File System Access--** For reading files.
- **Streaming Glob Utility--** A library for streaming file paths from the filesystem (e.g., `fast-glob`).
- **Redis Client--** For distributed locking and queueing.
- **QueueManager--** A module for enqueuing jobs (see [`QueueManager_pseudocode.md`](./QueueManager_pseudocode.md)).
- **Configuration Loader--** For loading environment variables and JSON config (e.g., `dotenv`).
- **Logger--** A standard logging utility.
- **Token Counter--** A utility to count tokens in a string.
- **UUID Generator--** For creating a unique worker ID.

## 3. Configuration

```
FUNCTION loadConfiguration()
    -- TEST-- Configuration loads successfully from both .env and JSON files.
    -- TEST-- Missing essential configuration (e.g., TARGET_DIRECTORY) throws a critical error.

    LOAD environment variables (e.g., from .env file)
        - REDIS_URL
        - ... any other secrets

    LOAD default configuration (e.g., from config.json)
        - TARGET_DIRECTORY -- The directory to scan.
        - MAX_BATCH_TOKENS -- The maximum number of tokens per batch.
        - LOCK_LEASE_MILLISECONDS -- Lease time for the distributed lock (e.g., 30000 ms).
        - LOCK_RENEWAL_INTERVAL_MILLISECONDS -- How often to renew the lock lease (e.g., 10000 ms).
        - LOCK_KEY_PREFIX -- "discovery-lock:"
        - QUEUE_NAME -- "file-analysis-queue"

    VALIDATE that required configuration values are present.
    IF any required value is missing
        LOG critical error "Missing required configuration"
        EXIT process with error code
    END IF

    RETURN combined configuration object
END FUNCTION
```

## 4. Robust Distributed Locking

Functions to manage a robust distributed lock in Redis, preventing multiple workers from processing the same directory and avoiding deadlocks.

```
CONSTANT LUA_RELEASE_LOCK_SCRIPT = """
    IF redis.call("GET", KEYS[1]) == ARGV[1] THEN
        RETURN redis.call("DEL", KEYS[1])
    ELSE
        RETURN 0
    END IF
"""

FUNCTION acquireLock(redisClient, lockKey, workerId, leaseMilliseconds)
    -- INPUT-- redisClient instance, lockKey (string), workerId (string), leaseMilliseconds (integer)
    -- OUTPUT-- BOOLEAN (true if lock acquired, false otherwise)

    -- TEST-- acquireLock returns true when the lock is not already held.
    -- TEST-- acquireLock sets the correct workerId as the lock value.
    -- TEST-- acquireLock sets the correct lease time in milliseconds (PX).
    -- TEST-- acquireLock returns false when the lock is already held by another process.

    -- The 'NX' option means "set only if it does not already exist".
    -- The 'PX' option sets the expiration time in milliseconds. This is atomic.
    result = redisClient.SET(lockKey, workerId, "PX", leaseMilliseconds, "NX")

    RETURN result is "OK"
END FUNCTION

FUNCTION releaseLock(redisClient, lockKey, workerId)
    -- INPUT-- redisClient instance, lockKey (string), workerId (string)
    -- OUTPUT-- None

    -- TEST-- releaseLock successfully deletes the lock key if the workerId matches.
    -- TEST-- releaseLock does NOT delete the lock key if the workerId does not match.
    -- TEST-- releaseLock does not throw an error if the key does not exist.

    -- Execute the Lua script to ensure atomicity.
    -- This prevents a worker from releasing a lock it no longer holds.
    redisClient.EVAL(LUA_RELEASE_LOCK_SCRIPT, 1, lockKey, workerId)
    LOG info "Attempted to release lock for key-- {lockKey} with workerId-- {workerId}"
END FUNCTION

FUNCTION renewLock(redisClient, lockKey, workerId, leaseMilliseconds)
    -- INPUT-- redisClient instance, lockKey (string), workerId (string), leaseMilliseconds (integer)
    -- OUTPUT-- BOOLEAN (true if lease was renewed, false otherwise)

    -- TEST-- renewLock successfully extends the lease if the workerId matches.
    -- TEST-- renewLock does NOT extend the lease if the workerId does not match or key doesn't exist.

    -- Using a Lua script to ensure we only renew the lock if we still own it.
    CONSTANT LUA_RENEW_SCRIPT = """
        IF redis.call("GET", KEYS[1]) == ARGV[1] THEN
            RETURN redis.call("PEXPIRE", KEYS[1], ARGV[2])
        ELSE
            RETURN 0
        END IF
    """
    result = redisClient.EVAL(LUA_RENEW_SCRIPT, 1, lockKey, workerId, leaseMilliseconds)
    RETURN result == 1
END FUNCTION
```

## 5. Core Logic-- File Batching Stream

(This section remains unchanged as the critique focused on locking and lifecycle management.)

```
CLASS FileBatchingStream EXTENDS TransformStream
    -- This stream takes file paths as input and outputs file batch jobs.

    CONSTRUCTOR(maxBatchTokens, queueManager)
        super()
        this.maxBatchTokens = maxBatchTokens
        this.queueManager = queueManager
        this.currentBatch = createNewBatch()
        this.totalBatchesCreated = 0

        -- TEST-- Stream initializes with an empty batch and zero total batches.
    END CONSTRUCTOR

    FUNCTION _transform(filePath, encoding, callback)
        -- This function is called for each file path piped into the stream.
        -- TEST-- A valid file is read, its tokens are counted, and it is added to the current batch.
        -- TEST-- An unreadable file is skipped, an error is logged, and the stream continues processing.
        -- TEST-- A file that would exceed the batch token limit triggers enqueuing of the current batch and starts a new one.

        TRY
            fileContent = FILESYSTEM.readFile(filePath)
            tokenCount = countTokens(fileContent) -- Placeholder for actual token counting logic

            IF (this.currentBatch.totalTokens + tokenCount > this.maxBatchTokens) AND (this.currentBatch.files.length > 0)
                enqueueBatch(this.currentBatch)
                this.currentBatch = createNewBatch()
            END IF

            this.currentBatch.files.push({ path-- filePath, tokens-- tokenCount })
            this.currentBatch.totalTokens += tokenCount

        CATCH error
            LOG error "Failed to read or process file {filePath}-- {error.message}. Skipping."
        END TRY

        callback() -- Signal that processing of this chunk is complete.
    END FUNCTION

    FUNCTION _flush(callback)
        -- This function is called when the input stream has ended.
        -- TEST-- The final, partially-filled batch is enqueued when the stream ends.
        -- TEST-- If the final batch is empty, nothing is enqueued.

        IF this.currentBatch.files.length > 0
            enqueueBatch(this.currentBatch)
        END IF

        LOG info "Total batches created-- {this.totalBatchesCreated}"
        callback() -- Signal that the stream has finished flushing.
    END FUNCTION

    FUNCTION enqueueBatch(batch)
        -- TEST-- A full batch is correctly formatted and enqueued via the QueueManager.
        this.queueManager.enqueueJob(QUEUE_NAME, batch)
        LOG info "Enqueued batch {batch.id} with {batch.files.length} files."
        this.totalBatchesCreated += 1
    END FUNCTION

    FUNCTION createNewBatch()
        RETURN {
            id-- generateUUID(),
            files-- [],
            totalTokens-- 0
        }
    END FUNCTION

END CLASS
```

## 6. Main Execution Block & Lifecycle Management

The main entry point that orchestrates the entire process, including setup, graceful shutdown, and lock management.

```
GLOBAL_STATE {
    isShuttingDown: false,
    lockRenewalInterval: null,
    isLockAcquired: false,
    redisClient: null,
    queueManager: null,
    lockKey: null,
    workerId: null
}

FUNCTION main()
    -- Load configuration
    config = loadConfiguration()
    GLOBAL_STATE.workerId = generateUUID()
    GLOBAL_STATE.lockKey = config.LOCK_KEY_PREFIX + config.TARGET_DIRECTORY

    -- Initialize dependencies
    GLOBAL_STATE.redisClient = createRedisClient(config.REDIS_URL)
    GLOBAL_STATE.queueManager = new QueueManager(config.REDIS_URL)
    -- TEST-- main function exits gracefully if Redis connection fails.
    -- TEST-- main function exits gracefully if QueueManager connection fails.

    -- Set up graceful shutdown handlers
    -- TEST-- SIGINT signal triggers graceful shutdown.
    -- TEST-- SIGTERM signal triggers graceful shutdown.
    PROCESS.on('SIGINT', shutdown)
    PROCESS.on('SIGTERM', shutdown)

    TRY
        -- 1. Acquire Distributed Lock
        -- TEST-- The process exits if the lock is not acquired.
        GLOBAL_STATE.isLockAcquired = acquireLock(GLOBAL_STATE.redisClient, GLOBAL_STATE.lockKey, GLOBAL_STATE.workerId, config.LOCK_LEASE_MILLISECONDS)
        IF NOT GLOBAL_STATE.isLockAcquired
            LOG info "Could not acquire lock for {config.TARGET_DIRECTORY}. Another worker is likely running. Exiting."
            EXIT process gracefully
        END IF
        LOG info "Lock acquired for {config.TARGET_DIRECTORY} by worker {GLOBAL_STATE.workerId}."

        -- 2. Start Lock Renewal Heartbeat
        -- TEST-- Lock renewal heartbeat starts after lock is acquired.
        -- TEST-- Heartbeat successfully renews the lock lease.
        -- TEST-- If renewal fails, the system triggers a shutdown.
        GLOBAL_STATE.lockRenewalInterval = SET_INTERVAL(FUNCTION()
            IF renewLock(GLOBAL_STATE.redisClient, GLOBAL_STATE.lockKey, GLOBAL_STATE.workerId, config.LOCK_LEASE_MILLISECONDS)
                LOG debug "Lock lease renewed."
            ELSE
                LOG critical "Failed to renew lock lease. Another worker may have taken over. Shutting down."
                shutdown()
            END IF
        , config.LOCK_RENEWAL_INTERVAL_MILLISECONDS)

        -- 3. Set up Streaming Pipeline
        -- TEST-- The file system stream is correctly piped into the batching stream.
        fileStream = STREAMING_GLOB(config.TARGET_DIRECTORY)
        batchingStream = new FileBatchingStream(config.MAX_BATCH_TOKENS, GLOBAL_STATE.queueManager)

        -- 4. Start Processing
        LOG info "Starting file discovery and batching..."
        pipeline = fileStream.pipe(batchingStream)

        -- 5. Handle Pipeline Completion
        -- TEST-- The lock is released upon successful completion of the stream.
        pipeline.on('finish', FUNCTION()
            LOG info "File streaming and batching completed."
            shutdown() -- Normal completion triggers graceful shutdown
        END FUNCTION)

        -- TEST-- The lock is released even if the stream pipeline encounters a critical, unhandled error.
        pipeline.on('error', FUNCTION(error)
            LOG critical "A critical error occurred in the stream pipeline-- {error.message}"
            shutdown() -- Error completion also triggers graceful shutdown
        END FUNCTION)

    CATCH topLevelError
        LOG critical "An unexpected error occurred during setup-- {topLevelError.message}"
        shutdown() -- Any setup error triggers graceful shutdown
    END TRY
END FUNCTION

FUNCTION shutdown()
    -- TEST-- shutdown function is idempotent (can be called multiple times without error).
    IF GLOBAL_STATE.isShuttingDown
        RETURN
    END IF
    GLOBAL_STATE.isShuttingDown = true
    LOG info "Shutting down gracefully..."

    -- 1. Stop the lock renewal heartbeat
    -- TEST-- Heartbeat interval is cleared on shutdown.
    IF GLOBAL_STATE.lockRenewalInterval IS NOT NULL
        CLEAR_INTERVAL(GLOBAL_STATE.lockRenewalInterval)
        GLOBAL_STATE.lockRenewalInterval = null
        LOG info "Stopped lock renewal heartbeat."
    END IF

    -- 2. Release the lock (if held)
    -- TEST-- Lock is released on shutdown if it was acquired.
    IF GLOBAL_STATE.isLockAcquired
        releaseLock(GLOBAL_STATE.redisClient, GLOBAL_STATE.lockKey, GLOBAL_STATE.workerId)
        GLOBAL_STATE.isLockAcquired = false
    END IF

    -- 3. Disconnect clients
    -- TEST-- Redis and QueueManager clients are disconnected on shutdown.
    IF GLOBAL_STATE.redisClient IS NOT NULL
        GLOBAL_STATE.redisClient.disconnect()
    END IF
    IF GLOBAL_STATE.queueManager IS NOT NULL
        GLOBAL_STATE.queueManager.disconnect()
    END IF

    LOG info "Shutdown complete. Exiting."
    EXIT process
END FUNCTION

-- Start the process
main()