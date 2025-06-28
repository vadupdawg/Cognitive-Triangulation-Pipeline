# Test Plan-- `GraphIngestionWorker`

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Ready for Implementation

## 1. Introduction and Scope

This document outlines the granular test plan for the `GraphIngestionWorker` module, as defined in the corresponding [specification document](../../specifications/high_performance_llm_only_pipeline/03_GraphIngestionWorker_spec.md).

The primary purpose of the `GraphIngestionWorker` is to consume `GraphData` messages from a queue and persist the contained entities (POIs) and relationships into a Neo4j database.

This test plan focuses on verifying the functional correctness, data integrity, error handling, and idempotency of the ingestion process. It ensures that the worker correctly interacts with the Neo4j database to build the knowledge graph as expected.

**AI Verifiable Completion Criterion--** The successful creation of this test plan document at the specified path constitutes the completion of this task.

## 2. Test Strategy

### 2.1. Testing Approach-- Integration Testing with a Real Database

In a departure from traditional unit testing that relies on mocking, this test plan mandates an **integration testing** approach. All tests will be executed against a **live, ephemeral Neo4j database instance**.

**Rationale--** The core logic of the `GraphIngestionWorker` is encapsulated within a complex Cypher query using `apoc.periodic.iterate`. Mocking the database driver would only verify that a string (the query) is passed to the driver, not that the query itself is correct or that it produces the desired side effects in the database. Verifying the actual state change in the database is the only way to ensure the worker functions correctly.

**Policy-- "No Mocking" for I/O--** The Neo4j driver and its session management will **not** be mocked. Tests will establish a real connection to a test database.

### 2.2. Test Environment

*   **Database Setup--** A dedicated Neo4j database instance (e.g., running in a Docker container) will be used for the test suite.
*   **Data Isolation--** Before each test case is executed, the test runner will execute a script to wipe the Neo4j database clean (`MATCH (n) DETACH DELETE n`). This ensures that test cases are independent and do not interfere with each other.
*   **Configuration--** The `GraphIngestionWorker` will be instantiated with connection details pointing to the test database.

### 2.3. AI Verifiable Steps

*   **Test Environment Setup--** The test setup script can be programmatically verified to ensure it contains the Cypher command to clear the database.
*   **Test Execution--** The execution of the test suite against the live database can be logged and verified.
*   **Test Assertions--** Each test's assertions will involve querying the database and verifying the returned data, which is an AI-verifiable outcome.

## 3. Recursive Testing (Regression Strategy)

To ensure ongoing stability, these integration tests will be incorporated into a recursive testing strategy.

*   **Triggers for Re-execution--**
    *   **On Code Change--** The entire `GraphIngestionWorker` test suite will be automatically triggered by the CI/CD pipeline upon any push or merge request that modifies the `GraphIngestionWorker.js` file or its direct dependencies.
    *   **On Schema Change--** The suite will be run if there are changes to the Neo4j schema definition ([`05_Neo4j_Schema_spec.md`](../../specifications/high_performance_llm_only_pipeline/05_Neo4j_Schema_spec.md)).
    *   **Nightly Builds--** The full suite will run as part of a nightly build to catch any regressions introduced by indirect dependency changes.

*   **Test Tagging and Selection--**
    *   All tests in this plan will be tagged as `@integration` and `@graph-ingestion`.
    *   For rapid feedback during development, developers can run only the `@graph-ingestion` suite locally.
    *   The CI pipeline will run all `@integration` tests as a required check before merging to the main branch.

**AI Verifiable Completion Criterion--** The CI/CD configuration file can be parsed to verify the existence of triggers and test execution commands corresponding to this strategy.

## 4. Test Cases

### 4.1. Test Case-- TC01 - Successful Ingestion of Nodes and Relationships

*   **Objective--** Verify that the worker can successfully process a valid `GraphData` job, creating all specified nodes (POIs) and relationships in the database.
*   **AI Verifiable End Result--** The Neo4j database contains the exact nodes and relationships defined in the input test data.
*   **Test Steps--**
    1.  **Setup--** Ensure the test Neo4j database is empty.
    2.  **Arrange--** Create a `GraphIngestionWorker` instance connected to the test database. Define a valid `job` object containing a `graphJson` with a set of `pois` and `relationships` (see Test Data section).
    3.  **Act--** Call `worker.processJob(job)`.
    4.  **Assert--**
        *   The `processJob` promise resolves without errors.
        *   Query the database-- `MATCH (n:POI) RETURN count(n) AS count`. Assert that the count matches the number of POIs in the test data.
        *   Query the database for a specific POI-- `MATCH (p:POI {id: 'test-poi-1'}) RETURN p`. Assert that its properties (`type`, `name`, `filePath`, etc.) match the test data.
        *   Query the database-- `MATCH ()-[r:RELATIONSHIP]->() RETURN count(r) AS count`. Assert that the count matches the number of relationships in the test data.
        *   Query for a specific relationship-- `MATCH (:POI {id: 'test-poi-1'})-[r:RELATIONSHIP {type: 'calls'}]->(:POI {id: 'test-poi-2'}) RETURN r`. Assert it exists and its properties are correct.

