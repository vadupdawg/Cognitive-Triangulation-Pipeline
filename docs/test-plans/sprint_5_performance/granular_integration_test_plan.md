# Granular Integration Test Plan -- Sprint 5 Performance Refactoring

## 1. Introduction

This document outlines the granular integration test plan for the Sprint 5 Performance Refactoring. The primary objective is to replace the previous, brittle end-to-end (E2E) tests with a suite of focused, interaction-based integration tests. These tests will verify the specific responsibilities and collaborations of each major component in the new, parallelized data processing pipeline.

This plan adheres to the London School of TDD, emphasizing the testing of observable behaviors and interactions between components, rather than their internal state. It also defines a recursive testing strategy to ensure continuous stability and facilitate early regression detection.

## 2. Test Scope

The scope of this test plan is to verify the successful implementation of the AI Verifiable End Results defined in the [`docs/primary_project_planning_document_sprint_5_performance.md`](docs/primary_project_planning_document_sprint_5_performance.md:1). The tests will target the interactions between the following key components--

*   `EntityScout` (Producer)
*   `FileAnalysisWorker`
*   `DirectoryResolutionWorker`
*   `GlobalResolutionWorker`
*   `TransactionalOutboxPublisher`
*   `GraphBuilder`

The successful execution of the tests defined herein will confirm that the system correctly orchestrates job creation, dependency management, data processing, persistence, and final graph construction in a distributed and reliable manner.

## 3. Test Strategy

### 3.1. Testing Philosophy -- London School of TDD

Our testing approach is based on the London School of Test-Driven Development ("Interaction-Based Testing"). This means our tests will focus on verifying the **observable outcomes and interactions** of a unit of work, not its internal implementation details.

*   **Collaborator Mocking:** All external dependencies (collaborators) of the component under test will be mocked. For example, when testing `EntityScout`'s ability to create jobs, the BullMQ `Queue` object will be a test double. We will assert that `EntityScout` calls the `addBulk` method on the mock queue with the correct arguments, rather than checking the state of a real Redis instance.
*   **Behavior Verification:** Tests will confirm that components correctly delegate tasks and respond to inputs by interacting with their collaborators as expected. This makes tests more resilient to refactoring and focuses on the component's contractual obligations to the rest of the system.

### 3.2. Recursive Testing (Regression Strategy)

To ensure ongoing stability and catch regressions early, a multi-layered, recursive testing strategy will be implemented.

**Triggers for Re-running Tests--**
*   **On Every Commit (to a feature branch):** Fast, in-memory interaction tests.
*   **On Pull Request (to `main`):** The full suite of interaction and integration tests.
*   **On Merge (to `main`):** The full suite, plus any relevant smoke tests.
*   **Nightly Build:** The full suite, plus a curated set of E2E tests against a known dataset.

**Test Tiers and Tagging--**

Tests will be tagged to enable selective execution at different stages of the CI/CD pipeline.

*   **Tier 1 -- Interaction Tests (`@interaction`):**
    *   **Description:** Fast, lightweight tests that run in-memory with all external collaborators (queues, databases) mocked. The majority of tests in this plan fall into this category.
    *   **Trigger:** On every commit.
    *   **Goal:** Verify the component's logic and its direct interactions with its collaborators.

*   **Tier 2 -- Integration Tests (`@integration`):**
    *   **Description:** Slower tests that use real, containerized infrastructure (Redis, SQLite, Neo4j). They test the flow of data between two or three components.
    *   **Trigger:** On Pull Request and Merge to `main`.
    *   **Goal:** Verify data contracts, serialization, and correct data persistence between components.

*   **Tier 3 -- E2E Smoke Tests (`@smoke`):**
    *   **Description:** A small, curated set of tests that run the entire pipeline from `EntityScout` to `GraphBuilder` using a minimal, well-defined project structure.
    *   **Trigger:** Nightly builds.
    *   **Goal:** Ensure the entire system is wired together correctly and can process data end-to-end without catastrophic failure.

## 4. Detailed Test Cases

---

### 4.1. EntityScout to Queues

**Component Under Test:** `EntityScout`

**AI Verifiable End Result Targeted:** Task 3.1 & 4.1 (Refactor `EntityScout`), Hierarchical job creation from [`docs/architecture/sprint_5_performance/system_overview.md`](docs/architecture/sprint_5_performance/system_overview.md:1).

#### **Test Case ID: ES-INT-01**
*   **Summary:** Verify that `EntityScout.run()` creates a single `resolve-global-relationships` parent job.
*   **Interaction to Test:** The call to `queue.add()` for the global job.
*   **Collaborators to Mock:** `queueManager` (to return mock queues), `fs` (to mock file system scanning).
*   **Test Steps:**
    1.  Configure the `fs` mock to return a simple file structure (e.g., one directory, two files).
    2.  Spy on the `add` method of the mock `global-resolution-queue`.
    3.  Instantiate and call `EntityScout.run()`.
