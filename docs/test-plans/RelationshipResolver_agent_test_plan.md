# Test Plan-- `RelationshipResolver` Agent

## 1. Introduction and Scope

This document provides a detailed integration testing plan for the `RelationshipResolver` agent. The primary goal of this agent is to analyze Points of Interest (POIs) previously identified by the `EntityScout` agent and stored in a central SQLite database, in order to discover and persist the semantic relationships between them.

This test plan directly addresses the AI Verifiable End Results outlined in the [`primary_project_planning_document_sprint_2.md`](../primary_project_planning_document_sprint_2.md), specifically **Task 2.4.1-- Implement `RelationshipResolver` Agent**.

**Crucial Testing Constraint-- No Mocking:** In accordance with project directives, this plan deviates from traditional unit testing that uses mocks or stubs. All tests are designed as **integration tests** that operate on a live, temporary SQLite database. The agent's behavior will be verified by observing the final state of the database after execution, ensuring that tests validate real-world outcomes.

The scope of this plan covers--
*   Verification of the three hierarchical analysis passes-- Intra-File, Intra-Directory, and Global.
*   Validation of the end-to-end `run` method orchestration.
*   Testing the resilience and retry logic of the `_queryLlmWithRetry` method.
*   Ensuring data is correctly read from and written to the SQLite database.

---

## 2. Test Strategy

### 2.1. Overall Approach-- State-Based Integration Testing

The core strategy is to validate the `RelationshipResolver` agent's functionality by verifying its impact on a database. Each test will follow a strict "Arrange, Act, Assert" pattern--

1.  **Arrange:** A test-specific, temporary SQLite database will be prepared with a precise set of `pois` and `files` records, simulating a specific scenario (e.g., two files in one directory with interacting POIs).
2.  **Act:** An instance of the `RelationshipResolver` agent will be created and one of its methods (e.g., `_runIntraFilePass`, `run`) will be executed against the prepared database.
3.  **Assert:** After the agent's method completes, SQL queries will be executed against the database to verify that the expected `relationships` have been created. The assertions will check for the existence, source, target, type, and count of these relationships.

### 2.2. Test Environment and Data

*   **Test Database:** A fresh, temporary SQLite database instance will be created for each test case to guarantee test isolation and prevent cascading failures. A setup script will populate the database with the required schema (`files`, `pois`, `relationships` tables).
*   **Test Data Generation:** Before each test, the database will be seeded with `files` and `pois` records representing the specific conditions required for that test. This data will be crafted to trigger the logic of each analysis pass. For example, to test the Intra-Directory pass, the database will be populated with POIs from at least two different files within the same directory path.

### 2.3. AI-Verifiable Completion Criteria

The successful completion of the testing phase for each method is defined as follows--

*   **AI Verifiable Criterion:** For each test case defined in this plan, a corresponding automated test is implemented in the project's test suite. The test must pass successfully when run against the specified pre-conditions, confirming the agent's behavior produces the expected database state.

---

## 3. Recursive Testing (Regression) Strategy

A robust regression strategy is essential to maintain stability as the codebase evolves.

*   **Triggers for Re-testing:** The `RelationshipResolver` test suite will be executed automatically upon the following triggers--
    *   Any code change within the `src/agents/RelationshipResolver.js` file.
    *   Any change to the `EntityScout` agent, as it produces the input POIs for this agent.
    *   Any modification to the database schema, particularly the `files`, `pois`, or `relationships` tables.
    *   As part of the full project test suite before any deployment or merge to the main branch.

*   **Test Categorization and Tagging:** To enable flexible test execution, each test case will be tagged with one or more of the following--
    *   `@resolver`: A general tag for all tests in this suite.
    *   `@pass1`, `@pass2`, `@pass3`: Tags for tests targeting the Intra-File, Intra-Directory, and Global passes, respectively.
    *   `@run`: For tests that cover the full orchestration of the `run` method.
    *   `@resilience`: For tests specifically validating the `_queryLlmWithRetry` logic.
    *   `@happy-path`, `@edge-case`, `@failure-case`: Tags to denote the nature of the test scenario.