### 4.2. Test Case-- TC02 - Idempotent Ingestion

*   **Objective--** Verify that processing the exact same job multiple times does not create duplicate nodes or relationships.
*   **AI Verifiable End Result--** The database state is identical after the first and subsequent runs of the same job.
*   **Test Steps--**
    1.  **Setup--** Ensure the test Neo4j database is empty.
    2.  **Arrange--** Use the same worker and `job` object from TC01.
    3.  **Act--**
        *   Call `worker.processJob(job)` once.
        *   Call `worker.processJob(job)` a second time.
    4.  **Assert--**
        *   Both calls resolve without errors.
        *   Perform the exact same database count assertions as in TC01. The counts for nodes and relationships must not have doubled.

### 4.3. Test Case-- TC03 - Handling Malformed Job Data

*   **Objective--** Verify that the worker fails gracefully when the job data is missing required fields.
*   **AI Verifiable End Result--** The `processJob` function rejects with an error, and no data is written to the database.
*   **Test Scenarios--**
    *   `job.data.graphJson` is `null` or `undefined`.
    *   `job.data.graphJson.pois` is missing.
    *   `job.data.graphJson.relationships` is missing.
*   **Test Steps (for each scenario)--**
    1.  **Setup--** Ensure the test Neo4j database is empty.
    2.  **Arrange--** Create a `job` object with the malformed data.
    3.  **Act--** Call `worker.processJob(job)`.
    4.  **Assert--**
        *   Assert that the promise is rejected with a relevant error message.
        *   Query the database-- `MATCH (n) RETURN count(n) AS count`. Assert that the count is 0.

### 4.4. Test Case-- TC04 - Handling Database Connection Failure

*   **Objective--** Verify that the worker handles a failure to connect to the database.
*   **AI Verifiable End Result--** The `processJob` function rejects with a connection error.
*   **Test Steps--**
    1.  **Arrange--** Instantiate the `GraphIngestionWorker` with invalid credentials (e.g., wrong password or URI). Create a valid `job` object.
    2.  **Act--** Call `worker.processJob(job)`.
    3.  **Assert--**
        *   Assert that the promise is rejected with an error indicating a connection or authentication failure.

### 4.5. Test Case-- TC05 - Ingestion of Nodes Only

*   **Objective--** Verify correct processing of a job with POIs but no relationships.
*   **AI Verifiable End Result--** The Neo4j database contains the specified nodes, and no relationships are created.
*   **Test Steps--**
    1.  **Setup--** Ensure the database is empty.
    2.  **Arrange--** Create a `job` with valid `pois` but an empty `relationships` array.
    3.  **Act--** Call `worker.processJob(job)`.
    4.  **Assert--**
        *   The promise resolves successfully.
        *   Assert that the `POI` count in the database is correct.
        *   Assert that the `RELATIONSHIP` count is 0.

## 5. Test Data

A dedicated test data file (e.g., `tests/test-data/graph-ingestion-data.js`) will export sample `graphJson` objects.

### Sample `validGraphData`

```json
{
  "pois"-- [
    {
      "id"-- "test-poi-1",
      "type"-- "Function",
      "name"-- "calculateTotal",
      "filePath"-- "src/utils/math.js",
      "startLine"-- 10,
      "endLine"-- 25
    },
    {
      "id"-- "test-poi-2",
      "type"-- "Function",
      "name"-- "formatCurrency",
      "filePath"-- "src/utils/format.js",
      "startLine"-- 5,
      "endLine"-- 15
    }
  ],
  "relationships"-- [
    {
      "source"-- "test-poi-1",
      "target"-- "test-poi-2",
      "type"-- "calls",
      "filePath"-- "src/utils/math.js"
    }
  ]
}
```

**AI Verifiable Completion Criterion--** The existence and valid structure of this test data file can be programmatically verified.