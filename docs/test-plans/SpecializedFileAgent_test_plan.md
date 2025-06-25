# Test Plan-- `SpecializedFileAgent` Logic Integration

## 1. Overview

This document provides a detailed integration test plan for the `SpecializedFileAgent` feature, which is implemented as an enhancement to the existing `EntityScout` agent. The purpose of this feature is to identify, classify, and tag special files (e.g., `package.json`, `*.config.js`) during the initial file discovery process.

This plan is specifically designed for **integration testing**, adhering to the project constraint to validate the feature against a live filesystem and a real SQLite database, without the use of mocks for these components. The tests will verify the end-to-end flow, from file detection to the correct persistence of the `special_file_type` tag in the database.

## 2. Test Scope & Objectives

### 2.1. In Scope

*   Verifying that `EntityScout` correctly identifies special files based on the patterns defined in `config/special_files.json`.
*   Verifying that the correct `special_file_type` is persisted to the `files.special_file_type` column in the SQLite database.
*   Verifying that the pattern priority order is respected (e.g., a specific filename pattern is matched before a general extension pattern).
*   Verifying that non-special files have a `NULL` value in the `special_file_type` column.
*   Verifying the functionality against a real filesystem and database instance.

### 2.2. Out of Scope

*   Unit testing the `_getSpecialFileType` method in isolation (tests will verify its logic via the integrated `EntityScout.run` method).
*   Performance testing of the `EntityScout` agent.
*   Testing the downstream consumption of the `special_file_type` tag by other agents.

### 2.3. AI Verifiable End Results Targeted

This test plan aims to validate the successful implementation of the following functional requirements from the [`docs/specifications/SpecializedFileAgent_specs.md`](docs/specifications/SpecializedFileAgent_specs.md) document--

*   **FR-1-- Special File Identification--** The agent correctly identifies files matching configured regex patterns.
*   **FR-2-- File Type Tagging--** The agent assigns the correct, predefined type upon identification.
*   **FR-3-- Database Persistence--** The assigned type is correctly saved in the `files` table.

## 3. Test Strategy

### 3.1. Testing Approach-- Integration Testing

As per project constraints, this plan deviates from a pure London School TDD approach. Instead of mocking collaborators, all tests will be **integration tests**. This involves--

1.  **Live Filesystem--** A temporary directory will be created and populated with a controlled set of test files before each test run.
2.  **Live Database--** A temporary, in-memory or file-based SQLite database will be initialized with the required schema (`files` table with the `special_file_type` column) before each test run.
3.  **End-to-End Validation--** Tests will execute the `EntityScout` agent's main `run` method, pointed at the temporary directory. Assertions will be made by directly querying the live test database to verify the state of the persisted records.

### 3.2. Recursive Testing (Regression Strategy)

To ensure ongoing stability and catch regressions early, the following recursive testing strategy will be adopted--

*   **Full Suite Execution--**
    *   **Trigger--** Automatically triggered on every Pull Request merge to the `main` branch and as part of a nightly build process.
    *   **Scope--** Executes all test cases defined in this plan.
    *   **Goal--** Provides maximum confidence and full regression coverage for the feature.

*   **Critical Path Subset (Smoke Tests)--**
    *   **Trigger--** Can be run manually by developers after significant local changes or as a pre-commit hook.
    *   **Scope--** Executes a small, fast-running subset of tests tagged with `@critical_path`. This subset will include the most important positive and negative test cases to provide a quick health check.
    *   **Goal--** To provide rapid feedback to developers without the overhead of running the full integration suite.

*   **Test Tagging--**
    *   Tests will be tagged to allow for flexible test execution.
    *   `@critical_path`-- Core functionality tests (e.g., manifest identification, non-special file handling).
    *   `@priority`-- Tests specifically for verifying the pattern priority logic.
    *   `@pattern_types`-- Tests covering each of the different defined file types (manifest, config, etc.).

## 4. Test Environment & Prerequisites

*   **Test Runner--** A testing framework like Jest or Mocha, configured to handle asynchronous operations.
*   **Test Setup/Teardown--** A global or per-suite setup mechanism (`beforeAll`, `afterAll`) is required to--
    1.  Create a temporary test directory (e.g., `./temp-test-files/`).
    2.  Create a temporary SQLite database file (e.g., `test-db.sqlite`) and apply the necessary schema migration (`ALTER TABLE files ADD COLUMN special_file_type TEXT;`).
    3.  Clean up the directory and database file after all tests complete.
