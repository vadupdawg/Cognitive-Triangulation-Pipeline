# Granular Test Plan- Optimized Event-Driven Architecture

## 1. Introduction and Scope

This document provides a detailed test plan for the **Optimized Event-Driven Architecture**, as specified in the [`High-Performance_Pipeline_Architecture_v2.md`](../../architecture/High-Performance_Pipeline_Architecture_v2.md) document. The primary goal of this plan is to define a set of granular integration and end-to-end tests to validate the functionality, reliability, and correctness of each component and the data flow between them.

The tests outlined here are designed to be executed in a live environment that mirrors production, verifying outcomes by inspecting the state of actual system components (e.g., message queues, databases, caches) rather than using mocks.

## 2. Test Strategy

The testing strategy focuses on integration and end-to-end validation.

-   **Integration Testing**: Each component will be tested individually, but in the context of its direct collaborators. For example, testing the `EntityScout` involves verifying that the correct jobs are created in a live BullMQ instance.
-   **No Mocking Policy**: In adherence to project guidelines for integration testing, these tests will not use mocks for external systems like BullMQ, Redis, or Neo4j. The test environment must provide live instances of these services.
-   **Data-Driven Validation**: Tests will be structured around creating a specific initial state (e.g., a set of files and directories), executing a component, and then asserting the resulting state of the system (e.g., queue contents, database records).
-   **AI Verifiable Outcomes**: Each test case is designed to have a clear, binary (pass/fail) outcome that can be programmatically verified, such as checking for the existence of a specific job ID in a queue or a record in a database.

## 3. Test Environment Setup

A dedicated test environment is required to execute these tests without impacting development or production systems.

-   **File System**: A temporary directory structure that can be created, populated with test files, and torn down for each test run.
-   **BullMQ/Redis**: A dedicated Redis instance for BullMQ to manage job queues (`master-flow`, `analyze-file`, etc.). The queues should be cleared before each test run.
-   **Redis (State Store)**: A Redis instance for use by the `AggregationService` and `GlobalResolutionWorker` for state management (e.g., directory progress, summary caching). The relevant keys should be cleared before each test run.
-   **Neo4j Database**: A dedicated Neo4j instance. The database should be cleared before each test suite runs to ensure a clean slate.
-   **Test Runner**: A test framework (like Jest) capable of orchestrating the test steps, including environment setup and teardown.

---

## 4. Component Test Cases

### 4.1. `EntityScout` Producer

**Objective**: Verify the `EntityScout` correctly scans directories and creates the master flow and child jobs.

**Test Setup**:
-   Create a temporary directory structure (e.g., `/tmp/test-run-1/`).
-   Populate it with a mix of files and subdirectories.
    -   `/tmp/test-run-1/dir-A/file1.txt`
    -   `/tmp/test-run-1/dir-A/file2.txt`
    -   `/tmp/test-run-1/dir-B/file3.txt`
    -   `/tmp/test-run-1/dir-C/` (empty directory)

---

**ES-01: Verify Master Flow Job Creation**
-   **Objective**: Ensure a single master flow job is created for the entire run.
-   **Steps**:
    1.  Run the `EntityScout` component targeting `/tmp/test-run-1/`.
-   **Expected Outcome**:
    1.  One job is present in the `file-analysis-queue` with a name like `master-analysis-flow--...`.
    2.  This job has a `children` property in its data.
-   **TDD Anchor**: `TEST_RUN_CREATES_MASTER_FLOW`

---

**ES-02: Verify Child Job Creation for All Files**
-   **Objective**: Ensure an `analyze-file` child job is created for every file in the nested structure.
-   **Steps**:
    1.  Run `EntityScout` targeting `/tmp/test-run-1/`.
-   **Expected Outcome**:
    1.  The master flow job has exactly 3 child jobs.
    2.  Each child job has the name `analyze-file`.
-   **TDD Anchor**: `TEST_RUN_CREATES_CHILD_JOBS`

---

**ES-03: Verify Child Job Payload Correctness**
-   **Objective**: Ensure each child job payload contains the correct file path, directory path, and total file count for its directory.
-   **Steps**:
    1.  Run `EntityScout` targeting `/tmp/test-run-1/`.
    2.  Inspect the data of each child job.
