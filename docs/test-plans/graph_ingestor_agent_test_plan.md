# Granular Test Plan-- GraphIngestorAgent

## 1. Introduction and Scope

This document provides a detailed, granular test plan for the `GraphIngestorAgent` module. It is designed to guide the `tester-tdd-master` in implementing a comprehensive test suite that ensures the agent correctly and reliably ingests analysis data into the Neo4j graph database.

**CRITICAL CONSTRAINT-- NO MOCKING POLICY**

This test plan strictly adheres to the project's "NO MOCKING" policy. All tests will be executed against live, stateful services.

-   Tests will interact with a real SQLite database (`db.sqlite`).
-   Tests will interact with a real Neo4j database instance.
-   The testing methodology is **state-based verification**. We will assert the final state of the databases after an action is performed, rather than verifying intermediate calls or mocking collaborators.

**Test Scope**

The ultimate goal of this test plan is to verify the AI-Verifiable End Result for Phase 3 of the project, as defined in the [`primary_project_planning_document.md`](docs/primary_project_planning_document.md)--

> The `A-01_ground_truth_validation.test.js` test passes with zero failures.

The granular tests outlined here are the foundational building blocks required to achieve that final, non-negotiable objective. They ensure each component of the `GraphIngestorAgent` functions correctly in isolation and in concert.

## 2. Test Environment and Prerequisites

-   **SQLite Database**: A live, initialized SQLite database instance. The schema must conform to [`docs/specifications/database_schema_specs.md`](docs/specifications/database_schema_specs.md).
-   **Neo4j Database**: A live, running Neo4j instance accessible to the test runner.
-   **Test Setup and Teardown**:
    -   **`beforeEach`**:
        -   A setup routine must run before each test to ensure a clean state.
        -   **SQLite**: The `analysis_results` table must be cleared (`DELETE FROM analysis_results;`).
        -   **Neo4j**: The entire Neo4j database must be wiped clean (`MATCH (n) DETACH DELETE n;`). This is critical for accurate state verification.
    -   **`afterAll`**:
        -   The Neo4j and SQLite database connections should be gracefully closed.

**AI-Verifiable Completion Criterion**: Helper functions `setupTestDatabase()` and `teardownTestDatabase()` are created. `setupTestDatabase()` successfully executes both the SQLite `DELETE` query and the Neo4j `DETACH DELETE` query.

## 3. Test Strategy (State-Verification Integration Testing)

The test strategy is a pure "Arrange, Act, Assert" pattern against live databases.

1.  **Arrange**: The `beforeEach` routine establishes a clean slate. The test then populates the SQLite `analysis_results` table with specific JSON data tailored to the test case.
2.  **Act**: Instantiate and run the `GraphIngestorAgent` or invoke one of its specific methods.
3.  **Assert**: Verify the outcome by executing SQL queries against SQLite and Cypher queries against Neo4j to confirm the final state matches the expected state.

## 4. Test Cases

---

### 4.1. `constructor(db, neo4jDriver)`

-   **Test Case ID**: GIA-C-001
-   **Objective**: Verify that the constructor correctly initializes the agent with live database drivers.
-   **Target AI-Verifiable Result**: Foundational setup for Task 3.1.
-   **Arrange**:
    -   An initialized SQLite database client instance (`db`).
    -   An initialized Neo4j driver instance (`neo4jDriver`).
-   **Act**:
    -   `const agent = new GraphIngestorAgent(db, neo4jDriver);`
-   **Assert (AI-Verifiable)**:
    -   Assert programmatically that `agent.db` is strictly equal to the `db` instance.
    -   Assert programmatically that `agent.neo4jDriver` is strictly equal to the `neo4jDriver` instance.

### 4.2. `getNextResult()`

-   **Test Case ID**: GIA-GNR-001
-   **Objective**: Verify that an unprocessed result is fetched and its status is updated to 'processed' atomically.
-   **Target AI-Verifiable Result**: Agent can claim work from the queue.
-   **Arrange**:
    -   Insert one record into `analysis_results` with `id=1`, `processed=0`.