*   **Configuration--** A `config/special_files.json` must be created in the test environment for the `EntityScout` agent to load its patterns from.

## 5. Test Data

### 5.1. `config/special_files.json`

The following configuration will be used for testing--

```json
{
  "patterns"-- [
    { "type"-- "manifest", "pattern"-- "^package\\.json$" },
    { "type"-- "manifest", "pattern"-- "^requirements\\.txt$" },
    { "type"-- "entrypoint", "pattern"-- "^(server--main--index--app)\\.js$" },
    { "type"-- "config", "pattern"-- "\\.config\\.js$" },
    { "type"-- "config", "pattern"-- "\\.ya?ml$" },
    { "type"-- "config", "pattern"-- "\\.json$" }
  ]
}
```

### 5.2. Test File Structure

The test setup will create the following files within the temporary test directory--

```
./temp-test-files/
-- package.json
-- server.js
-- prod.config.js
-- settings.yml
-- data.json
-- my_component.js
-- README.md
-- sub-folder/
---- nested.config.js
---- another.json
```

## 6. Integration Test Cases

### Test Suite-- `EntityScout` Special File Identification

**Pre-condition for all tests--**
1.  A temporary test directory is created.
2.  The files listed in section 5.2 are created in the test directory.
3.  A clean, temporary SQLite database is initialized with the correct schema.
4.  The `EntityScout` agent is instantiated with a configuration pointing to the test directory and test database.

**Post-condition for all tests--**
1.  The temporary directory and database are deleted.

---

**Test Case ID--** SFA-INT-001
*   **Tag--** `@critical_path`, `@priority`
*   **Title--** Should identify `package.json` as 'manifest' due to high priority.
*   **Objective--** Verify that the agent correctly identifies a high-priority, exact-match filename and ignores lower-priority generic patterns.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%package.json'` query on the test database returns a single record with the value `'manifest'`.

---

**Test Case ID--** SFA-INT-002
*   **Tag--** `@critical_path`
*   **Title--** Should classify a standard JavaScript file like `my_component.js` with a NULL type.
*   **Objective--** Verify that files not matching any pattern are correctly recorded with a `NULL` special file type.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%my_component.js'` query on the test database returns a single record with the value `NULL`.

---

**Test Case ID--** SFA-INT-003
*   **Tag--** `@pattern_types`
*   **Title--** Should identify `server.js` as 'entrypoint'.
*   **Objective--** Verify the pattern matching for the 'entrypoint' type.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%server.js'` query on the test database returns a single record with the value `'entrypoint'`.

---

**Test Case ID--** SFA-INT-004
*   **Tag--** `@pattern_types`
*   **Title--** Should identify `prod.config.js` as 'config'.
*   **Objective--** Verify a suffix-based regex pattern for the 'config' type.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%prod.config.js'` query on the test database returns a single record with the value `'config'`.

---

**Test Case ID--** SFA-INT-005
*   **Tag--** `@pattern_types`
*   **Title--** Should identify `settings.yml` as 'config'.
*   **Objective--** Verify the YAML extension pattern (`.yml` or `.yaml`).
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%settings.yml'` query on the test database returns a single record with the value `'config'`.

---

**Test Case ID--** SFA-INT-006
*   **Tag--** `@priority`
*   **Title--** Should identify generic `data.json` as 'config'.
*   **Objective--** Verify that a file matching a lower-priority generic pattern is classified correctly when no higher-priority patterns match.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%data.json'` query on the test database returns a single record with the value `'config'`.

---

**Test Case ID--** SFA-INT-007
*   **Title--** Should correctly identify special files in sub-directories.
*   **Objective--** Ensure the agent's recursive file discovery works correctly with the classification logic.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%nested.config.js'` query returns `'config'`.
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%another.json'` query returns `'config'`.

---

**Test Case ID--** SFA-INT-008
*   **Title--** Should handle files with no extension, like `README.md`, correctly.
*   **Objective--** Verify that files without extensions or with un-configured extensions are handled gracefully.
*   **Steps--**
    1.  Execute the `EntityScout.run()` method.
*   **Expected Result--**
    *   **AI Verifiable--** A `SELECT special_file_type FROM files WHERE file_path LIKE '%README.md'` query on the test database returns a single record with the value `NULL`.