# Test Plan-- SelfCleaningAgent (Integration)

## 1. Introduction and Scope

This document outlines the integration test plan for the `SelfCleaningAgent` feature. The agent is responsible for maintaining data integrity by identifying and removing database records that correspond to files deleted from the file system.

The scope of this test plan is to verify the end-to-end functionality of the agent's two-phase "mark and sweep" process. It will validate the agent's interactions with live SQLite and Neo4j databases to ensure that data is correctly marked for deletion and subsequently removed in a transactionally-safe manner.

As per the project constraints, this plan **does not involve mocking** database interactions. All tests will be conducted against live, containerized instances of SQLite and Neo4j to ensure the agent behaves as expected in a production-like environment.

## 2. Test Strategy

### 2.1. Testing Approach

The testing strategy is centered on **State-Based Verification**. Each test case will follow a sequence of--
1.  **Setup**: Initialize the test environment, including seeding the SQLite and Neo4j databases with a known set of data and creating a corresponding file structure on disk.
2.  **Action**: Execute one of the `SelfCleaningAgent`'s primary methods (`reconcile()` for the "Mark" phase or `run()` for the "Sweep" phase).
3.  **Verification**: Query the state of the databases and file system directly to verify that the outcome of the action is correct.
4.  **Teardown**: Clean the databases and file system to ensure test isolation.

### 2.2. Test Environment

-   **Databases**: Dedicated, ephemeral instances of SQLite and Neo4j will be used for the test suite. A setup script (e.g., `jest.globalSetup.js`) will manage the lifecycle of these databases.
-   **File System**: A temporary directory will serve as the `projectRoot` for the agent. Tests will programmatically create and delete files within this directory to simulate real-world conditions.
-   **Test Data**: A predefined set of test data will be used to populate the databases before each test. This includes records for files that will be deleted and files that will remain, allowing for precise validation.

### 2.3. AI-Verifiable Completion Criteria

Every test case defined in this plan concludes with an AI-verifiable criterion. This is a specific, measurable query or check that can be programmatically executed to determine the success or failure of the test. For example, "A `SELECT` query on the `files` table for a specific path MUST return zero rows."

## 3. Test Cases

### 3.1. Phase 1-- `reconcile()` (Mark Phase)

These tests verify that the agent can correctly identify orphaned database records and mark them for deletion without performing any destructive actions.

---

**Test Case ID-- SCA-TC-01**
-   **Description**: Verify that `reconcile()` correctly marks a single deleted file as `PENDING_DELETION`.
-   **Test Steps**:
    1.  **Setup**:
        -   Seed SQLite with two file records-- `file_A.js` and `file_B.js`, both with `status = 'processed'`.
        -   Seed Neo4j with corresponding `:File` nodes for `file_A.js` and `file_B.js`.
        -   Create `file_A.js` and `file_B.js` on the test file system.
    2.  **Action**: Delete `file_B.js` from the file system.
    3.  **Action**: Execute the `SelfCleaningAgent.reconcile()` method.
    4.  **Verification**:
        -   Query SQLite for the `file_B.js` record.
        -   **AI Verifiable Criterion**: The `status` column for `file_B.js` MUST be `'PENDING_DELETION'`.
        -   Query SQLite for the `file_A.js` record.
        -   **AI Verifiable Criterion**: The `status` column for `file_A.js` MUST remain `'processed'`.
        -   Query Neo4j for the nodes for `file_A.js` and `file_B.js`.
        -   **AI Verifiable Criterion**: Both nodes MUST still exist in Neo4j.

---

**Test Case ID-- SCA-TC-02**
-   **Description**: Verify that `reconcile()` does not affect records for files that still exist.
-   **Test Steps**:
    1.  **Setup**:
        -   Seed databases and file system with `file_A.js` and `file_B.js`.
    2.  **Action**: Execute the `SelfCleaningAgent.reconcile()` method without deleting any files.
    3.  **Verification**:
        -   Query SQLite for both records.
        -   **AI Verifiable Criterion**: The `status` for both `file_A.js` and `file_B.js` MUST remain `'processed'`.

---

### 3.2. Phase 2-- `run()` (Sweep Phase)

These tests verify that the agent correctly deletes marked records from both databases and handles failures gracefully.

---

