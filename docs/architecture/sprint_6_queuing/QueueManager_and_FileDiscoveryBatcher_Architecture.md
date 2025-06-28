# Architecture-- QueueManager and FileDiscoveryBatcher (Revised)

**Version--** 2.0
**Date--** 2025-06-27
**Status--** Revised

## 1. Overview

This document defines the revised architecture for two critical components within the High-Performance Pipeline-- the `QueueManager` utility and the `FileDiscoveryBatcher` worker. This design incorporates critical feedback to improve resilience, scalability, and operational robustness. It supersedes the previous version and translates refined logic into a new architectural blueprint.

-   The **`FileDiscoveryBatcher`** is now a horizontally scalable worker fleet. It operates as part of a two-phase process, consuming file paths from a dedicated queue and creating token-based batches for analysis.
-   The **`QueueManager`** remains a centralized utility for abstracting queueing logic but is now fortified with explicit resilience and configuration validation patterns.

These revisions address foundational weaknesses in the original design, creating a more robust and scalable ingestion and job distribution mechanism.

## 2. Component Architecture

### 2.1. `QueueManager` (Centralized Utility Module)

The `QueueManager` is a singleton-style module designed to encapsulate all interactions with the BullMQ messaging system. It ensures that queue and worker configurations are standardized and that connections are managed efficiently and resiliently.

#### 2.1.1. Class Structure and Responsibilities

**`QueueManager` Class**

-   **Responsibilities--**
    -   Manages a shared, resilient Redis connection for all BullMQ instances.
    -   Implements a singleton pattern for queue instances using the `getQueue` method.
    -   Provides a factory method `createWorker` to instantiate new workers with standardized, non-negotiable settings for reliability.
    -   Implements a critical resilience pattern by automatically forwarding permanently failed jobs to a dedicated Dead-Letter Queue (DLQ).
    -   Provides a `closeConnections` method for graceful shutdown.

-   **Key Methods--**
    -   `getQueue(queueName)`-- Returns a cached queue instance or creates, configures, and caches a new one. Attaches the "failed" event listener for the DLQ strategy.
    -   `createWorker(queueName, processor, options)`-- Creates a BullMQ Worker with standardized event listeners and reliability options.
    -   `closeConnections()`-- Closes all active queues and the underlying Redis connection.

#### 2.1.2. Connection Resilience

To prevent the `QueueManager` from being a single point of failure, it **must** implement a robust connection strategy.

-   **Programmatic Retries--** The Redis connection logic must feature an **exponential backoff** and **jitter** algorithm. This allows the system to gracefully handle transient network issues or brief Redis unavailability without causing a thundering herd problem.
-   **Circuit Breaker Pattern--** The manager will implement a circuit breaker to detect extended Redis outages. After a configured number of failed connection attempts, the breaker will "trip," causing subsequent connection attempts to fail immediately for a cooldown period. This prevents the application from wasting resources on doomed connection attempts.
-   **Infrastructure Recommendation--** For production environments, it is strongly recommended that Redis be deployed in a **High-Availability (HA) configuration** (e.g., Redis Sentinel or a managed cloud equivalent like AWS ElastiCache). This provides infrastructure-level failover, complementing the application-level resilience patterns.

#### 2.1.3. Configuration

-   `REDIS_URL`-- The connection string for the Redis server.
-   `DEFAULT_JOB_OPTIONS`-- Internal configuration for job retries, backoff strategy, etc.
-   `DLQ_NAME`-- A constant defining the sink for all permanently failed jobs (e.g., `"dead-letter-queue"`).
-   **Configuration Validation--** On application startup, the `QueueManager`'s configuration **must** be validated against a strict schema (e.g., using `zod`). If the configuration is invalid (missing keys, wrong types), the application will enforce a **fail-fast** principle, exiting immediately with a clear error message.

---

### 2.2. `FileDiscoveryBatcher` (Redesigned for Scalability)

The `FileDiscoveryBatcher` architecture is redesigned into a **two-phase parallel processing model** to eliminate the single-producer bottleneck of the original design. The directory-level distributed lock is removed in favor of distributing the discovery work across multiple workers.

#### 2.2.1. Phase 1-- Rapid Path Discovery (Producer)

A new, dedicated, lightweight producer process is introduced.

-   **Responsibilities--**
    -   Scans the `TARGET_DIRECTORY` using a high-performance method (e.g., `fast-glob`).
    -   Its sole job is to discover file paths and their sizes. It performs minimal I/O and no tokenization.
    -   For each discovered file, it enqueues a job containing `{ filePath, fileSize }` into a new, dedicated queue-- `files-to-batch-queue`.
    -   This producer is designed to run as a single instance to completion.

#### 2.2.2. Phase 2-- Parallel Batching (`FileDiscoveryBatcher` Workers)

