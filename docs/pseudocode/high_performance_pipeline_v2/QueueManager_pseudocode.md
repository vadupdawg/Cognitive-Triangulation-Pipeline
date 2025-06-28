# QueueManager Pseudocode (Revised)

**Version:** 2.0
**Author:** AI Assistant
**Date:** 2025-06-27

## 1. Overview

This document outlines the revised, language-agnostic pseudocode for a robust `QueueManager` class. This version decouples connection from initialization, introduces resilient connection management with retry logic, and specifies clearer error handling and configuration, addressing feedback from the critical review.

---

## 2. Class Definition-- QueueManager

A class to manage all interactions with Redis-based queues.

```pseudocode
CLASS QueueManager

  //-- Properties
  PRIVATE redisConnection = null
  PRIVATE connectionOptions = null
  PRIVATE activeQueues = new Map()
  PRIVATE isConnected = false
  PRIVATE CONSTANT MAX_JOB_RETRIES = 3
  PRIVATE CONSTANT FAILED_JOBS_QUEUE = "failed-jobs"

  //-- TDD ANCHOR -- TEST that the constructor correctly stores configuration without connecting.
  //-- TDD ANCHOR -- TEST that the constructor throws a ConfigurationError if essential config is missing.
  PUBLIC CONSTRUCTOR(config)
    //-- INPUT -- config (Object) -- Redis connection details from a centralized source.
    //-- BEHAVIOR -- Initializes the manager with configuration, does not connect.
    this.connectionOptions = getRedisConnectionOptions(config)
  END CONSTRUCTOR

  //-- TDD ANCHOR -- TEST connect() successfully establishes a connection on the first try.
  //-- TDD ANCHOR -- TEST connect() successfully connects after several retries using exponential backoff.
  //-- TDD ANCHOR -- TEST connect() throws a ConnectionError after exhausting all retry attempts.
  //-- TDD ANCHOR -- TEST that connect() sets up 'error', 'reconnecting', and 'end' event listeners.
  PUBLIC ASYNC METHOD connect(maxRetries = 5, initialDelay = 200)
    //-- BEHAVIOR -- Establishes and manages the Redis connection with a retry mechanism.
    DECLARE attempts = 0
    WHILE attempts < maxRetries DO
      TRY
        LOG "Attempting to connect to Redis... (Attempt " + (attempts + 1) + ")"
        //-- The actual Redis client is created here
        this.redisConnection = CREATE_REDIS_CLIENT(this.connectionOptions)
        
        //-- Setup crucial event listeners for ongoing connection management
        this.setupEventListeners()

        //-- Await a confirmation ping to ensure the connection is truly live
        AWAIT this.redisConnection.ping()
        
        this.isConnected = true
        LOG "Successfully connected to Redis."
        RETURN true
      CATCH error
        attempts = attempts + 1
        LOG_WARNING "Redis connection attempt failed.", error
        IF this.redisConnection IS NOT null THEN
          this.redisConnection.disconnect() // Ensure failed client is cleaned up
        END IF
        IF attempts >= maxRetries THEN
          THROW new ConnectionError("Failed to connect to Redis after " + maxRetries + " attempts.")
        END IF
        DECLARE delay = initialDelay * (2 ^ (attempts - 1)) // Exponential backoff
        AWAIT sleep(delay)
      END TRY
    END WHILE
  END METHOD

  //-- TDD ANCHOR -- TEST that the 'error' event is logged correctly.
  //-- TDD ANCHOR -- TEST that the 'reconnecting' event is logged.
  //-- TDD ANCHOR -- TEST that the 'end' event is logged and sets isConnected to false.
  PRIVATE METHOD setupEventListeners()
    this.redisConnection.on('error', (err) => {
      LOG_ERROR "Redis Client Error:", err
      // Note-- The client's auto-reconnect is handled by the 'reconnecting' event.
      // This listener is for logging and potential metrics for unrecoverable errors.
    })

    this.redisConnection.on('reconnecting', () => {
      LOG_INFO "Redis client is reconnecting..."
      this.isConnected = false
    })

    this.redisConnection.on('end', () => {
      this.isConnected = false
      LOG_WARNING "Redis connection closed."
    })
    
    this.redisConnection.on('connect', () => {
        this.isConnected = true
        LOG_INFO "Redis connection re-established."
    })
  END METHOD

  //-- TDD ANCHOR -- TEST getQueue throws a StateError if called before a successful connect().
  //-- TDD ANCHOR -- TEST getQueue returns a valid queue instance when connected.
  //-- TDD ANCHOR -- TEST getQueue returns the same instance for the same name (cache).
  PUBLIC METHOD getQueue(queueName)
    IF NOT this.isConnected THEN
      THROW new StateError("Cannot get queue. QueueManager is not connected to Redis.")
    END IF

    IF queueName is null or empty THEN
      THROW new InvalidArgumentError("Queue name cannot be null or empty.")
    END IF

    IF this.activeQueues.has(queueName) THEN
      RETURN this.activeQueues.get(queueName)
    END IF

    LOG "Creating new queue instance for--", queueName
    DECLARE defaultJobOptions = {
      attempts: MAX_JOB_RETRIES,
      backoff: { type: 'exponential', delay: 1000 }
    }

    //-- Create queue with the *shared* Redis connection client
    DECLARE newQueue = CREATE_NEW_QUEUE(queueName, {
      connection: this.redisConnection,
      defaultJobOptions: defaultJobOptions
    })

    this.activeQueues.set(queueName, newQueue)
    RETURN newQueue
  END METHOD

  //-- TDD ANCHOR -- TEST addJob fails with a QueueOperationError if the Redis connection is down.
  //-- TDD ANCHOR -- TEST addJob successfully adds a job.
  //-- TDD ANCHOR -- TEST addJob throws InvalidArgumentError for null jobData.
  PUBLIC ASYNC METHOD addJob(queueName, jobData, jobOptions = {})
    IF jobData is null THEN
      THROW new InvalidArgumentError("Job data cannot be null.")
    END IF

    DECLARE queue = this.getQueue(queueName) // This will throw if not connected

    TRY
      DECLARE newJob = await queue.add(jobData, jobOptions)
      LOG "Added job with ID", newJob.id, "to queue--", queueName
      RETURN newJob
    CATCH error
      LOG_ERROR "Failed to add job to queue--", queueName, error
      //-- Differentiate error types
      IF error is a RedisConnectionError OR NOT this.isConnected THEN
        //-- The connection is down, this is a critical failure.
        THROW new QueueOperationError("Fatal-- Could not add job to queue due to Redis connection issue.")
      ELSE
        //-- Other errors (e.g., data serialization) might be an issue with the job itself.
        //-- This is a failure to *add*, not a failure during job execution.
        THROW new QueueOperationError("Failed to add job to queue " + queueName + ". Error-- " + error.message)
      END IF
    END TRY
  END METHOD

  //-- TDD ANCHOR -- TEST that close() disconnects the main Redis client.
  //-- TDD ANCHOR -- TEST that close() clears the activeQueues map.
  PUBLIC ASYNC METHOD close()
    LOG "Closing all queue connections..."
    FOR EACH queue IN this.activeQueues.values() DO
      AWAIT queue.close() // Close individual queue resources if necessary
    END FOR
    
    IF this.redisConnection AND this.isConnected THEN
      AWAIT this.redisConnection.quit()
    END IF

    this.activeQueues.clear()
    this.isConnected = false
    LOG "All queue connections have been closed."
  END METHOD

END CLASS
```