**Test Case ID-- SCA-TC-03 (Happy Path)**
-   **Description**: Verify that `run()` successfully deletes a record marked as `PENDING_DELETION` from both SQLite and Neo4j.
-   **Test Steps**:
    1.  **Setup**:
        -   Seed SQLite with two file records-- `file_A.js` (`status = 'processed'`) and `file_B.js` (`status = 'PENDING_DELETION'`).
        -   Seed Neo4j with corresponding `:File` nodes for `file_A.js` and `file_B.js`.
    2.  **Action**: Execute the `SelfCleaningAgent.run()` method.
    3.  **Verification**:
        -   Query SQLite for the `file_B.js` record.
        -   **AI Verifiable Criterion**: The query MUST return zero rows.
        -   Query Neo4j for the `:File` node with `path = 'file_B.js'`.
        -   **AI Verifiable Criterion**: The query MUST return zero nodes.
        -   Query SQLite and Neo4j for `file_A.js`.
        -   **AI Verifiable Criterion**: The records for `file_A.js` MUST still exist in both databases.

---

**Test Case ID-- SCA-TC-04 (Transactional Integrity)**
-   **Description**: Verify that the SQLite record is NOT deleted if the Neo4j deletion fails.
-   **Test Steps**:
    1.  **Setup**:
        -   Seed databases as in `SCA-TC-03`.
        -   **Crucial Step**: Configure the `neo4jDriver` instance for the agent to be invalid (e.g., wrong password or address) to force a connection error during the `run` method.
    2.  **Action**: Execute the `SelfCleaningAgent.run()` method. The method is expected to throw or log an error.
    3.  **Verification**:
        -   Query SQLite for the `file_B.js` record.
        -   **AI Verifiable Criterion**: The record for `file_B.js` MUST still exist, and its `status` MUST remain `'PENDING_DELETION'`.
        -   Query Neo4j for the `file_B.js` node.
        -   **AI Verifiable Criterion**: The `:File` node for `file_B.js` MUST still exist.

---

**Test Case ID-- SCA-TC-05 (Idempotency)**
-   **Description**: Verify that running the sweep process multiple times does not cause errors.
-   **Test Steps**:
    1.  **Setup**:
        -   Seed databases as in `SCA-TC-03`.
    2.  **Action**: Execute `SelfCleaningAgent.run()` once to perform the cleanup.
    3.  **Verification**: Verify that `file_B.js` records are deleted from both databases.
    4.  **Action**: Execute `SelfCleaningAgent.run()` a second time.
    5.  **Verification**:
        -   **AI Verifiable Criterion**: The second execution MUST complete without throwing any errors.

---

### 3.3. End-to-End Test

---

**Test Case ID-- SCA-TC-06 (Full Mark and Sweep Cycle)**
-   **Description**: Verify the complete "mark and sweep" lifecycle for a deleted file.
-   **Test Steps**:
    1.  **Setup**:
        -   Seed SQLite and Neo4j with a record for `file_to_delete.js` (`status = 'processed'`).
        -   Create `file_to_delete.js` on the test file system.
    2.  **Action (Simulate Deletion)**: Delete `file_to_delete.js` from the file system.
    3.  **Action (Mark Phase)**: Execute `SelfCleaningAgent.reconcile()`.
    4.  **Verification (Mark Phase)**:
        -   Query SQLite for the `file_to_delete.js` record.
        -   **AI Verifiable Criterion**: The `status` MUST be `'PENDING_DELETION'`.
    5.  **Action (Sweep Phase)**: Execute `SelfCleaningAgent.run()`.
    6.  **Verification (Sweep Phase)**:
        -   Query SQLite for the `file_to_delete.js` record.
        -   **AI Verifiable Criterion**: The query MUST return zero rows.
        -   Query Neo4j for the `:File` node with `path = 'file_to_delete.js'`.
        -   **AI Verifiable Criterion**: The query MUST return zero nodes.

---

## 4. Recursive Testing Strategy

To ensure ongoing stability and catch regressions early, the `SelfCleaningAgent` integration test suite will be executed based on the following strategy--

-   **Execution Triggers**:
    1.  **On-Commit/On-PR**: The full test suite MUST be run automatically whenever changes are pushed to files within `src/agents/SelfCleaningAgent.js` or its direct dependencies.
    2.  **Schema Changes**: The suite MUST be run if there are any modifications to the database schema, particularly the `files` table.
    3.  **Nightly Build**: The entire suite will be included in the project's nightly or daily CI build to detect regressions caused by unrelated changes.
    4.  **Pre-Deployment**: The suite is a mandatory check before any deployment to a staging or production environment.

-   **Test Tagging**:
    -   All tests in this plan will be tagged with `@integration` and `@self-cleaning-agent`.
    -   This allows for running the suite in isolation (`npm test -- --tags=@self-cleaning-agent`) or as part of a larger integration test run.