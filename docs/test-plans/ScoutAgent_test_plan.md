# Granular Test Plan-- ScoutAgent

## 1. Introduction

This document provides a detailed test plan for the `ScoutAgent` feature. The `ScoutAgent` is a stateful service responsible for scanning a target code repository, identifying changes since its last run (new, modified, deleted, and renamed files), and populating a central SQLite database with tasks for downstream processing.

This plan adheres to the London School of TDD, focusing on interaction-based testing of individual components by mocking their collaborators. It also defines a comprehensive recursive (regression) testing strategy to ensure long-term stability. Every test case is designed to be AI-verifiable, targeting specific, observable outcomes that align with the AI Verifiable End Results defined in the [`docs/ProjectMasterPlan.md`](../ProjectMasterPlan.md).

## 2. Test Scope

The primary goal of these tests is to verify that the `ScoutAgent` correctly translates the state of a file system repository into a set of discrete, actionable tasks within the central SQLite database.

**AI Verifiable End Results Targeted:**

1.  **Correct Population of `work_queue`:** For every new or modified source file detected, a corresponding 'pending' task must be created in the `work_queue` table.
2.  **Correct Population of `refactoring_tasks`:** For every deleted or renamed file, a corresponding 'DELETE' or 'RENAME' task must be created in the `refactoring_tasks` table.
3.  **Accurate State Persistence:** After a successful run, the agent's internal state representation (`file_state` table) must be updated to reflect the `currentState` of the repository, ensuring the next run operates on the correct baseline.
4.  **Transactional Integrity:** All database modifications related to a single scan must occur within a single, atomic transaction. A failure at any point must result in a complete rollback, leaving the database unmodified.

## 3. Test Strategy

### 3.1. Testing Approach (London School of TDD)

We will employ an "outside-in," interaction-based testing approach, consistent with the London School of TDD. The `ScoutAgent`'s internal components, as defined in [`docs/architecture/ScoutAgent_architecture.md`](../architecture/ScoutAgent_architecture.md) (`State Loader`, `Repository Scanner`, `Change Analyzer`, `Queue Populator`, `State Persistor`), will be treated as the units under test (UUT).

Instead of asserting the final state of the UUT, our tests will verify the **messages** (interactions) it sends to its collaborators. These collaborators will be replaced with test doubles (mocks) that record the interactions they receive.

-   **Unit Under Test (UUT):** A logical component of the `ScoutAgent` (e.g., `Change Analyzer`).
-   **Collaborators:** External dependencies like the file system and the database connection.
-   **Test Doubles (Mocks):** Mock implementations of the collaborators (`MockFileSystem`, `MockDatabaseConnector`) that we can configure and inspect.
-   **Observable Outcome:** The test succeeds if the UUT sends the expected sequence of calls to its mocked collaborators (e.g., "assert that `MockDatabaseConnector.execute()` was called with the correct SQL for a `RENAME` task").

This approach ensures that our tests are decoupled from the implementation details of the components, focusing instead on their observable behavior and their role within the system.

### 3.2. Recursive Testing (Regression) Strategy

A multi-layered regression strategy will be implemented to provide fast feedback while ensuring broad coverage. Tests will be tagged to run in different scopes.

-   **Triggers for Regression:**
    -   **On Commit:** A subset of fast-running tests will be executed on every commit to the main development branch.
    -   **Nightly Build:** The full regression suite will run every night.
    -   **Release Candidate:** The full regression suite must pass before a new version is released.
    -   **Bug Fix:** When a bug is fixed, a new regression test that captures the bug's scenario will be added.