-   **Expected Outcome**:
    1.  A job exists with `filePath` ending in `dir-A/file1.txt`, `directoryPath` ending in `dir-A`, and `totalFilesInDir` equal to 2.
    2.  A job exists with `filePath` ending in `dir-A/file2.txt`, `directoryPath` ending in `dir-A`, and `totalFilesInDir` equal to 2.
    3.  A job exists with `filePath` ending in `dir-B/file3.txt`, `directoryPath` ending in `dir-B`, and `totalFilesInDir` equal to 1.
-   **TDD Anchors**: `TEST_RUN_CHILD_JOBS_HAVE_CORRECT_DATA`, `TEST_RUN_CHILD_JOBS_HAVE_DIR_FILE_COUNT`

---

**ES-04: Edge Case - Empty and No-File Directories**
-   **Objective**: Verify the system handles empty directories gracefully.
-   **Steps**:
    1.  Run `EntityScout` targeting `/tmp/test-run-1/`.
-   **Expected Outcome**:
    1.  No child jobs are created for `dir-C`.
    2.  The total child job count remains 3.
-   **TDD Anchor**: `TEST_RUN_HANDLES_EMPTY_DIRECTORY`

---

**ES-05: Edge Case - I/O Error during Scan**
-   **Objective**: Verify the system handles read errors without crashing.
-   **Steps**:
    1.  Set permissions on a subdirectory inside `/tmp/test-run-1/` to be unreadable by the test process.
    2.  Run `EntityScout`.
-   **Expected Outcome**:
    1.  The `EntityScout` process logs an error and exits gracefully or completes the run for readable directories.
    2.  The system does not crash.
-   **TDD Anchor**: `TEST_RUN_HANDLES_FILE_SCAN_ERROR`

---

### 4.2. `FileAnalysisWorker`

**Objective**: Verify the worker correctly consumes jobs and produces `file-analysis-completed` events.

---

**FAW-01: Correctly Consume Job and Publish Event**
-   **Objective**: Ensure a valid `analyze-file` job is processed and a corresponding event is published.
-   **Preconditions**:
    1.  Manually add one `analyze-file` job to the `file-analysis-queue`. The job payload should contain a path to a real, readable file.
-   **Steps**:
    1.  Run the `FileAnalysisWorker`.
-   **Expected Outcome**:
    1.  The `analyze-file` job is removed from the input queue.
    2.  A new job is added to the `file-analysis-completed-queue`.
    3.  The new job's payload contains `points_of_interest`, `relationships`, and a `confidence_score`.
-   **TDD Anchor**: `TEST--process_file_analysis_job--Should successfully process a valid job...`

---

**FAW-02: Handle File Not Found Error**
-   **Objective**: Ensure the worker handles cases where the file specified in the job does not exist.
-   **Preconditions**:
    1.  Manually add an `analyze-file` job to the queue with a `filePath` that does not exist.
-   **Steps**:
    1.  Run the `FileAnalysisWorker`.
-   **Expected Outcome**:
    1.  The job is removed from the input queue.
    2.  An error is logged indicating the file was not found.
    3.  No event is published to the `file-analysis-completed-queue`.
    4.  The worker does not crash.
-   **TDD Anchor**: `TEST--process_file_analysis_job--Should handle errors during file reading.`

---

**FAW-03: Handle Malformed Job Data**
-   **Objective**: Ensure the worker handles jobs with missing or invalid data.
-   **Preconditions**:
    1.  Manually add an `analyze-file` job to the queue with a payload missing the `filePath` property.
-   **Steps**:
    1.  Run the `FileAnalysisWorker`.
-   **Expected Outcome**:
    1.  The malformed job is removed from the input queue (or moved to a dead-letter queue).
    2.  An error is logged about the invalid job structure.
    3.  The worker does not crash.
-   **TDD Anchor**: `TEST--process_file_analysis_job--Should handle jobs with missing or invalid data...`

---

### 4.3. `AggregationService`

**Objective**: Verify the service correctly tracks directory progress and publishes a summary event only upon completion.

---

