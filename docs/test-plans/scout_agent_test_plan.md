# Granular Test Plan-- ScoutAgent (Production-Focused)

## 1. Introduction and Scope

This document provides a detailed, production-focused test plan for the `ScoutAgent` feature. It is designed to guide the `tester-tdd-master` in implementing a robust test suite.

**CRITICAL CONSTRAINT-- NO MOCKING POLICY**

As per the [`Mutual_Understanding_Document.md`](docs/Mutual_Understanding_Document.md:1), this project adheres to a strict **"NO MOCKING"** policy. All tests must be executed against the live `polyglot-test` environment. This means--
-   Tests will interact with the real SQLite database (`db.sqlite`).
-   Tests will scan the actual file system within the [`polyglot-test/`](polyglot-test/) directory.
-   The focus is on **state verification**, not interaction testing. We will verify the observable side effects (i.e., database records, file system state) of running the agent.

**Test Scope**

The primary goal of this test plan is to verify the AI-Verifiable End Result for Phase 1 of the project, as defined in the [`primary_project_planning_document.md`](docs/primary_project_planning_document.md:1)--

> The `ScoutAgent`, when run, populates the `files` table in the SQLite database with exactly **15** records, corresponding to the files in the `polyglot-test/` directory. This is verifiable with the SQL query `SELECT count(*) FROM files;`.

## 2. Test Environment and Prerequisites

-   **Database**: A live, initialized SQLite database instance located at the project root (`db.sqlite`). The schema must conform to [`docs/specifications/database_schema_specs.md`](docs/specifications/database_schema_specs.md).
-   **Test Directory**: The [`polyglot-test/`](polyglot-test/) directory, which serves as the live repository for scanning.
-   **Test Setup Functionality**: Before each test run, a setup routine MUST be executed to ensure a clean state--
    1.  **Clean Database**: All records from the `files` table in `db.sqlite` must be deleted.
    2.  **Consistent File System**: The [`polyglot-test/`](polyglot-test/) directory should be in its pristine, checked-in state. If tests involve creating/deleting files, they must clean up after themselves.

**AI-Verifiable Completion Criterion**: A helper function `beforeEachTest()` is created that successfully truncates the `files` table in `db.sqlite`.

## 3. Test Strategy (State-Verification Integration Testing)

This plan replaces interaction-based testing with a **State-Verification** approach. The strategy is as follows--

1.  **Arrange**: Set the system to a known state (e.g., clean database, specific file structure in `polyglot-test`).
2.  **Act**: Instantiate and run the `ScoutAgent` and its methods using the real database connection and file system path.
3.  **Assert**: Verify the outcome by directly querying the live SQLite database and inspecting the results.

This ensures that tests validate the agent's behavior in a context that is as close to production as possible, directly fulfilling the "NO MOCKING" requirement.

## 4. Test Cases

### 4.1. `constructor(db, repoPath)`

-   **Objective**: Verify that the constructor correctly initializes the agent with a database connection and the repository path.
-   **Target AI-Verifiable Result**: Foundational setup for Task 1.2.
-   **Setup**:
    -   An initialized SQLite database client.
    -   A string path to the `polyglot-test` directory.
-   **Execution**:
    -   `const scoutAgent = new ScoutAgent(db, './polyglot-test');`
-   **Verification (AI-Verifiable)**:
    -   Assert that `scoutAgent.db` is strictly equal to the passed `db` instance.
    -   Assert that `scoutAgent.repoPath` is equal to `'./polyglot-test'`.

### 4.2. `detectLanguage(filePath)`

-   **Objective**: Verify that the language detection works correctly for all supported file types found in `polyglot-test`.
-   **Target AI-Verifiable Result**: Correct language identification, a prerequisite for accurate file cataloging.
-   **Setup**: None beyond the file paths.
-   **Execution & Verification (AI-Verifiable)**:
    -   Assert `scoutAgent.detectLanguage('test.js')` returns `'JavaScript'`.
    -   Assert `scoutAgent.detectLanguage('test.py')` returns `'Python'`.
    -   Assert `scoutAgent.detectLanguage('test.java')` returns `'Java'`.
    -   Assert `scoutAgent.detectLanguage('test.sql')` returns `'SQL'`.
    -   Assert `scoutAgent.detectLanguage('test.txt')` returns `'unknown'`.
    -   Assert `scoutAgent.detectLanguage('test')` returns `'unknown'`.

### 4.3. `calculateChecksum(content)`

