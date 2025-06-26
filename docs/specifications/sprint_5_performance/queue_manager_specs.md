# Specification: Queue Manager

**Sprint:** 5 - Performance Refactoring
**Component:** `src/utils/queueManager.js`
**Purpose:** To provide a centralized, singleton-like interface for creating, accessing, and managing BullMQ queue instances, and to define default policies for job robustness and error handling.

---

## 1. Functional Requirements

*   The module must provide a function to get a BullMQ `Queue` instance by name.
*   If a queue instance for a given name already exists, the module must return the existing instance.
*   The module must expose a function to gracefully close all active queue connections.
*   The module should handle Redis connection details internally, configured via environment variables or a central config file.
*   All queues created through this manager must use a standardized, default configuration for job retries and failure handling.

---

## 2. Non-Functional Requirements

*   **Reliability:** The manager must handle Redis connection errors gracefully and implement robust job processing policies.
*   **Performance:** Connection retrieval should be efficient. Creating new queue instances should only happen once per queue name for the lifetime of the application.
*   **Maintainability:** The implementation should be clean and well-documented, making it easy to manage queue connections and policies from a single location.

---

## 3. Error Handling and Robustness Policies

This manager is the source of truth for default job behavior.

*   **Default Retry Policy:** All jobs added to any queue will, by default, include a retry policy to handle transient errors.
    *   **Configuration:** `{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`
    *   **Rationale:** This provides a balance between resilience and not overwhelming a failing downstream service. The exponential backoff gives services time to recover.

*   **Dead-Letter Queue (DLQ):** Jobs that fail all retry attempts must not be lost.
    *   **Implementation:** A dedicated queue named `failed-jobs` will be used as a DLQ.
    *   **Mechanism:** The `QueueManager` will configure a global queue event listener for the `failed` event. This listener will take the failed job and its data and move it to the `failed-jobs` queue for manual inspection and potential reprocessing.

*   **Stalled Job Handling:** Workers can crash, leaving jobs in a "stalled" state.
    *   **Implementation:** BullMQ's built-in stalled job handling must be configured.
    *   **Mechanism:** The worker configuration should specify a `stalledInterval` (e.g., 30000ms) to check for stalled jobs and move them back to the `waiting` state to be re-processed.

---

## 4. Class and Function Definitions

### File: `src/utils/queueManager.js`

#### **Internal State**

*   `activeQueues`
    *   **Type:** `Map<string, BullMQ.Queue>`
    *   **Purpose:** A private map to store created queue instances, with the queue name as the key.
*   `redisConnection`
    *   **Type:** `IORedis`
    *   **Purpose:** A shared Redis connection for all queues and workers.

#### **Exported Functions**

*   `getQueue(queueName)`
    *   **Parameters:**
        *   `queueName` (string, required): The name of the queue to get.
    *   **Returns:** `BullMQ.Queue` -- The queue instance.
    *   **Purpose:** Retrieves an existing queue instance or creates a new one if it doesn't exist. The new queue is created with the default job options (retries, etc.) and a shared Redis connection.

*   `createWorker(queueName, processor, options)`
    *   **Parameters:**
        *   `queueName` (string, required): The name of the queue to process.
        *   `processor` (function, required): The async function to process jobs.
        *   `options` (object, optional): Worker-specific options (e.g., concurrency).
    *   **Returns:** `BullMQ.Worker`
    *   **Purpose:** Creates a BullMQ Worker with the standard configuration for stalled job handling and a shared Redis connection.

*   `closeConnections()`
    *   **Parameters:** None.
    *   **Returns:** `Promise<void>`
    *   **Purpose:** Iterates through all `activeQueues` and calls the `close()` method on each, and closes the shared Redis connection.

---

## 5. TDD Anchors / Pseudocode Stubs

```
TEST "getQueue should create a queue with default retry options"
    -- 1. Call getQueue('test-queue-retries')
    -- 2. Assert that the returned queue's defaultJobOptions match the defined retry policy.

TEST "Worker should move a permanently failed job to the 'failed-jobs' queue"
    -- 1. Setup a listener spy on the 'failed-jobs' queue.
    -- 2. Create a worker for 'test-queue' with a processor that always throws an error.
    -- 3. Set attempts to 1 for the test job.
    -- 4. Add the job and wait for it to fail.
    -- 5. Assert that the 'failed-jobs' queue listener spy was called with the failed job's data.

TEST "Stalled jobs should be re-queued"
    -- 1. Create a worker for a 'test-stalled' queue.
    -- 2. Mock the worker's processor to simulate a crash (e.g., by never resolving a promise).
    -- 3. Add a job and lock it to the worker.
    -- 4. Manually trigger BullMQ's stalled job check.
    -- 5. Assert that the job is moved back to the 'waiting' state.