**AS-01: Atomic State Initialization and Update**
-   **Objective**: Test that directory state is created and updated correctly in Redis.
-   **Preconditions**:
    1.  Ensure Redis is clean for the target directory key.
-   **Steps**:
    1.  Manually publish one `file-analysis-completed` event for a directory (e.g., `dir-A`) with `totalFiles: 2`.
    2.  Check the Redis state for `directory-progress--dir-A`.
    3.  Manually publish a second `file-analysis-completed` event for `dir-A`.
    4.  Check the Redis state again.
-   **Expected Outcome**:
    1.  After step 2, a Redis hash `directory-progress--dir-A` exists. `processedFiles` is 1, `totalFiles` is 2.
    2.  After step 4, `processedFiles` is 2.
-   **TDD Anchor**: `TEST State update`

---

**AS-02: Idempotent Event Handling**
-   **Objective**: Verify that processing the same file event twice does not corrupt the state.
-   **Preconditions**:
    1.  Publish a `file-analysis-completed` event for `dir-A/file1.txt` (`totalFiles: 2`).
-   **Steps**:
    1.  Publish the exact same event for `dir-A/file1.txt` again.
-   **Expected Outcome**:
    1.  The `processedFiles` count for `directory-progress--dir-A` remains 1.
    2.  A warning is logged for the duplicate event.
-   **TDD Anchor**: `TEST Idempotency`

---

**AS-03: Publish Summary Event on Completion**
-   **Objective**: Ensure the `directory-summary-created` event is published only when all files are processed.
-   **Preconditions**:
    1.  Publish a `file-analysis-completed` event for `dir-A/file1.txt` (`totalFiles: 2`).
-   **Steps**:
    1.  Check that no `directory-summary-created` event has been published.
    2.  Publish a `file-analysis-completed` event for `dir-A/file2.txt` (`totalFiles: 2`).
-   **Expected Outcome**:
    1.  After step 1, the `directory-summary-created` queue is empty.
    2.  After step 2, a `directory-summary-created` event is published to its queue.
    3.  The event payload contains the `directoryPath` and a `summaryPrompt`.
-   **TDD Anchor**: `TEST Completion check (complete)`

---

**AS-04: State Cleanup After Completion**
-   **Objective**: Verify the Redis state for a directory is deleted after it's fully processed.
-   **Preconditions**:
    1.  Process all files for a directory as in AS-03.
-   **Steps**:
    1.  Wait for the `directory-summary-created` event to be published.
    2.  Check Redis for the state key `directory-progress--dir-A`.
-   **Expected Outcome**:
    1.  The key `directory-progress--dir-A` no longer exists in Redis.
-   **TDD Anchor**: `TEST State cleanup`

---

### 4.4. `GlobalResolutionWorker`

**Objective**: Verify the worker correctly caches summaries and identifies global relationship candidates.

---

**GRW-01: Correctly Cache Directory Summaries**
-   **Objective**: Ensure directory summaries are cached upon receipt.
-   **Preconditions**:
    1.  The worker's internal cache (or Redis cache) is empty.
-   **Steps**:
    1.  Manually publish a `directory-summary-created` event.
-   **Expected Outcome**:
    1.  The worker's cache now contains the summary from the event.
-   **TDD Anchor**: `Test that the new summary is successfully added to the stateCache after processing.`

---

**GRW-02: Identify and Publish Global Relationship Candidate**
-   **Objective**: Verify a candidate event is published when commonalities are found.
-   **Preconditions**:
    1.  Publish a `directory-summary-created` event for `summaryA` containing a file with entity `commonFunc`.
    2.  Ensure it is cached.
-   **Steps**:
    1.  Publish a `directory-summary-created` event for `summaryB` (from a different directory) also containing a file with entity `commonFunc`.
-   **Expected Outcome**:
    1.  A `global-relationship-candidate` event is published.
    2.  The event payload contains a deterministic `relationship_id`.
    3.  The payload identifies the source and target nodes and the `linking_element` as `commonFunc`.
-   **TDD Anchor**: `Test that a global-relationship-candidate event is published for each found candidate.`

---