*   **Expected Observable Outcome:** The `add` method on the `global-resolution-queue` mock is called exactly once with the job name `resolve-global-relationships`.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_es_int_01.js` exists and implements this logic.

#### **Test Case ID: ES-INT-02**
*   **Summary:** Verify that `EntityScout.run()` creates a `resolve-directory-relationships` job for each subdirectory.
*   **Interaction to Test:** The call to `queue.add()` for directory-level jobs.
*   **Collaborators to Mock:** `queueManager`, `fs`.
*   **Test Steps:**
    1.  Configure the `fs` mock to return a structure with two subdirectories.
    2.  Spy on the `add` method of the mock `directory-resolution-queue`.
    3.  Instantiate and call `EntityScout.run()`.
*   **Expected Observable Outcome:** The `add` method on the `directory-resolution-queue` mock is called exactly twice, once for each directory. The payload of each call contains the correct `directoryPath`.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_es_int_02.js` exists and implements this logic.

#### **Test Case ID: ES-INT-03**
*   **Summary:** Verify that `EntityScout.run()` creates an `analyze-file` job for each discovered file.
*   **Interaction to Test:** The call to `queue.addBulk()` for file analysis jobs.
*   **Collaborators to Mock:** `queueManager`, `fs`.
*   **Test Steps:**
    1.  Configure the `fs` mock to return a structure with three files.
    2.  Spy on the `addBulk` method of the mock `file-analysis-queue`.
    3.  Instantiate and call `EntityScout.run()`.
*   **Expected Observable Outcome:** The `addBulk` method on the `file-analysis-queue` mock is called once with an array containing three job definitions.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_es_int_03.js` exists and implements this logic.

#### **Test Case ID: ES-INT-04**
*   **Summary:** Verify that job dependencies are correctly wired in BullMQ.
*   **Interaction to Test:** The calls to `parentJob.addDependencies()`.
*   **Collaborators to Mock:** `queueManager`, `fs`. The mock queue methods should return mock `Job` objects.
*   **Test Steps:**
    1.  Configure the `fs` mock to return one directory with two files.
    2.  Mock `globalQueue.add()` to return a mock `globalParentJob` with a spy on its `addDependencies` method.
    3.  Mock `directoryQueue.add()` to return a mock `dirParentJob` with a spy on its `addDependencies` method.
    4.  Mock `fileQueue.addBulk()` to return two mock `fileChildJob` objects with unique IDs.
    5.  Instantiate and call `EntityScout.run()`.
*   **Expected Observable Outcome:**
    *   The `addDependencies` method on `dirParentJob` is called once with the IDs of the two `fileChildJob` mocks.
    *   The `addDependencies` method on `globalParentJob` is called once with the ID of the `dirParentJob` mock.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_es_int_04.js` exists and implements this logic.

---

### 4.2. FileAnalysisWorker to SQLite

**Component Under Test:** `FileAnalysisWorker`

**AI Verifiable End Result Targeted:** Task 2.1 (Create File Analysis Worker), Data Integrity Mandates from [`docs/specifications/sprint_5_performance/file_analysis_worker_specs.md`](docs/specifications/sprint_5_performance/file_analysis_worker_specs.md:1).

#### **Test Case ID: FAW-INT-01**
*   **Summary:** Verify that processing an `analyze-file` job results in POIs being saved to the database within a transaction.
*   **Interaction to Test:** The sequence of calls to the database manager (`beginTransaction`, `prepare`, `run`, `commit`).
*   **Collaborators to Mock:** `sqliteDb` (mock database connection), `LLMClient` (to return predictable POIs).
*   **Test Steps:**
    1.  Create a mock database connection with spies on `beginTransaction`, `prepare`, `run`, and `commit`.
    2.  The `prepare` spy should return a statement object with its own `run` spy.
    3.  Instantiate `FileAnalysisWorker` with the mock DB.
    4.  Process a test job with a `filePath`.
*   **Expected Observable Outcome:** The database spies are called in the correct order-- `beginTransaction` -> `prepare`/`run` (one or more times) -> `commit`.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_faw_int_01.js` exists and implements this logic.

#### **Test Case ID: FAW-INT-02**
*   **Summary:** Verify that a database write failure triggers a transaction rollback.
*   **Interaction to Test:** The call to `rollback` on the database manager.
*   **Collaborators to Mock:** `sqliteDb`, `LLMClient`.
*   **Test Steps:**
    1.  Create a mock database connection with spies on `beginTransaction`, `commit`, and `rollback`.
    2.  Configure the mock `prepare.run` method to throw an error on the second call.
    3.  Instantiate `FileAnalysisWorker`.
    4.  Process a test job and expect it to throw an error.
*   **Expected Observable Outcome:** The `beginTransaction` spy is called. The `rollback` spy is called. The `commit` spy is **not** called.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_faw_int_02.js` exists and implements this logic.

#### **Test Case ID: FAW-INT-03**
*   **Summary:** Verify that database writes are idempotent.
*   **Interaction to Test:** The SQL query string passed to the database.
*   **Collaborators to Mock:** `sqliteDb`, `LLMClient`.
*   **Test Steps:**
    1.  Create a mock database connection with a spy on the `prepare` method.
    2.  Instantiate `FileAnalysisWorker`.
    3.  Process a test job.