---

## 3. Utility Functions

### 3.1. getRedisConnectionOptions

This private utility function securely loads and validates Redis connection details.

```pseudocode
PRIVATE FUNCTION getRedisConnectionOptions(config)
  //-- INPUT -- config (Object) -- An object containing environment or direct configuration.
  //-- OUTPUT -- A validated configuration object for the Redis client.
  //-- TDD ANCHOR -- TEST that it correctly loads host, port, and password.
  //-- TDD ANCHOR -- TEST that it throws a ConfigurationError if required variables are missing.
  //-- TDD ANCHOR -- TEST that it includes default values for timeouts and retry strategies.

  DECLARE redisHost = config.REDIS_HOST
  DECLARE redisPort = config.REDIS_PORT
  DECLARE redisPassword = config.REDIS_PASSWORD // Optional

  IF redisHost is not set OR redisPort is not set THEN
    THROW new ConfigurationError("Redis host and port must be defined.")
  END IF

  //-- Specify connection options clearly. This object is for the Redis client (e.g., ioredis).
  RETURN {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    //-- How long to wait for a command to complete before failing.
    commandTimeout: 10000, // 10 seconds
    //-- Prevent hanging on initial connection.
    connectTimeout: 10000, // 10 seconds
    //-- Disable the Redis client's internal retry, as we implement a custom one in connect().
    maxRetriesPerRequest: null
  }
END FUNCTION