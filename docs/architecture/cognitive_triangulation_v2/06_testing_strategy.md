# Cognitive Triangulation v2 -- Testing Strategy

## 1. Introduction

This document outlines the formal testing strategy for the Cognitive Triangulation v2 architecture. Given the system's distributed, asynchronous, and event-driven nature, a robust testing strategy is critical for ensuring correctness, maintaining development velocity, and preventing regressions. Relying solely on slow and potentially flaky end-to-end (E2E) tests is insufficient.

We will adopt the **Pyramid Testing Strategy**, which emphasizes a healthy balance of fast, isolated unit tests at the base, more comprehensive integration tests in the middle, and a few high-value E2E tests at the peak.

## 2. The Testing Pyramid

```
      /-----\
     /  E2E  \
    /---------\
   /           \
  / Integration \
 /---------------\
/                 \
/   Unit/Interaction  \
-------------------
```

### 2.1. Level 1-- Unit & Interaction Tests (The Base)

-   **Goal--** Verify that individual components and functions work correctly in isolation. These tests should be fast, numerous, and form the foundation of our test suite.
-   **Scope--**
    -   **Pure Functions--** Test services like `ConfidenceScoringService` and `HashingService` with a variety of inputs to validate their logic.
    -   **Worker Logic--** Test the core logic of each worker (`FileAnalysisWorker`, `ValidationWorker`, etc.) by mocking its external boundaries. For example, when testing `ValidationWorker`, we will mock the BullMQ client and the SQLite client to verify that the worker calls them with the correct parameters based on its inputs.
    -   **Interaction Verification--** Use mocking/stubbing libraries (e.g., Jest, Sinon) to ensure that a component correctly interacts with its dependencies (e.g., "did the worker try to write to the correct database table?").
-   **Examples--**
    -   `ConfidenceScoringService.spec.js`-- Test that `calculateFinalScore` correctly boosts scores for agreement and penalizes for disagreement.
    -   `ValidationWorker.spec.js`-- Given an `analysis-completed` event, verify that the worker correctly calculates the Redis key and calls `INCR`. Given a `reconcile` job, verify it calls the database with the correct `SELECT` statement.

### 2.2. Level 2-- Component Integration Tests (The Middle)

-   **Goal--** Verify that small groups of components collaborate correctly. These tests will use real infrastructure components (like an in-memory SQLite database and a real Redis instance) but will not run the entire pipeline.
-   **Scope--**
    -   **Worker-to-Database--** Test that a worker correctly consumes a job from a real BullMQ instance, processes it, and writes the expected data to a test SQLite database.
    -   **`EntityScout`-to-Infrastructure--** Test that `EntityScout` correctly populates Redis with the manifest and BullMQ with the expected jobs (including the finalizer with correct dependencies).
    -   **Outbox Pattern--** Test the `TransactionalOutboxPublisher` by seeding the `outbox` table in a test database and verifying that the publisher successfully reads from it and publishes the event to a real BullMQ instance.
-   **Examples--**
    -   `file_analysis_pipeline.integration.spec.js`-- Enqueue a job, run the `FileAnalysisWorker`, and then assert that the `relationship_evidence` and `outbox` tables in the test database contain the correct records.
    -   `finalizer_job.integration.spec.js`-- Create a set of mock jobs and a finalizer job that depends on them. Complete the mock jobs and verify that BullMQ correctly enqueues the finalizer job.

### 2.3. Level 3-- End-to-End (E2E) Tests (The Peak)

-   **Goal--** Verify critical, high-value user-facing scenarios from start to finish. These tests should be few in number, as they are the slowest and most complex to maintain.
-   **Scope--**
    -   Run the entire system against a small, controlled set of source code files.
    -   These tests will use real infrastructure (BullMQ, Redis, SQLite, Neo4j), likely managed via Docker Compose for consistency.
    -   The focus is on validating the final output, not the intermediate steps.
-   **Examples--**
    -   **Happy Path--** Test a simple project with two files that import each other. Run the full pipeline and assert that the final Neo4j graph contains the single, correct `VALIDATED` relationship between them.
    -   **Conflict Path--** Test a scenario designed to produce conflicting evidence. Assert that the final relationship in the database has a `CONFLICT` status and that the graph does not contain the relationship.
    -   **Resilience Path--** Test that if a worker job fails and is retried, the system eventually recovers and produces the correct output.