-   **Act**:
    -   `const result = await agent.getNextResult();`
-   **Assert (AI-Verifiable)**:
    -   Programmatically assert that `result.id` equals `1`.
    -   Execute SQL-- `SELECT processed FROM analysis_results WHERE id = 1;`. Assert the result is `1`.

-   **Test Case ID**: GIA-GNR-002
-   **Objective**: Verify that `null` is returned when no unprocessed results are available.
-   **Target AI-Verifiable Result**: Agent correctly terminates when the queue is empty.
-   **Arrange**:
    -   Ensure `analysis_results` is empty or contains only records with `processed=1`.
-   **Act**:
    -   `const result = await agent.getNextResult();`
-   **Assert (AI-Verifiable)**:
    -   Programmatically assert that `result` is `null`.

### 4.3. `createNode()` and Idempotency

-   **Test Case ID**: GIA-CN-001
-   **Objective**: Verify that a new node with the correct label and properties is created.
-   **Target AI-Verifiable Result**: Core node creation logic works.
-   **Arrange**:
    -   A valid entity object-- `const entity = { type: 'Function', name: 'testFunc', filePath: '/app.js', line: 10 };`
-   **Act**:
    -   `await agent.createNode(session, entity);` (where `session` is a live Neo4j session).
-   **Assert (AI-Verifiable)**:
    -   Execute Cypher-- `MATCH (n:Function {name: 'testFunc', filePath: '/app.js'}) RETURN count(n) AS count;`. Assert `count` is `1`.

-   **Test Case ID**: GIA-CN-002 (Idempotency)
-   **Objective**: Verify that calling `createNode` multiple times for the same entity does not create duplicate nodes.
-   **Target AI-Verifiable Result**: Ingestion is idempotent and safe to re-run.
-   **Arrange**:
    -   `const entity = { type: 'Function', name: 'testFunc', filePath: '/app.js', line: 10 };`
    -   Call `agent.createNode(session, entity)` once to ensure the node exists.
-   **Act**:
    -   `await agent.createNode(session, entity);` (second call).
-   **Assert (AI-Verifiable)**:
    -   Execute Cypher-- `MATCH (n:Function {name: 'testFunc', filePath: '/app.js'}) RETURN count(n) AS count;`. Assert `count` is still `1`.

### 4.4. `createRelationship()` and Idempotency

-   **Test Case ID**: GIA-CR-001
-   **Objective**: Verify that a relationship is created between two existing nodes.
-   **Target AI-Verifiable Result**: Core relationship creation logic works.
-   **Arrange**:
    -   Create two nodes first-- a `Function` 'funcA' and a `Function` 'funcB'.
    -   A valid relationship object-- `const rel = { from: { type: 'Function', name: 'funcA', ... }, to: { type: 'Function', name: 'funcB', ... }, type: 'CALLS' };`
-   **Act**:
    -   `await agent.createRelationship(session, rel);`
-   **Assert (AI-Verifiable)**:
    -   Execute Cypher-- `MATCH (:Function {name:'funcA'})-[r:CALLS]->(:Function {name:'funcB'}) RETURN count(r) AS count;`. Assert `count` is `1`.

-   **Test Case ID**: GIA-CR-002 (Idempotency)
-   **Objective**: Verify that calling `createRelationship` multiple times does not create duplicate relationships.
-   **Target AI-Verifiable Result**: Ingestion is idempotent.
-   **Arrange**:
    -   Create the two nodes and the relationship once.
-   **Act**:
    -   `await agent.createRelationship(session, rel);` (second call).
-   **Assert (AI-Verifiable)**:
    -   Execute Cypher-- `MATCH (:Function {name:'funcA'})-[r:CALLS]->(:Function {name:'funcB'}) RETURN count(r) AS count;`. Assert `count` is still `1`.

### 4.5. `processResult()` and Error Handling