*   **Regression Scopes:**
    *   **Developer Local Scope:** When working on a specific method (e.g., `_runGlobalPass`), a developer should run tests with the corresponding tag (e.g., `@pass3`).
    *   **Pull Request Scope:** All tests tagged with `@resolver` must pass before a pull request can be merged.
    *   **Full System Scope:** All tests in the project are run, including this suite, during nightly builds or pre-release validation.

---

## 4. Test Cases

### 4.1. Test Cases for `_loadAndGroupPois()`

#### **Test Case ID-- RR-LG-01 (Happy Path)**
*   **Target Method:** `_loadAndGroupPois`
*   **AI Verifiable End Result Targeted:** `_loadAndGroupPois` correctly groups POIs by directory.
*   **Preconditions (Database State):**
    *   Insert 2 `files` records with `filePath` = `'dir1/fileA.js'` and `'dir1/fileB.js'`.
    *   Insert 1 `files` record with `filePath` = `'dir2/fileC.js'`.
    *   Insert associated `pois` records for each file.
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver`.
    2.  Call `_loadAndGroupPois()`.
*   **Postconditions (Verification):**
    *   The method returns a `Map`.
    *   The map contains 2 keys-- `'dir1'` and `'dir2'`.
    *   `map.get('dir1')` is an array of 2 POI objects.
    *   `map.get('dir2')` is an array of 1 POI object.
*   **Regression Scope Tag:** `@pass1`, `@happy-path`

### 4.2. Test Cases for `_runIntraFilePass()`

#### **Test Case ID-- RR-P1-01 (Happy Path)**
*   **Target Method:** `_runIntraFilePass`
*   **AI Verifiable End Result Targeted:** `_runIntraFilePass` method correctly analyzes a single `FileAnalysisReport` and produces an array of `Relationship` objects.
*   **Preconditions (Database State):**
    *   A test database is prepared.
    *   Insert 1 `files` record for `'app/service.js'`.
    *   Insert 2 `pois` records for `service.js`-- one for a function `doWork()` and one for a function `helper()` that is called by `doWork()`.
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver`.
    2.  Create a `poisInFile` array containing the two POIs.
    3.  Call `_runIntraFilePass(poisInFile)`.
    4.  Persist the returned relationships to the database.
*   **Postconditions (Verification):**
    *   Execute `SELECT COUNT(*) FROM relationships WHERE source_poi_id = 'poi_doWork_id' AND target_poi_id = 'poi_helper_id' AND type = 'CALLS'`.
    *   The expected count is 1.
*   **Regression Scope Tag:** `@pass1`, `@happy-path`

#### **Test Case ID-- RR-P1-02 (No Relationships)**
*   **Target Method:** `_runIntraFilePass`
*   **AI Verifiable End Result Targeted:** `_runIntraFilePass` handles files with no internal relationships correctly.
*   **Preconditions (Database State):**
    *   A test database is prepared.
    *   Insert 1 `files` record for `'app/config.js'`.
    *   Insert 2 `pois` records for `config.js` that do not interact with each other.
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver`.
    2.  Create a `poisInFile` array containing the two POIs.
    3.  Call `_runIntraFilePass(poisInFile)`.
*   **Postconditions (Verification):**
    *   The method returns an empty array.
    *   Execute `SELECT COUNT(*) FROM relationships`. The expected count is 0.
*   **Regression Scope Tag:** `@pass1`, `@edge-case`

### 4.3. Test Cases for `_runIntraDirectoryPass()`

#### **Test Case ID-- RR-P2-01 (Happy Path)**
*   **Target Method:** `_runIntraDirectoryPass`
*   **AI Verifiable End Result Targeted:** `_runIntraDirectoryPass` method correctly processes POIs in a directory and identifies inter-file relationships.
*   **Preconditions (Database State):**
    *   A test database is prepared.
    *   Insert `files` records for `'app/api.js'` and `'app/utils.js'`.
    *   Insert a POI for a function `processRequest` in `api.js`.
    *   Insert a POI for an exported function `calculate` in `utils.js` that is called by `processRequest`.
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver`.
    2.  Group the POIs by file into a `poisByFile` Map.
    3.  Call `_runIntraDirectoryPass('app', poisByFile)`.
    4.  Persist the returned relationships.
