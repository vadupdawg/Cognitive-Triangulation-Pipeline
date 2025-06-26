# Test Plan-- Sprint 5 Performance Refactor

**Feature Name:** Sprint 5 Performance Refactor
**Version:** 1.0
**Status:** In Draft

---

## 1. Test Plan Overview

### 1.1. Introduction

This document outlines the detailed testing strategy for the Sprint 5 Performance Refactor. The goal of this refactor is to replace the previous monolithic, sequential analysis pipeline with a scalable, resilient, and parallelized system based on BullMQ job queues. This plan provides a comprehensive set of granular, interaction-based tests designed to verify the correctness of each component and their collaboration within the new architecture.

### 1.2. Objectives

*   Verify that the new hierarchical job system (`analyze-file`, `resolve-directory`, `resolve-global`) functions correctly, with proper dependency management.
*   Ensure the `EntityScout` producer correctly builds and enqueues the entire hierarchical job structure.
*   Validate that each worker (`FileAnalysisWorker`, `DirectoryResolutionWorker`, `GlobalResolutionWorker`) processes its jobs correctly and observes its dependencies.
*   Confirm that the `QueueManager` provides robust failure handling, including the correct routing of failed jobs to the Dead-Letter Queue (DLQ).
*   Ensure all database interactions are atomic and idempotent.

### 1.3. AI Verifiable Completion Criteria

The successful creation of this test plan document at `docs/test-plans/sprint_5_performance/sprint_5_performance_refactor_test_plan.md` serves as the AI-verifiable outcome for the test planning phase. The subsequent implementation and passing of all tests defined herein will verify the completion of the refactoring work itself.

---

## 2. Test Strategy

### 2.1. Philosophy-- London School of TDD (Interaction-Based Testing)

This test plan adopts the **London School of TDD** methodology. Our focus is on verifying the **behavior** of a unit through its **interactions** with its collaborators, rather than checking its internal state.

*   **Unit Under Test (UUT):** The specific class or module being tested.
*   **Collaborators:** All external dependencies of the UUT (e.g., other classes, database connections, file system modules, API clients).
*   **Mocks and Spies:** In each test, all collaborators will be replaced with mocks or spies. We will then assert that the UUT calls the correct methods on these mocks with the expected arguments. The return values of mocks will be controlled to simulate various scenarios (success, failure, specific data).

This approach ensures that our tests are decoupled from implementation details, leading to a more robust and maintainable test suite. We test the *contract* between components, not how they work inside.

### 2.2. Recursive Testing Strategy (Regression)

A multi-layered regression strategy will be implemented to provide fast feedback while ensuring system-wide stability. Tests will be tagged to facilitate selective execution.

*   **Tags:** `unit`, `integration`, `e2e`, `fast`, `slow`

| Trigger | Scope | Test Selection | Purpose |
| --- | --- | --- | --- |
| **On Code Change (Local)** | Component Level | `unit`, `fast` | Instant feedback for the developer on the component being worked on. |
| **On Git Commit (Pre-push Hook)** | Changed Modules | `unit`, `integration`, `fast` | Ensures no breaking changes are introduced for directly related components. |
| **On Pull Request** | Full Project | All `unit` and `integration` tests. | Verifies the feature branch is stable and integrates correctly with the main branch. |
| **On Merge to Main** | Full Project | All tests (`unit`, `integration`, `e2e`). | Final verification of stability and correctness before deployment. |
| **Nightly Build** | Deployed Staging | All `e2e` tests. | Health check of the deployed application in a production-like environment. |

---

## 3. Test Scope

This test plan is designed to verify the AI Verifiable End Results outlined in the [`docs/primary_project_planning_document_sprint_5_performance.md`](docs/primary_project_planning_document_sprint_5_performance.md) and the refined architecture in the `docs/architecture/sprint_5_performance/` directory.

The key areas covered are:
1.  **`QueueManager` & Infrastructure:** (Targets Task 1.1)
2.  **`EntityScoutProducer` Hierarchical Job Creation:** (Targets Task 3.1, refined by architecture docs)
3.  **`FileAnalysisWorker` Processing:** (Targets Task 2.1)
4.  **`DirectoryResolutionWorker` Dependency Trigger:** (Implicit in refined architecture)
5.  **`GlobalResolutionWorker` Dependency Trigger:** (Implicit in refined architecture)
6.  **Failure Handling & DLQ:** (Targets non-functional requirements in specs)

---

## 4. Test Environment

*   **Framework:** Jest
*   **Mocking Library:** `jest.fn()` and `jest.spyOn()`
*   **Key Mocked Components:**
    *   `BullMQ.Queue`: To verify jobs are added correctly.
    *   `BullMQ.Worker`: To simulate job processing.
    *   `ioredis`: To mock the Redis connection.
    *   `fs/promises`: To mock file system reads.
    *   `DatabaseClient`: A mock client to verify atomic transactions (`beginTransaction`, `commit`, `rollback`) and idempotent writes.
    *   `LLMClient`: A mock client to simulate LLM queries and responses.

---

## 5. Granular Test Cases

### 5.1. Unit Tests-- `QueueManager`

*   **UUT:** `QueueManager`
*   **AI Verifiable End Result Targeted:** Task 1.1 -- Centralized queue management.