-   **Test Case ID**: GIA-PR-001
-   **Objective**: Verify that a valid result object is fully processed, creating all nodes and relationships.
-   **Target AI-Verifiable Result**: The agent can process a full unit of work.
-   **Arrange**:
    -   A result object with a JSON string containing 2 entities and 1 relationship.
-   **Act**:
    -   `await agent.processResult(result);`
-   **Assert (AI-Verifiable)**:
    -   Execute Cypher `MATCH (n) RETURN count(n) AS count;`. Assert `count` is `2`.
    -   Execute Cypher `MATCH ()-[r]->() RETURN count(r) AS count;`. Assert `count` is `1`.

-   **Test Case ID**: GIA-PR-002 (Error Handling)
-   **Objective**: Verify that malformed JSON is handled gracefully and does not corrupt the graph.
-   **Target AI-Verifiable Result**: The agent is resilient to bad data.
-   **Arrange**:
    -   A result object where `result.result` is an invalid JSON string.
    -   Optionally, add a record to `analysis_results` with `processed = -1` and `error_message` for tracking.
-   **Act**:
    -   `await agent.processResult(result);`
-   **Assert (AI-Verifiable)**:
    -   The test should assert that the agent does not throw an unhandled exception.
    -   Execute Cypher `MATCH (n) RETURN count(n) AS count;`. Assert `count` is `0`.
    -   Execute SQL `SELECT processed FROM analysis_results WHERE id = ?;`. Assert result is `-1` (or other error indicator).

### 4.6. `run()` - Full Integration

-   **Test Case ID**: GIA-RUN-001
-   **Objective**: Verify the agent's main loop processes all available results and terminates.
-   **Target AI-Verifiable Result**: End-to-end agent logic is correct.
-   **Arrange**:
    -   Insert 3 valid records into `analysis_results` with `processed=0`. The combined data should create 5 unique nodes and 4 relationships.
-   **Act**:
    -   `await agent.run();`
-   **Assert (AI-Verifiable)**:
    -   Execute SQL `SELECT count(*) as count FROM analysis_results WHERE processed = 1;`. Assert `count` is `3`.
    -   Execute Cypher `MATCH (n) RETURN count(n) AS count;`. Assert `count` is `5`.
    -   Execute Cypher `MATCH ()-[r]->() RETURN count(r) AS count;`. Assert `count` is `4`.

-   **Test Case ID**: GIA-RUN-002 (Idempotency)
-   **Objective**: Verify that running the agent twice on the same data does not create duplicates.
-   **Target AI-Verifiable Result**: The entire process is idempotent.
-   **Arrange**:
    -   Insert 2 records into `analysis_results` that will create 3 nodes and 1 relationship.
-   **Act**:
    -   `await agent.run();` (first run)
    -   Reset the `processed` flag to `0` for both records in SQLite.
    -   `await agent.run();` (second run)
-   **Assert (AI-Verifiable)**:
    -   After the second run, execute Cypher `MATCH (n) RETURN count(n) AS count;`. Assert `count` is `3`.
    -   Execute Cypher `MATCH ()-[r]->() RETURN count(r) AS count;`. Assert `count` is `1`.

## 5. Recursive Testing (Regression) Strategy

-   **Trigger**: The full `GraphIngestorAgent` test suite must be executed automatically upon any of the following events--
    1.  Any code change is committed to [`src/agents/GraphIngestorAgent.js`](src/agents/GraphIngestorAgent.js).
    2.  Any change is made to the `analysis_results` table schema in [`docs/specifications/database_schema_specs.md`](docs/specifications/database_schema_specs.md).
    3.  Any change is made to the `WorkerAgent` that alters the structure of the JSON output, as this directly impacts the ingestor.
-   **Execution**: The entire suite of tests defined in this plan should be run. These are high-value integration tests that provide strong confidence in the stability of the data ingestion pipeline.
-   **AI-Verifiable Completion Criterion**: A CI/CD pipeline step (e.g., a GitHub Action) is configured to automatically trigger the test script on pull requests targeting the `main` branch. The job must pass before merging is allowed.