*   **Postconditions (Verification):**
    *   Execute `SELECT COUNT(*) FROM relationships WHERE source_poi_id = 'poi_processRequest_id' AND target_poi_id = 'poi_calculate_id'`.
    *   The expected count is 1.
    *   The returned `exports` array from the method should contain the `calculate` POI.
*   **Regression Scope Tag:** `@pass2`, `@happy-path`

### 4.4. Test Cases for `_runGlobalPass()`

#### **Test Case ID-- RR-P3-01 (Happy Path)**
*   **Target Method:** `_runGlobalPass`
*   **AI Verifiable End Result Targeted:** `_runGlobalPass` method correctly identifies cross-directory relationships using exported POIs.
*   **Preconditions (Database State):**
    *   A test database is prepared.
    *   Simulate the output of Pass 2-- create two "exported POI" lists.
    *   Exported POI 1 from `services/` directory-- a public function `authService`.
    *   Exported POI 2 from `routes/` directory-- a route handler `loginRoute` that uses `authService`.
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver`.
    2.  Create an `allDirectoryExports` Map containing the exported POIs from `services/` and `routes/`.
    3.  Call `_runGlobalPass(allDirectoryExports)`.
    4.  Persist the returned relationships.
*   **Postconditions (Verification):**
    *   Execute `SELECT COUNT(*) FROM relationships WHERE source_poi_id = 'poi_loginRoute_id' AND target_poi_id = 'poi_authService_id'`.
    *   The expected count is 1.
*   **Regression Scope Tag:** `@pass3`, `@happy-path`

### 4.5. Test Cases for `run()` (Full Orchestration)

#### **Test Case ID-- RR-RUN-01 (Full Run)**
*   **Target Method:** `run`
*   **AI Verifiable End Result Targeted:** The main `run` method successfully orchestrates all three passes, returning a final summary.
*   **Preconditions (Database State):**
    *   A test database is prepared with a multi-directory structure.
    *   **dir1/fileA.js**-- Contains an internal call (Pass 1 relationship).
    *   **dir1/fileB.js**-- Called by `fileA.js` (Pass 2 relationship). Exports a function.
    *   **dir2/fileC.js**-- Calls the exported function from `dir1/fileB.js` (Pass 3 relationship).
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver`.
    2.  Call `run()`.
    3.  Persist all identified relationships.
*   **Postconditions (Verification):**
    *   Execute `SELECT COUNT(*) FROM relationships`. The expected count is 3.
    *   Verify the existence of one intra-file, one intra-directory, and one global relationship via specific `SELECT` queries.
*   **Regression Scope Tag:** `@run`, `@happy-path`

### 4.6. Test Cases for `_queryLlmWithRetry()`

#### **Test Case ID-- RR-RES-01 (Resilience)**
*   **Target Method:** `_queryLlmWithRetry`
*   **AI Verifiable End Result Targeted:** Verifies the method can recover from malformed LLM responses.
*   **Preconditions (Test Setup):**
    *   This test requires the ability to intercept and mock the LLM client's response at a low level, which contradicts the "NO MOCKING" rule for *collaborators*. However, for testing the resilience of the query function itself, a controlled failure is necessary.
    *   **Strategy:** Configure the test to use a mock LLM client that, on the first call, returns invalid JSON, and on the second call (the retry), returns valid JSON. This tests the retry mechanism without mocking the agent's primary collaborators.
*   **Execution Steps:**
    1.  Instantiate `RelationshipResolver` with the mock LLM client.
    2.  Call `_queryLlmWithRetry` with a sample prompt and schema.
*   **Postconditions (Verification):**
    *   The method should not throw an error.
    *   The method should return the valid JSON object provided by the mock client on the second call.
    *   Logs should indicate that a retry occurred.
*   **Regression Scope Tag:** `@resilience`, `@failure-case`