*   **Expected Observable Outcome:** The SQL string passed to the `prepare` spy for `INSERT` statements contains the `ON CONFLICT DO UPDATE` clause.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_faw_int_03.js` exists and implements this logic.

---

### 4.3. & 4.4. Resolution Workers to SQLite

Tests for `DirectoryResolutionWorker` and `GlobalResolutionWorker` follow the same pattern as `FileAnalysisWorker`, focusing on transactional, idempotent database writes. The key difference is the data they load and save.

#### **Test Case ID: DRW-INT-01**
*   **Summary:** Verify `DirectoryResolutionWorker` loads POIs for its directory and saves new intra-directory relationships.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_drw_int_01.js` exists and implements this logic.

#### **Test Case ID: GRW-INT-01**
*   **Summary:** Verify `GlobalResolutionWorker` loads directory-level summaries and saves new inter-directory relationships.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_grw_int_01.js` exists and implements this logic.

---

### 4.5. TransactionalOutboxPublisher to Queues

**Component Under Test:** `TransactionalOutboxPublisher`

**AI Verifiable End Result Targeted:** Verification of a reliable, decoupled event publishing mechanism from the database.

#### **Test Case ID: TOP-INT-01**
*   **Summary:** Verify a 'PENDING' event in the `outbox` table is published to the correct BullMQ queue.
*   **Interaction to Test:** The call to `queue.add()` and the subsequent `UPDATE` to the outbox table.
*   **Collaborators to Mock:** `sqliteDb`, `queueManager`.
*   **Test Steps:**
    1.  Mock `sqliteDb.prepare` to return a 'PENDING' event on the first call, and an empty array on subsequent calls.
    2.  Spy on the `add` method of the mock queue returned by `queueManager`.
    3.  Spy on the `run` method of the mock statement returned for the `UPDATE` query.
    4.  Instantiate and start `TransactionalOutboxPublisher`.
    5.  Wait for the polling interval to pass.
*   **Expected Observable Outcome:**
    *   The `queue.add()` spy is called with the correct job type and payload from the event.
    *   The `UPDATE` statement's `run` spy is called with `status = 'PUBLISHED'` and the correct event ID.
*   **Recursive Testing Scope:** Tier 2 (`@integration`) - This test benefits from a real DB and Redis instance.
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_top_int_01.js` exists and implements this logic.

#### **Test Case ID: TOP-INT-02**
*   **Summary:** Verify a failed queueing attempt marks the outbox event as 'FAILED'.
*   **Interaction to Test:** The `UPDATE` call after a queueing error.
*   **Collaborators to Mock:** `sqliteDb`, `queueManager`.
*   **Test Steps:**
    1.  Mock `sqliteDb.prepare` to return a 'PENDING' event.
    2.  Configure the mock `queue.add()` method to throw an error.
    3.  Spy on the `run` method of the mock statement for the `UPDATE` query.
    4.  Instantiate and start `TransactionalOutboxPublisher`.
    5.  Wait for the polling interval.
*   **Expected Observable Outcome:** The `UPDATE` statement's `run` spy is called with `status = 'FAILED'` and the correct event ID.
*   **Recursive Testing Scope:** Tier 2 (`@integration`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_top_int_02.js` exists and implements this logic.

---

### 4.6. GraphBuilder to Neo4j

**Component Under Test:** `GraphBuilder`

**AI Verifiable End Result Targeted:** Task 4.2 (Validate Final Graph Integrity).

#### **Test Case ID: GB-INT-01**
*   **Summary:** Verify `GraphBuilder.run()` reads from SQLite and executes the correct Cypher query in Neo4j.
*   **Interaction to Test:** The call to `neo4jSession.run()`.
*   **Collaborators to Mock:** `sqliteDb` (to provide validated relationship data), `neo4jDriver`.
*   **Test Steps:**
    1.  Mock `sqliteDb.prepare.iterate` to yield a set of test relationship rows.
    2.  Mock the `neo4jDriver` to return a mock session, and spy on the session's `run` method.
    3.  Instantiate and call `GraphBuilder.run()`.
*   **Expected Observable Outcome:** The `session.run` spy is called. The first argument to the spy is a Cypher query string (`UNWIND ... MERGE ...`) and the second argument is an object containing the batch of relationships from SQLite.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_gb_int_01.js` exists and implements this logic.

#### **Test Case ID: GB-INT-02**
*   **Summary:** Verify the `GraphBuilder` process is idempotent.
*   **Interaction to Test:** The Cypher query string.
*   **Collaborators to Mock:** `sqliteDb`, `neo4jDriver`.
*   **Test Steps:**
    1.  Same setup as GB-INT-01.
    2.  Instantiate and call `GraphBuilder.run()`.
*   **Expected Observable Outcome:** The Cypher query passed to `session.run` uses `MERGE`, not `CREATE`, ensuring that re-running the build does not create duplicate nodes or relationships.
*   **Recursive Testing Scope:** Tier 1 (`@interaction`).
*   **AI Verifiable Completion Criterion:** A passing automated test named `test_gb_int_02.js` exists and implements this logic.