# Architectural Decision Record (ADR)

**Parent Document:** [System Architecture](./system_overview.md)
**Status:** In Design

This document records the key architectural decisions made for the Sprint 5 performance refactoring.

---

## ADR-001: Adoption of a Job-Queue Architecture

-   **Status:** Accepted
-   **Context:** The previous system was composed of monolithic agents that performed discovery, analysis, and persistence in a single, sequential process. As reported in `docs/reports/performance_review_EntityScout_20250622.md`, this led to significant performance bottlenecks, poor scalability, and a lack of resilience. A single failure in a long-running process could corrupt an entire run.
-   **Decision:** We will refactor the system to use a job-queue-based architecture, with [BullMQ](https://bullmq.io/) and Redis as the underlying technology. The system will be broken down into distinct, single-responsibility components-- one **Producer** (`EntityScout`) and multiple **Consumers** (`FileAnalysisWorker`, `RelationshipResolutionWorker`).
-   **Consequences:**
    -   **Pros:**
        -   **Scalability:** Worker processes can be scaled horizontally and independently to match the workload of different queues.
        -   **Resilience:** Jobs are persistent in Redis. If a worker fails, the job can be automatically retried without losing the entire run. Failed jobs can be shunted to a `failed-jobs` queue for later inspection.
        -   **Decoupling:** Components are loosely coupled. The `EntityScout` does not need to know which worker will process the job, or even if it's online.
        -   **Parallelism:** Multiple `FileAnalysisWorker` instances can process files in parallel, dramatically reducing the total time for the analysis phase.
    -   **Cons:**
        -   **Increased Complexity:** Introduces new infrastructure components (Redis) and a new programming model (producers/consumers, asynchronous job handling).
        -   **Monitoring:** Requires monitoring of the queue states (e.g., waiting jobs, failed jobs) in addition to the application logs.

---

## ADR-002: Transactional Integrity for All Database Writes

-   **Status:** Accepted
-   **Context:** In a distributed system with automatic job retries, it is possible for the same job to be processed more than once. Without proper safeguards, this could lead to duplicate data or inconsistent states in the database.
-   **Decision:** Every unit of work that involves writing to the database must be wrapped in a single, atomic transaction. Specifically--
    1.  The `FileAnalysisWorker` will start a transaction, perform the LLM analysis, save all results, and only then commit.
    2.  The `RelationshipResolutionWorker` will follow the same pattern-- start transaction, load data, resolve relationships, save new relationships, and then commit.
    3.  All database write operations (`INSERT`, `MERGE`) must be idempotent to gracefully handle cases where a transaction is committed but the job acknowledgement to the queue fails, causing a retry of an already-completed task.
-   **Consequences:**
    -   **Pros:**
        -   **Data Integrity:** Guarantees that the database will not be left in a partially-updated, inconsistent state.
        -   **Safe Retries:** Makes the entire system more robust and resilient to transient failures.
    -   **Cons:**
        -   **Performance Overhead:** Transactions add a small amount of overhead to database operations.
        -   **Increased Code Complexity:** Requires careful management of transaction lifecycles (`begin`, `commit`, `rollback`) and connection handling within the worker logic.

---

## ADR-003: Centralized Queue and Worker Management via `QueueManager`

-   **Status:** Accepted
-   **Context:** With multiple producers and consumers interacting with several different queues, there is a risk of configuration drift. Each component might initialize its queues or workers with slightly different settings for retries, logging, or connection parameters, leading to inconsistent behavior.
-   **Decision:** A singleton `QueueManager` utility will be created. All other components **must** use this manager to get queue instances and create workers. The `QueueManager` will be responsible for--
    1.  Managing the shared Redis connection.
    2.  Providing singleton `Queue` instances.
    3.  Applying a standard, non-negotiable configuration to all `Worker` instances (e.g., job retention policies, stalled job checks) while allowing callers to specify component-specific settings like `concurrency`.
    4.  Implementing a global "failed job" handler.
-   **Consequences:**
    -   **Pros:**
        -   **Consistency:** Ensures all parts of the system operate with the same reliability and logging standards.
        -   **Maintainability:** System-wide changes to queue behavior (e.g., changing retry backoff strategy) can be made in one place.
        -   **Reduced Boilerplate:** Producers and workers are simplified, as they no longer need to contain detailed queue configuration logic.
    -   **Cons:**
        -   **Central Point of Failure:** A bug in the `QueueManager` could potentially affect the entire system. This is mitigated by its simplicity and focused responsibility.

---

## 4. Navigation

-   [Back to System Overview](./system_overview.md)