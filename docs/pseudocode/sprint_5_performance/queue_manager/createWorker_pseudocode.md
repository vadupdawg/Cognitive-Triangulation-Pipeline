# Pseudocode: createWorker Function

This document outlines the logic for the `createWorker` function in the `queueManager` utility.

## 1. Function Definition

```pseudocode
FUNCTION createWorker(queueName, processor, options)
```

**Description:** Creates and configures a new `BullMQ.Worker` instance to process jobs from a specified queue.

---

## 2. Inputs

*   **`queueName`**
    *   **Type:** `String`
    *   **Description:** The name of the queue the worker will connect to.
    *   **Constraints:** Required, must be a non-empty string.
*   **`processor`**
    *   **Type:** `Function`
    *   **Description:** An asynchronous function that contains the logic for processing a single job.
    *   **Constraints:** Required.
*   **`options`**
    *   **Type:** `Object`
    *   **Description:** Optional configuration settings for the worker, such as `concurrency`. These settings will be merged with the standard configuration.
    *   **Constraints:** Optional.

---

## 3. Output

*   **`worker`**
    *   **Type:** `Worker Object`
    *   **Description:** A fully configured `BullMQ.Worker` instance, ready to start processing jobs.

---

## 4. Logic and TDD Anchors

```pseudocode
FUNCTION createWorker(queueName, processor, options)

  -- TDD Anchor: TEST behavior when queueName is invalid or missing.
  IF queueName IS NULL OR TYPEOF(queueName) IS NOT "String" OR queueName IS EMPTY THEN
    THROW New Error("A valid queueName (non-empty string) is required.")
  ENDIF

  -- TDD Anchor: TEST behavior when processor is invalid or missing.
  IF processor IS NULL OR TYPEOF(processor) IS NOT "Function" THEN
    THROW New Error("A valid processor function is required.")
  ENDIF

  -- Define the standard, non-negotiable configuration for all workers.
  -- This ensures consistency in reliability policies.
  -- It retrieves the shared Redis connection managed by the queueManager.
  LET standardConfig = {
    connection: GET_SHARED_REDIS_CONNECTION(),
    stalledInterval: 30000, -- Check for stalled jobs every 30 seconds
    removeOnComplete: { count: 1000 }, -- Keep last 1000 completed jobs
    removeOnFail: { count: 5000 } -- Keep last 5000 failed jobs
  }

  -- Merge the standard configuration with any custom options provided by the caller.
  -- Custom options (like 'concurrency') will override defaults if specified.
  -- TDD Anchor: TEST that custom options (e.g., concurrency) are correctly merged and override defaults.
  LET finalConfig = MERGE(standardConfig, options)

  -- Instantiate the worker with the queue name, processor, and the final configuration.
  -- TDD Anchor: TEST that a BullMQ.Worker instance is created with the correct final configuration.
  LET worker = NEW BullMQ.Worker(queueName, processor, finalConfig)

  -- Add event listeners for logging and monitoring.
  -- TDD Anchor: TEST that the 'completed' event listener is called when a job succeeds.
  worker.on('completed', FUNCTION(job)
    LOG `Job ${job.id} in queue ${queueName} completed successfully.`
  ENDFUNCTION)

  -- TDD Anchor: TEST that the 'failed' event listener is called when a job fails.
  worker.on('failed', FUNCTION(job, error)
    LOG_ERROR `Job ${job.id} in queue ${queueName} failed with error: ${error.message}`
  ENDFUNCTION)

  -- Return the created worker instance to the caller.
  RETURN worker

ENDFUNCTION