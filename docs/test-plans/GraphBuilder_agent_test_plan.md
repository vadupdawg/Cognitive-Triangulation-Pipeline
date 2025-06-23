# Granular Test Plan-- GraphBuilder Agent

## 1. Introduction

This document provides a detailed test plan for the `GraphBuilder` agent. The agent's primary function is to consume analysis data from a central SQLite database and persist it as a graph structure in a Neo4j database.

This plan is derived from the following documents--
*   **Specification--** [`docs/specifications/GraphBuilder_agent_specs.md`](docs/specifications/GraphBuilder_agent_specs.md)
*   **Project Planning--** [`docs/primary_project_planning_document_sprint_3.md`](docs/primary_project_planning_document_sprint_3.md)
*   **Pseudocode--** [`docs/pseudocode/graph_builder_agent/`](docs/pseudocode/graph_builder_agent/)

A critical requirement for this test plan is the project's strict **"no-mocking"** policy. All tests will be designed as integration tests that interact with live, ephemeral database instances to verify the agent's behavior by asserting the final state of the data.

## 2. Test Scope & AI Verifiable End Results

The scope of this test plan is to verify the AI-verifiable end results for the `GraphBuilder` agent as defined in **Task 3.4.1** of the project planning document. The key outcomes to be verified are--

*   Successful instantiation and database connectivity of the `GraphBuilder` class.
*   Correct loading of all Points of Interest (POIs) and Relationships from the SQLite database.
*   Idempotent and batched persistence of POI data as nodes in Neo4j.
*   Idempotent, batched, and performant persistence of relationship data as dynamically-typed edges in Neo4j.
*   Successful end-to-end orchestration of the graph building process by the `run` method.

## 3. Test Strategy-- State-Based Verification

In adherence to the project's "no-mocking" policy, this plan adopts a **State-Based Verification** strategy. This approach contrasts with interaction-based testing (like the London School of TDD) and focuses on the outcomes of operations rather than the interactions between components.

The testing workflow is as follows--
1.  **Setup--** Before each test, the SQLite and Neo4j databases are programmatically set to a known, clean state. Test data (POIs, relationships) is inserted into the SQLite database as required for the specific test case.
2.  **Execution--** The `GraphBuilder` method under test is executed.
3.  **State Assertion--** After execution, the test queries the Neo4j and/or SQLite databases to verify that the final state is correct. This includes checking node counts, property values, relationship counts, and relationship types.

This strategy ensures that tests are robust, realistic, and directly validate the primary function of the agent--correctly manipulating database state.

## 4. Test Environment

*   **SQLite--** A temporary, file-based SQLite database will be created for each test run. This ensures test isolation and prevents data contamination. The path to this database will be passed to the `GraphBuilder` agent's configuration.
*   **Neo4j--** Tests will connect to a running Neo4j instance (e.g., a local Docker container). A setup/teardown process for each test suite will execute a `MATCH (n) DETACH DELETE n` Cypher query to clear the database, ensuring a clean slate for every run.
*   **Test Data--** A dedicated set of test data will be created, representing valid POIs and relationships, as well as edge cases like malformed data, to be used during the Setup phase.

## 5. Test Cases

### 5.1. `constructor(config)`

*   **Test Case ID--** GB-C-01
*   **Description--** Verify that the constructor successfully initializes the agent and connects to both SQLite and Neo4j databases.
*   **AI Verifiable End Result--** Task 3.4.1-- `GraphBuilder` class constructor is implemented... and successfully connects to the Neo4j database.
*   **Setup--**
    *   A valid, temporary SQLite database file exists.
    *   A Neo4j instance is running with valid credentials.
*   **Execution--** Instantiate `new GraphBuilder(config)`.
*   **State Assertion--**
    *   The constructor does not throw an error.
    *   The `neo4jDriver` property is an active driver object.
    *   The `dbConnection` property is an active connection object.
*   **AI Verifiable Completion Criterion--** The test passes if no exceptions are thrown during instantiation.

*   **Test Case ID--** GB-C-02
*   **Description--** Verify that the constructor throws an error if the Neo4j database is unavailable.
*   **AI Verifiable End Result--** Constructor handles connection errors gracefully.
*   **Setup--**
    *   A valid, temporary SQLite database file exists.
    *   Neo4j connection details in the config point to a non-existent or stopped instance.
*   **Execution--** Instantiate `new GraphBuilder(config)`.
*   **State Assertion--**
    *   The constructor throws a `DatabaseConnectionError` or similar exception.
*   **AI Verifiable Completion Criterion--** The test passes if the expected exception is caught.

### 5.2. `_persistNodes(poiMap)`

*   **Test Case ID--** GB-PN-01
*   **Description--** Verify that new POIs are correctly persisted as nodes in Neo4j.
*   **AI Verifiable End Result--** Task 3.4.1-- `_persistNodes` method uses batched, idempotent Cypher queries to persist all POIs.
*   **Setup--**
    *   Neo4j database is empty.
    *   Create a `poiMap` containing 5 unique POI objects.
*   **Execution--** Call `_persistNodes(poiMap)`.
*   **State Assertion--**
    *   A Cypher query `MATCH (p:POI) RETURN count(p) AS count` in Neo4j returns `count: 5`.
    *   Querying for a specific node by its ID (`MATCH (p:POI {id: 'test-upid-1'}) RETURN p`) returns a node with all the correct properties from the input POI object.
*   **AI Verifiable Completion Criterion--** The test passes if the Cypher queries confirm the correct node count and properties.

*   **Test Case ID--** GB-PN-02 (Idempotency)
*   **Description--** Verify that calling `_persistNodes` multiple times with the same data does not create duplicate nodes.
*   **AI Verifiable End Result--** Task 3.4.1-- A unit test verifies that running the method twice does not create duplicate nodes.
*   **Setup--**
    *   Neo4j database is empty.
    *   Create a `poiMap` containing 5 unique POI objects.