**GRW-03: Deterministic `relationship_id` Generation**
-   **Objective**: Ensure the `relationship_id` is the same regardless of event order.
-   **Steps**:
    1.  **Run 1**: Publish `summaryA` then `summaryB`. Capture the `relationship_id` from the resulting event.
    2.  Clear the system state (cache, queues).
    3.  **Run 2**: Publish `summaryB` then `summaryA`. Capture the `relationship_id`.
-   **Expected Outcome**:
    1.  The `relationship_id` from Run 1 is identical to the `relationship_id` from Run 2.
-   **TDD Anchor**: `TEST that the deterministic ID is generated correctly.`

---

### 4.5. `ValidationWorker`

**Objective**: Verify the worker correctly persists evidence, tracks state, and publishes validated relationships.

---

**VW-01: Persist Evidence and Create Validation State**
-   **Objective**: Ensure the first piece of evidence for a relationship is saved and a state object is created.
-   **Preconditions**:
    1.  The `evidences` and `validation_states` tables/collections are empty for the target `relationship_id`.
-   **Steps**:
    1.  Publish a `file-analysis-completed` event.
-   **Expected Outcome**:
    1.  A record for this evidence is created in the evidence store.
    2.  A `RelationshipValidationState` record is created for the corresponding `relationship_id`.
    3.  The state's `received_evidence_count` is 1.
-   **TDD Anchors**: `TEST that evidence is successfully persisted...`, `TEST that the state is created correctly...`

---

**VW-02: Atomically Update Validation State**
-   **Objective**: Ensure subsequent evidence correctly increments the state counter.
-   **Preconditions**:
    1.  A validation state already exists for a `relationship_id` with `received_evidence_count: 1`.
-   **Steps**:
    1.  Publish a second piece of evidence (e.g., another `file-analysis-completed` event) for the same `relationship_id`.
-   **Expected Outcome**:
    1.  The `RelationshipValidationState` for that `relationship_id` now has `received_evidence_count: 2`.
-   **TDD Anchor**: `TEST that received_evidence_count is incremented atomically`

---

**VW-03: Publish Validated Event on Threshold Met**
-   **Objective**: Verify the `relationship-validated` event is published only when the evidence is complete and the score is sufficient.
-   **Preconditions**:
    1.  A `global-relationship-candidate` event is published, setting `expected_evidence_count` to 3. The `ValidationWorker` processes this, setting the state.
    2.  Two more pieces of evidence (`file-analysis-completed`) are published for the same `relationship_id`. All evidence has high confidence scores.
-   **Steps**:
    1.  The `ValidationWorker` processes all three events.
-   **Expected Outcome**:
    1.  A `relationship-validated` event is published to the output queue.
    2.  The payload contains the consolidated data, including the `final_confidence_score`.
-   **TDD Anchors**: `TEST that calculateAndValidateConfidence IS called...`, `TEST that a 'relationship-validated' event IS published...`

---

**VW-04: Cleanup After Processing**
-   **Objective**: Verify that all evidence and the state object are deleted after final processing.
-   **Preconditions**:
    1.  A relationship has been fully processed (either validated or rejected).
-   **Steps**:
    1.  Query the database for the `relationship_id` in the `evidences` and `validation_states` stores.
-   **Expected Outcome**:
    1.  No records are found for that `relationship_id`.
-   **TDD Anchor**: `TEST that state and evidence data are cleaned up after processing`

---

### 4.6. `GraphBuilderWorker` (Sink)

**Objective**: Verify the worker correctly consumes validated relationships and persists them to Neo4j.

---

**GBW-01: Correctly Consume Event and Create Graph Nodes/Relationships**
-   **Objective**: Ensure a valid event results in the correct graph structure.
-   **Preconditions**:
    1.  Neo4j is empty.
    2.  Publish a valid `relationship-validated` event to the queue.
-   **Steps**:
    1.  Run the `GraphBuilderWorker`.
    2.  Query Neo4j for the nodes and relationship from the event.
-   **Expected Outcome**:
    1.  The source and target nodes exist in Neo4j with the correct labels and properties.
    2.  The relationship exists between them with the correct type and properties.
    3.  The `final_confidence_score` is a property on the relationship.
-   **TDD Anchor**: `Test happy path, successful graph update.`

---