The `FileDiscoveryBatcher` is now a fleet of horizontally scalable workers that consume from the `files-to-batch-queue`.

-   **Responsibilities--**
    -   Each worker fetches a file path job from the `files-to-batch-queue`.
    -   It reads the file content, counts the tokens, and adds the file to an in-memory batch.
    -   When a batch reaches the `MAX_BATCH_TOKENS` threshold, the worker enqueues the completed batch into the `file-analysis-queue` via the `QueueManager`.
    -   This design allows for N workers to perform I/O and tokenization in parallel, dramatically increasing the throughput of the ingestion pipeline.

#### 2.2.3. Configuration

-   `REDIS_URL`-- Redis connection string.
-   `TARGET_DIRECTORY`-- The root directory for the Phase 1 producer to scan.
-   `PATH_DISCOVERY_QUEUE`-- The name of the queue for file paths (e.g., `"files-to-batch-queue"`).
-   `ANALYSIS_QUEUE`-- The name of the queue for batched jobs (e.g., `"file-analysis-queue"`).
-   `MAX_BATCH_TOKENS`-- The maximum token count for a single batch job.
-   **Configuration Validation--** On application startup, each worker **must** validate its configuration against a strict schema (e.g., using `zod`). The process will **fail fast** and exit with a clear error if the configuration is invalid.

## 3. Interaction and Data Flow Diagram (Revised)

The following Mermaid diagram illustrates the new two-phase, parallel-friendly architecture.

```mermaid
sequenceDiagram
    participant PD as Path Producer
    participant QM as QueueManager
    participant FDB1 as FileDiscoveryBatcher 1
    participant FDB2 as FileDiscoveryBatcher 2
    participant FDBN as ... (N Workers)

    PD->>PD-- Scan Filesystem
    PD->>+QM-- getQueue("files-to-batch-queue")
    QM-->>-PD-- Queue Instance

    loop For each file found
        PD->>QM-- enqueueJob({filePath, fileSize})
    end

    par
        FDB1->>+QM-- consume("files-to-batch-queue")
        QM-->>-FDB1-- Job 1 {filePath}
        FDB1->>FDB1-- Read file, tokenize, add to batch
        FDB1->>+QM-- enqueueJob(batch) to "file-analysis-queue"
    and
        FDB2->>+QM-- consume("files-to-batch-queue")
        QM-->>-FDB2-- Job 2 {filePath}
        FDB2->>FDB2-- Read file, tokenize, add to batch
        FDB2->>+QM-- enqueueJob(batch) to "file-analysis-queue"
    and
        FDBN->>+QM-- consume("files-to-batch-queue")
        QM-->>-FDBN-- Job N {filePath}
        FDBN->>FDBN-- Read file, tokenize, add to batch
        FDBN->>+QM-- enqueueJob(batch) to "file-analysis-queue"
    end
```

## 4. Advanced Resilience Patterns

### 4.1. Active Lock Verification

While the directory-wide lock for the `FileDiscoveryBatcher` has been removed, distributed locks may be used by other components in the system. Any such implementation **must** use active lock verification to prevent issues with preempted workers (e.g., due to long GC pauses).

-   **Check-on-Write Pattern--** A worker holding a lock **must** verify its ownership of that lock immediately before performing any critical, non-idempotent action (e.g., enqueuing a job, writing to a database). This is achieved by comparing its unique worker ID against the ID stored in the Redis lock key. If the IDs do not match, the worker has lost the lock and must immediately terminate its operation and shut down.

## 5. Error Handling and Resilience

### 5.1. Dead-Letter Queue (DLQ) Strategy

The handling of permanently failed jobs is elevated to a formal DLQ strategy to ensure operational visibility and data integrity. The simple "Permanent Job Failure Handling" is insufficient.

-   **Enriched Error Payloads--** When a job is moved to the DLQ, its payload **must** be enriched with critical debugging metadata--
    -   The full error stack trace that caused the final failure.
    -   The ID of the last worker that attempted to process the job.
    -   A timestamp of when the job was moved to the DLQ.
-   **Monitoring and Alerting--** The DLQ's size **must** be monitored as a key operational metric. Automated alerts must be configured to trigger when the queue depth exceeds a predefined threshold, notifying operators of a potential systemic failure.
-   **Triage and Reprocessing Tooling--** The architecture requires the development of a CLI or simple UI for operators. This tool will allow authorized users to--
    -   Inspect the payloads of failed jobs.
    -   Search or filter jobs in the DLQ.
    -   Manually discard jobs that are deemed unrecoverable.
    -   Selectively re-enqueue jobs for another processing attempt after a bug fix has been deployed.

### 5.2. Graceful Shutdown

All workers and producers must handle `SIGINT` and `SIGTERM` signals to ensure they clean up resources (e.g., close connections via `QueueManager.closeConnections()`) before exiting.