*   **Execution--**
    1.  Call `_persistNodes(poiMap)`.
    2.  Call `_persistNodes(poiMap)` a second time.
*   **State Assertion--**
    *   After the second call, a Cypher query `MATCH (p:POI) RETURN count(p) AS count` in Neo4j still returns `count: 5`.
*   **AI Verifiable Completion Criterion--** The test passes if the node count remains correct after the second execution.

### 5.3. `_persistRelationships(relationships)`

*   **Test Case ID--** GB-PR-01
*   **Description--** Verify that relationships are created with correct dynamic types and properties.
*   **AI Verifiable End Result--** Task 3.4.1-- `_persistRelationships` method uses batched, idempotent Cypher queries to persist all relationships.
*   **Setup--**
    *   Persist two nodes in Neo4j with IDs `source-node` and `target-node`.
    *   Create a `relationships` array with one object-- `{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'CALLS', confidence: 0.9, explanation: 'test' }`.
*   **Execution--** Call `_persistRelationships(relationships)`.
*   **State Assertion--**
    *   A Cypher query `MATCH (:POI {id: 'source-node'})-[r:CALLS]->(:POI {id: 'target-node'}) RETURN count(r) AS count` returns `count: 1`.
    *   The properties of the relationship `r` match the input object (`confidence: 0.9`, etc.).
*   **AI Verifiable Completion Criterion--** The test passes if the Cypher query confirms the relationship was created with the dynamic type `CALLS` and has the correct properties.

*   **Test Case ID--** GB-PR-02 (Idempotency)
*   **Description--** Verify that calling `_persistRelationships` multiple times does not create duplicate relationships.
*   **AI Verifiable End Result--** Task 3.4.1-- A unit test verifies that running the method twice does not create duplicate relationships.
*   **Setup--**
    *   Persist two nodes in Neo4j with IDs `source-node` and `target-node`.
    *   Create a `relationships` array with one relationship object of type `CALLS`.
*   **Execution--**
    1.  Call `_persistRelationships(relationships)`.
    2.  Call `_persistRelationships(relationships)` a second time.
*   **State Assertion--**
    *   A Cypher query `MATCH ()-[r:CALLS]->() RETURN count(r) AS count` still returns `count: 1`.
*   **AI Verifiable Completion Criterion--** The test passes if the relationship count remains correct after the second execution.

*   **Test Case ID--** GB-PR-03 (Security)
*   **Description--** Verify that a relationship with a type not in the `allowedRelationshipTypes` allowlist is ignored and not persisted.
*   **AI Verifiable End Result--** The agent correctly filters invalid relationship types.
*   **Setup--**
    *   Persist two nodes in Neo4j with IDs `source-node` and `target-node`.
    *   Create a `relationships` array with one object whose type is `'INVALID_TYPE'`.
    *   The `GraphBuilder` config `allowedRelationshipTypes` does *not* include `'INVALID_TYPE'`.
*   **Execution--** Call `run()` (as filtering happens in the orchestrator).
*   **State Assertion--**
    *   A Cypher query `MATCH ()-[r]->() RETURN count(r) AS count` returns `count: 0`.
*   **AI Verifiable Completion Criterion--** The test passes if no relationships are created in the database.

### 5.4. `run()`

*   **Test Case ID--** GB-R-01 (Integration)
*   **Description--** Verify the end-to-end process of loading from SQLite and persisting a complete graph to Neo4j.
*   **AI Verifiable End Result--** Task 3.4.1-- An integration test verifies that a full run... results in the correct, complete graph in Neo4j.
*   **Setup--**
    *   Neo4j database is empty.
    *   The temporary SQLite database is populated with 10 POIs (in the `file_analysis_reports` table) and 4 relationships (in the `project_analysis_summaries` table) that connect 8 of the 10 POIs.
*   **Execution--** Call `agent.run()`.
*   **State Assertion--**
    *   Neo4j query `MATCH (p:POI) RETURN count(p) AS count` returns `count: 10`.
    *   Neo4j query `MATCH ()-[r]->() RETURN count(r) AS count` returns `count: 4`.
    *   Spot-check one node and one relationship to ensure properties are correct.
*   **AI Verifiable Completion Criterion--** The test passes if the final node and relationship counts in Neo4j match the source data from SQLite.

## 6. Recursive Testing (Regression Strategy)

To ensure ongoing stability, the following regression testing strategy will be implemented.

*   **On-Commit (Local)--**
    *   **Trigger--** Any `git commit` that modifies files within `src/agents/GraphBuilder.js` or this test plan.
    *   **Action--** Run the entire suite of `GraphBuilder` tests (`GB-C-*`, `GB-PN-*`, `GB-PR-*`, `GB-R-*`).
    *   **Goal--** Provide immediate feedback to the developer and prevent regressions from entering the codebase.

*   **Pre-Merge (CI Pipeline)--**
    *   **Trigger--** Submitting a Pull Request to the `main` or `develop` branch.
    *   **Action--** Run the full `GraphBuilder` test suite as part of a larger, project-wide integration test run.
    *   **Goal--** Ensure the changes integrate correctly with other agents and do not cause upstream or downstream issues.

*   **Nightly Build--**
    *   **Trigger--** Scheduled nightly run.
    *   **Action--** Run the `GraphBuilder` suite against a larger, more complex set of test data that mimics production scale more closely.
    *   **Goal--** Catch performance regressions or issues that only appear with larger data volumes.

This layered approach ensures that regressions are caught early and with a frequency appropriate to the scope of the change.