-   **Test Suite Tags & Scopes:**
    -   `@unit`: Tests for a single, isolated component (e.g., testing the `Change Analyzer` logic with pre-canned state maps). These are extremely fast and run on every local save or pre-commit hook.
    -   `@integration`: Tests that verify the collaboration between multiple `ScoutAgent` components (e.g., ensuring the `Repository Scanner`'s output is correctly processed by the `Change Analyzer` and `Queue Populator`). These run on every commit.
    -   `@smoke`: A small, critical-path suite that verifies the most common and important scenarios (e.g., first-time scan, detecting one new file). This suite is part of the commit build.
    -   `@full`: The entire suite of tests, including all edge cases and error conditions. This runs nightly and before releases.

## 4. Test Environment and Mocked Collaborators

The test environment will not require a real file system or a live database. All external dependencies will be mocked.

### 4.1. MockFileSystem

-   **Purpose:** To simulate a file system directory structure in memory.
-   **Configuration:** Can be set up with a specific layout of files and directories, each with defined content.
-   **Functionality:** Allows for simulating file creation, modification (by changing content), deletion, and renaming between test runs. It will also track which files were accessed.

### 4.2. MockDatabaseConnector

-   **Purpose:** To act as a stand-in for a real SQLite database connection.
-   **Configuration:** Can be pre-loaded with data to simulate a `previousState` (e.g., returning a specific set of rows for a `SELECT` query on the `file_state` table).
-   **Functionality:**
    -   Records all SQL queries (`SELECT`, `INSERT`, `DELETE`, `UPDATE`) sent to it, including the parameters.
    -   Allows tests to assert that specific queries were executed in the correct order.
    -   Tracks transaction boundaries (`BEGIN`, `COMMIT`, `ROLLBACK`), enabling tests to verify transactional integrity.

## 5. Granular Test Cases

These test cases are derived directly from the TDD anchors in [`docs/pseudocode/ScoutAgent.md`](../pseudocode/ScoutAgent.md).

### 5.1. Test Suite-- Initial Repository Scan (First Run)

**Objective:** Verify the agent's behavior when run against a repository for the first time.

---

**Test Case ID:** SCOUT-001
-   **Title:** Agent successfully processes an empty directory on the first run.
-   **AI Verifiable End Result:** Correctly populates an empty state and queues no tasks.
-   **UUT:** `ScoutAgent` (main orchestration logic).
-   **Collaborators to Mock:** `MockFileSystem`, `MockDatabaseConnector`.
-   **Setup:**
    -   `MockFileSystem` is configured to be an empty directory.
    -   `MockDatabaseConnector` is configured to return an empty result set for the `SELECT FROM file_state` query.
-   **Test Steps:** Execute the main `ScoutAgent` function.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received a `BEGIN TRANSACTION` call.
    2.  Assert `MockDatabaseConnector` received a `SELECT ... FROM file_state` query.
    3.  Assert `MockDatabaseConnector` did **not** receive any `INSERT` calls for `work_queue` or `refactoring_tasks`.
    4.  Assert `MockDatabaseConnector` received a `DELETE FROM file_state` call.
    5.  Assert `MockDatabaseConnector` received a `COMMIT TRANSACTION` call.
-   **Regression Scope:** `@integration`, `@smoke`, `@full`

---

**Test Case ID:** SCOUT-002
-   **Title:** Agent processes a repository with several new files on the first run.
-   **AI Verifiable End Result:** Correctly queues all discovered files for analysis.
-   **UUT:** `ScoutAgent` (main orchestration logic).
-   **Collaborators to Mock:** `MockFileSystem`, `MockDatabaseConnector`.
-   **Setup:**
    -   `MockFileSystem` contains `file1.js` and `src/file2.js`.
    -   `MockDatabaseConnector` is configured for a first run (returns no previous state).
-   **Test Steps:** Execute the main `ScoutAgent` function.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received `INSERT` calls into `work_queue` for both `file1.js` and `src/file2.js`, with `status = 'pending'`.
    2.  Assert `MockDatabaseConnector` received `INSERT` calls into `file_state` for both files with their correct content hashes.
    3.  Assert all database operations were wrapped in a transaction (`BEGIN`/`COMMIT`).
-   **Regression Scope:** `@integration`, `@smoke`, `@full`

---

**Test Case ID:** SCOUT-003
-   **Title:** Agent correctly ignores files and directories based on exclusion patterns.
-   **AI Verifiable End Result:** Non-source code files are not added to the `work_queue`.
-   **UUT:** `RepositoryScanner` component.
-   **Collaborators to Mock:** `MockFileSystem`.
-   **Setup:** `MockFileSystem` contains `src/app.js`, `node_modules/lib.js`, `README.md`, and `app.test.js`.
-   **Test Steps:** Call the `scanRepository` function.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert the returned `currentState` map contains an entry for `src/app.js`.
    2.  Assert the returned `currentState` map does **not** contain entries for `node_modules/lib.js`, `README.md`, or `app.test.js`.
-   **Regression Scope:** `@unit`, `@smoke`, `@full`

### 5.2. Test Suite-- Incremental Updates

**Objective:** Verify the agent correctly detects and queues changes in subsequent runs.

---

**Test Case ID:** SCOUT-004
-   **Title:** Agent correctly identifies and queues a single new file.
-   **AI Verifiable End Result:** A new file results in a single `work_queue` task.
-   **UUT:** `ChangeAnalyzer` and `QueuePopulator` components.
-   **Collaborators to Mock:** `MockDatabaseConnector`.
-   **Setup:**
    -   `previousState` map contains `{ 'a.js'-- 'hash1' }`.
    -   `currentState` map contains `{ 'a.js'-- 'hash1', 'b.js'-- 'hash2' }`.
-   **Test Steps:** Call `analyzeChanges`, then `populateQueues` with the result.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received one `INSERT` into `work_queue` for `b.js`.
    2.  Assert `MockDatabaseConnector` received no other task insertions.
-   **Regression Scope:** `@unit`, `@integration`, `@smoke`, `@full`

---

**Test Case ID:** SCOUT-005
-   **Title:** Agent correctly identifies and queues a single modified file.
-   **AI Verifiable End Result:** A modified file results in a single `work_queue` task.
-   **UUT:** `ChangeAnalyzer` and `QueuePopulator` components.
-   **Collaborators to Mock:** `MockDatabaseConnector`.
-   **Setup:**
    -   `previousState` map contains `{ 'a.js'-- 'hash1' }`.
    -   `currentState` map contains `{ 'a.js'-- 'hash2_modified' }`.
-   **Test Steps:** Call `analyzeChanges`, then `populateQueues` with the result.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received one `INSERT` into `work_queue` for `a.js`.
-   **Regression Scope:** `@unit`, `@integration`, `@smoke`, `@full`

---

**Test Case ID:** SCOUT-006
-   **Title:** Agent correctly identifies and queues a single deleted file.
-   **AI Verifiable End Result:** A deleted file results in a single `DELETE` task.
-   **UUT:** `ChangeAnalyzer` and `QueuePopulator` components.
-   **Collaborators to Mock:** `MockDatabaseConnector`.
-   **Setup:**
    -   `previousState` map contains `{ 'a.js'-- 'hash1', 'b.js'-- 'hash2' }`.
    -   `currentState` map contains `{ 'a.js'-- 'hash1' }`.
-   **Test Steps:** Call `analyzeChanges`, then `populateQueues` with the result.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received one `INSERT` into `refactoring_tasks` with `task_type='DELETE'` and `old_path='b.js'`.
-   **Regression Scope:** `@unit`, `@integration`, `@smoke`, `@full`

---

**Test Case ID:** SCOUT-007
-   **Title:** Agent correctly identifies and queues a single renamed file.
-   **AI Verifiable End Result:** A renamed file results in a single `RENAME` task.
-   **UUT:** `ChangeAnalyzer` and `QueuePopulator` components.
-   **Collaborators to Mock:** `MockDatabaseConnector`.
-   **Setup:**
    -   `previousState` map contains `{ 'old_name.js'-- 'hash123' }`.
    -   `currentState` map contains `{ 'new_name.js'-- 'hash123' }`.
-   **Test Steps:** Call `analyzeChanges`, then `populateQueues` with the result.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received one `INSERT` into `refactoring_tasks` with `task_type='RENAME'`, `old_path='old_name.js'`, and `new_path='new_name.js'`.
    2.  Assert **no** tasks were created in `work_queue`. The `GraphIngestorAgent` will handle the rename; the file does not need re-analysis.
-   **Regression Scope:** `@unit`, `@integration`, `@smoke`, `@full`

---

**Test Case ID:** SCOUT-008
-   **Title:** Agent correctly handles a run with no file changes.
-   **AI Verifiable End Result:** No tasks are queued if the repository state is unchanged.
-   **UUT:** `ChangeAnalyzer` and `QueuePopulator` components.
-   **Collaborators to Mock:** `MockDatabaseConnector`.
-   **Setup:**
    -   `previousState` map is `{ 'a.js'-- 'hash1' }`.
    -   `currentState` map is `{ 'a.js'-- 'hash1' }`.
-   **Test Steps:** Call `analyzeChanges`, then `populateQueues` with the result.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received **no** `INSERT` calls for either `work_queue` or `refactoring_tasks`.
-   **Regression Scope:** `@unit`, `@integration`, `@smoke`, `@full`

### 5.3. Test Suite-- Error Handling and Resilience

**Objective:** Verify the agent's robustness in the face of external failures.

---

**Test Case ID:** SCOUT-009
-   **Title:** Agent correctly rolls back DB transaction on failure during queue population.
-   **AI Verifiable End Result:** The database is left in its original state if a failure occurs mid-transaction.
-   **UUT:** `ScoutAgent` (main orchestration logic).
-   **Collaborators to Mock:** `MockFileSystem`, `MockDatabaseConnector`.
-   **Setup:**
    -   `MockFileSystem` is set up with a new file, `a.js`.
    -   `MockDatabaseConnector` is configured to throw a `DatabaseException` on the second `INSERT` call it receives.
-   **Test Steps:** Execute the main `ScoutAgent` function.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert `MockDatabaseConnector` received a `BEGIN TRANSACTION` call.
    2.  Assert `MockDatabaseConnector` received at least one `INSERT` call.
    3.  Assert `MockDatabaseConnector` received a `ROLLBACK TRANSACTION` call.
    4.  Assert `MockDatabaseConnector` did **not** receive a `COMMIT TRANSACTION` call.
-   **Regression Scope:** `@integration`, `@full`

---

**Test Case ID:** SCOUT-010
-   **Title:** Agent skips an unreadable file and continues the scan.
-   **AI Verifiable End Result:** A single file-access error does not halt the entire process.
-   **UUT:** `RepositoryScanner` component.
-   **Collaborators to Mock:** `MockFileSystem`.
-   **Setup:**
    -   `MockFileSystem` contains `readable.js` and `unreadable.js`.
    -   The mock is configured to throw a `FileAccessException` when `unreadable.js` is accessed.
-   **Test Steps:** Call the `scanRepository` function.
-   **Observable Outcome & Verification Criteria (AI-Verifiable):**
    1.  Assert the returned `currentState` map contains an entry for `readable.js`.
    2.  Assert the returned `currentState` map does **not** contain an entry for `unreadable.js`.
    3.  Assert the function completes without throwing an exception.
-   **Regression Scope:** `@unit`, `@full`