-   **Objective**: Verify that the checksum calculation is correct and consistent.
-   **Target AI-Verifiable Result**: Correct checksum generation, critical for detecting file modifications.
-   **Setup**: None.
-   **Execution & Verification (AI-Verifiable)**:
    -   Assert `scoutAgent.calculateChecksum('hello world')` returns `'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'`.
    -   Assert `scoutAgent.calculateChecksum('')` returns `'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'`.
    -   Assert that two calls to `calculateChecksum` with the same content produce the same hash.
    -   Assert that two calls with different content produce different hashes.

### 4.4. `discoverFiles(directory)`

-   **Objective**: Verify the agent can recursively find all 15 source files in `polyglot-test` and ignore non-source files.
-   **Target AI-Verifiable Result**: The core file discovery logic that enables the main Phase 1 outcome.
-   **Setup**:
    -   Pristine `polyglot-test` directory.
    -   Create a temporary `node_modules` directory and a `.git` file inside `polyglot-test` to test exclusion logic.
-   **Execution**:
    -   `const files = scoutAgent.discoverFiles('./polyglot-test');`
-   **Verification (AI-Verifiable)**:
    -   Assert that the returned `files` array has a `length` of **15**.
    -   Assert that no file path in the array contains `node_modules` or `.git`.
    -   Select a sample file object from the array (e.g., for `polyglot-test/js/server.js`) and assert that its `language` is `'JavaScript'` and its `checksum` is a valid SHA-256 hash string.
-   **Cleanup**: The temporary `node_modules` and `.git` artifacts must be deleted after the test.

### 4.5. `saveFilesToDb(files)` and `run()`

-   **Objective**: Verify that the agent's main `run()` method correctly orchestrates the discovery and database insertion, achieving the primary goal of Phase 1. This test also covers `saveFilesToDb` implicitly.
-   **Target AI-Verifiable Result**: `ScoutAgent.run()` populates the database with the 15 target files.
-   **Setup**:
    -   Run the `beforeEachTest()` routine to ensure the `files` table is empty.
-   **Execution**:
    -   `const scoutAgent = new ScoutAgent(db, './polyglot-test');`
    -   `await scoutAgent.run();`
-   **Verification (AI-Verifiable)**:
    -   Execute the SQL query `SELECT count(*) as count FROM files;`.
    -   Assert that the returned `count` is **15**.
    -   Execute `SELECT * FROM files WHERE file_path LIKE '%server.js%';` and verify the record for `polyglot-test/js/server.js` exists with the correct language and a valid checksum.

### 4.6. Idempotency Test

-   **Objective**: Verify that running the agent twice does not create duplicate records and correctly updates modified files.
-   **Target AI-Verifiable Result**: Ensures the pipeline is robust and can be re-run safely.
-   **Setup**:
    -   Run the `beforeEachTest()` routine.
    -   Run `scoutAgent.run()` once to populate the database.
-   **Execution**:
    1.  Run `await scoutAgent.run();` a second time without any file changes.
    2.  Modify a file (e.g., append a comment to `polyglot-test/js/utils.js`) and get its new checksum.
    3.  Run `await scoutAgent.run();` a third time.
-   **Verification (AI-Verifiable)**:
    -   After step 1, query the DB-- `SELECT count(*) as count FROM files;`. Assert the count is **15**.
    -   After step 2, query the DB for the modified file's original checksum. Then, run the agent again. Query for the record again and assert its `checksum` has been updated to the new value and its `status` is `'pending'`. The total count should remain **15**.

## 5. Recursive Testing Strategy (Regression)

-   **Trigger**: The full `ScoutAgent` test suite must be executed automatically upon any of the following events--
    1.  Any code change is committed to [`src/agents/ScoutAgent.js`](src/agents/ScoutAgent.js).
    2.  Any change is made to the `files` table schema in [`docs/specifications/database_schema_specs.md`](docs/specifications/database_schema_specs.md) or the corresponding database initialization script.
    3.  The file structure of the `polyglot-test` directory is altered (files added, removed, or renamed).
-   **Execution**: The entire suite of tests defined in this plan should be run. Given the "no mocking" policy, these tests are integration tests by nature and provide high-confidence regression checking.
-   **AI-Verifiable Completion Criterion**: A CI/CD pipeline step (e.g., a GitHub Action) is configured to automatically trigger the test script (`run-tests.js` or similar) on pull requests targeting the `main` branch, and the job must pass before merging is allowed.