**GBW-02: Atomic MERGE Logic (Idempotency)**
-   **Objective**: Ensure processing the same event twice does not create duplicate nodes or relationships.
-   **Preconditions**:
    1.  Process an event once, as in GBW-01.
-   **Steps**:
    1.  Publish the exact same `relationship-validated` event again.
    2.  Query Neo4j.
-   **Expected Outcome**:
    1.  There is still only one source node, one target node, and one relationship between them.
    2.  The properties of the nodes and relationship are updated (if they changed, though they are identical in this test).
-   **TDD Anchor**: `Construct Cypher Query` (verifying the `MERGE` logic)

---

**GBW-03: Handle Malformed Job Data**
-   **Objective**: Ensure the worker does not crash on invalid job data.
-   **Preconditions**:
    1.  Publish a `relationship-validated` event with a malformed payload (e.g., missing `source` node).
-   **Steps**:
    1.  Run the `GraphBuilderWorker`.
-   **Expected Outcome**:
    1.  The job is removed from the queue (or sent to DLQ).
    2.  An error is logged.
    3.  The worker does not crash.
    4.  No partial data is written to Neo4j.
-   **TDD Anchor**: `Test with malformed job data...`

---

## 5. End-to-End Flow Test

**E2E-01: Full Pipeline Verification**
-   **Objective**: Trace a set of related files from discovery to final graph representation, verifying each major step.
-   **Preconditions**:
    1.  All system components are running.
    2.  All queues, caches, and databases are in a clean state.
    3.  Create a test directory with two subdirectories, each containing a file with a shared function call.
        -   `/tmp/e2e/app/service.js` (defines `calculateTax()`)
        -   `/tmp/e2e/api/handler.js` (calls `calculateTax()`)
-   **Steps & Verification**:
    1.  **Run `EntityScout`** on `/tmp/e2e`.
        -   **Verify**: Two `analyze-file` jobs are created in BullMQ.
    2.  **Wait for `FileAnalysisWorker`s to process**.
        -   **Verify**: Two `file-analysis-completed` events are in their queue.
    3.  **Wait for `AggregationService` to process**.
        -   **Verify**: Two `directory-summary-created` events are published. The Redis state keys for the directories are gone.
    4.  **Wait for `GlobalResolutionWorker` to process**.
        -   **Verify**: One `global-relationship-candidate` event is published for the `calculateTax` relationship.
    5.  **Wait for `ValidationWorker` to process**.
        -   **Verify**: The evidence and state stores are populated and then cleared. A `relationship-validated` event is published.
    6.  **Wait for `GraphBuilderWorker` to process**.
        -   **Verify (in Neo4j)**:
            -   A node `(:File {id: '/tmp/e2e/app/service.js'})` exists.
            -   A node `(:File {id: '/tmp/e2e/api/handler.js'})` exists.
            -   A relationship `[:CALLS {linking_element: 'calculateTax', ...}]` exists between them.
-   **Expected Outcome**: The final state of the Neo4j graph correctly represents the relationship between the test files, and all intermediate queues and state stores are clean.

## 6. Recursive Testing (Regression Strategy)

To ensure ongoing stability, tests will be tagged and run based on the scope of changes.

-   **Tags**:
    -   `@smoke`: A small, critical subset of tests, including the E2E happy path (`E2E-01`) and one happy path test per component (e.g., `ES-01`, `FAW-01`, `AS-03`, `GBW-01`).
    -   `@component-entityscout`: All tests prefixed with `ES-`.
    -   `@component-fileanalysis`: All tests prefixed with `FAW-`.
    -   And so on for each component.
    -   `@e2e`: All tests prefixed with `E2E-`.

-   **Execution Triggers**:
    -   **On-Commit Hook**: Run all `@smoke` tests. This provides a rapid check (under 1 minute) that core functionality is not broken.
    -   **Pull Request/Pre-Merge**: If changes are isolated to one component (e.g., only files in `src/workers/validationWorker/` are modified), run `@smoke` and all tests for that component (e.g., `@component-validation`). If changes are broad, run all tests.
    -   **Nightly Build**: Run the entire test suite, including all component and E2E tests. This catches regressions in less common paths and interactions between components.