| Test Case ID | Description | Collaborators to Mock | Expected Observable Outcome | Regression Scope |
| --- | --- | --- | --- | --- |
| **QM-01** | `getQueue` should return a new queue instance with default retry options on the first call. | `ioredis`, `BullMQ.Queue` | The `BullMQ.Queue` constructor is called once with the correct queue name and default job options (`{ attempts: 3, backoff: ... }`). | `unit`, `fast` |
| **QM-02** | `getQueue` should return the same queue instance on subsequent calls for the same name. | `ioredis`, `BullMQ.Queue` | The `BullMQ.Queue` constructor is called only on the first invocation. Subsequent calls return the cached instance. | `unit`, `fast` |
| **QM-03** | `createWorker` should instantiate a BullMQ Worker with standard options. | `BullMQ.Worker` | The `BullMQ.Worker` constructor is called with the correct queue name, processor function, and standard options (e.g., shared connection). | `unit`, `fast` |
| **QM-04** | A permanently failed job in any queue should be moved to the `failed-jobs` queue. | `BullMQ.Queue` | A `failed` event listener on the source queue is triggered. The `add` method on the `failed-jobs` queue mock is called with the failed job's data and error details. | `integration`, `slow` |

### 5.2. Unit Tests-- `EntityScoutProducer`

*   **UUT:** `EntityScout`
*   **AI Verifiable End Result Targeted:** Task 3.1 (Refined) -- Hierarchical job creation.

| Test Case ID | Description | Collaborators to Mock | Expected Observable Outcome | Regression Scope |
| --- | --- | --- | --- | --- |
| **ESP-01** | `run()` should create a single `resolve-global` parent job. | `QueueManager`, `fs`, Mock `BullMQ.Queue` | The `add` method on the `global-resolution-queue` mock is called exactly once with `{ name: 'resolve-global', ... }`. | `unit`, `fast` |
| **ESP-02** | `run()` should create one `resolve-directory` parent job for each discovered directory. | `QueueManager`, `fs` (to return 2 dirs), Mock `BullMQ.Queue` | The `add` method on the `directory-resolution-queue` mock is called twice, once for each directory path. | `unit`, `fast` |
| **ESP-03** | `run()` should create `analyze-file` jobs for all files using `addBulk`. | `QueueManager`, `fs` (to return 3 files), Mock `BullMQ.Queue` | The `addBulk` method on the `analysis-queue` mock is called once with an array of 3 job definitions. | `unit`, `fast` |
| **ESP-04** | `run()` should correctly link `analyze-file` jobs as dependencies to their directory job. | `QueueManager`, `fs`, Mock `BullMQ.Job` | `dirParentJob.addDependencies` is called with the job IDs returned from the `addBulk` call for that directory's files. | `integration`, `fast` |
| **ESP-05** | `run()` should correctly link `resolve-directory` jobs as dependencies to the global job. | `QueueManager`, `fs`, Mock `BullMQ.Job` | `globalParentJob.addDependencies` is called with the job IDs of all created directory jobs. | `integration`, `fast` |

### 5.3. Unit Tests-- `FileAnalysisWorker`

*   **UUT:** `FileAnalysisWorker`
*   **AI Verifiable End Result Targeted:** Task 2.1 -- File analysis processing.

| Test Case ID | Description | Collaborators to Mock | Expected Observable Outcome | Regression Scope |
| --- | --- | --- | --- | --- |
| **FAW-01** | `processJob` should successfully analyze a file and commit the transaction. | `fs`, `LLMClient`, `DatabaseClient` | 1. `db.beginTransaction()` is called. 2. `fs.readFile` is called. 3. `llm.query` is called. 4. `db.execute` is called with idempotent (`ON CONFLICT`) statements. 5. `db.commit()` is called. | `unit`, `fast` |
| **FAW-02** | `processJob` should roll back the transaction if saving results fails. | `fs`, `LLMClient`, `DatabaseClient` (mocked to throw on write) | 1. `db.beginTransaction()` is called. 2. `db.rollback()` is called. 3. `db.commit()` is NOT called. The worker should re-throw the error to let BullMQ handle the job failure. | `unit`, `fast` |
| **FAW-03** | `_analyzeFileContent` should chunk large files based on a "context budget". | `LLMClient` | For file content exceeding the budget, `llm.query` is called multiple times with chunks of the content, not once with the full content. | `unit`, `fast` |

### 5.4. Unit Tests-- `DirectoryResolutionWorker`

*   **UUT:** `DirectoryResolutionWorker`
*   **AI Verifiable End Result Targeted:** Hierarchical fan-in stage 1.

| Test Case ID | Description | Collaborators to Mock | Expected Observable Outcome | Regression Scope |
| --- | --- | --- | --- | --- |
| **DRW-01** | The worker only runs after its `analyze-file` dependencies are met. | `BullMQ.Queue` | This is an integration test. We verify that a `resolve-directory` job is processed only after all its mocked child jobs are marked `completed`. | `integration`, `slow` |
| **DRW-02** | `processJob` should load POIs for its specific directory and save intra-directory relationships. | `DatabaseClient`, `LLMClient` | 1. `db.loadPoisForDirectory()` is called with the correct directory path. 2. `llm.query` is called with the context of those POIs. 3. `db.saveRelationships()` is called with the new relationships. | `unit`, `fast` |

### 5.5. Unit Tests-- `GlobalResolutionWorker`

*   **UUT:** `GlobalResolutionWorker`
*   **AI Verifiable End Result Targeted:** Hierarchical fan-in stage 2.

| Test Case ID | Description | Collaborators to Mock | Expected Observable Outcome | Regression Scope |
| --- | --- | --- | --- | --- |
| **GRW-01** | The worker only runs after its `resolve-directory` dependencies are met. | `BullMQ.Queue` | This is an integration test. We verify that the `resolve-global` job is processed only after all its mocked `resolve-directory` child jobs are marked `completed`. | `integration`, `slow` |
| **GRW-02** | `processJob` should load directory summaries and save inter-directory relationships. | `DatabaseClient`, `LLMClient` | 1. `db.loadDirectorySummaries()` is called. 2. `llm.query` is called with the context of the summaries. 3. `db.saveRelationships()` is called with the final cross-directory relationships. | `unit`, `fast` |