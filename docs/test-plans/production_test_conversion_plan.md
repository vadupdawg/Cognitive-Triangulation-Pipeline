# Production Test Conversion Plan

## 1. Introduction and Goals

This document outlines the strategy for converting the existing granular, mock-based unit tests for each agent (`ScoutAgent`, `WorkerAgent`, `GraphIngestorAgent`) into production-ready integration tests.

The primary goals of this conversion are:

*   To increase test fidelity by having tests interact with real, integrated system components (File System, SQLite, Neo4j) instead of mocks.
*   To validate the data contracts and interactions between agents as defined in the system architecture.
*   To establish a testing framework that uses a deterministic, "golden" dataset, ensuring reliable and repeatable test outcomes without depending on external, non-deterministic services like a live LLM API.

This plan provides an actionable guide for the `production-test-implementer` to modify the existing test suites.

## 2. Overarching Strategy: Real Components, Golden Data

The core of the conversion strategy is to replace mocked collaborators with real, locally-running instances of the required services, while controlling the data flow to ensure determinism.

*   **Real Components**: All tests will interact with:
    *   The actual file system for repository scanning.
    *   A real SQLite database (`db.sqlite`) initialized via `src/utils/initializeDb.js`.
    *   A real Neo4j database instance, which must be running locally for the tests to execute.

*   **Golden Dataset**: As outlined in the [`docs/research/high_level_test_strategy.md`](../research/high_level_test_strategy.md), we will **not** call the live LLM API during these tests. Instead, we will use a pre-defined, manually-verified set of "golden" JSON outputs. This approach provides the benefits of testing the full pipeline's data handling and ingestion logic without the cost, non-determinism, and flakiness of live API calls.

## 3. Conversion Plan per Agent

### 3.1. ScoutAgent Conversion

**Objective**: Verify the agent correctly scans a real file system and populates a real SQLite database.

---
**Component** -- **Action Required**
--- -- ---
**Mocks to Remove** -- `MockFileSystem`, `MockDatabaseConnector`
**Real Components to Use** -- Node.js `fs` module, The actual SQLite database connection from [`src/utils/sqliteDb.js`](../../src/utils/sqliteDb.js).
**Test Data Strategy** -- **Setup**: Before each test, a temporary directory will be created on the file system. This directory will be populated with a controlled set of source files representing the test scenario (e.g., new files, modified files). The relevant SQLite tables (`work_queue`, `refactoring_tasks`, `file_state`) will be cleared. -- **Teardown**: After each test, the temporary directory and its contents will be deleted.
**Assertion Changes** -- Test assertions will change from checking mock call history (`mockDbConnector.queries`) to executing live `SELECT` queries against the real SQLite database to verify that the `work_queue` and `refactoring_tasks` tables contain the expected records.

---

### 3.2. WorkerAgent Conversion

**Objective**: Verify the agent can claim a real task, read a real file, process a "golden" LLM response, and persist the result to the real database.

---
**Component** -- **Action Required**
--- -- ---
**Mocks to Remove** -- Mock `db`, Mock `fs`, Mock `llmClient`.
**Real Components to Use** -- The real SQLite database connection. -- The real Node.js `fs` module. -- A Jest mock of the `LlmClient`'s `call` method.
**Test Data Strategy** -- **Setup**: 1. A temporary directory with test files is created. 2. A `work_queue` task pointing to a test file is inserted into the real SQLite DB. 3. The `LlmClient.call` method is mocked to return a specific "golden" JSON string corresponding to the input test file. This strategic mock isolates the test from the network while testing the entire `WorkerAgent` logic, including response validation and persistence. -- **Teardown**: The temporary directory is removed and database tables are cleaned.
**Assertion Changes** -- Assertions will query the real `analysis_results` and `failed_work` tables in SQLite to confirm that the agent correctly processed the golden data and updated the task status.

---

### 3.3. GraphIngestorAgent Conversion

**Objective**: Verify the agent can fetch "golden" analysis results from a real SQLite DB and build a correct graph in a real Neo4j instance.

---
**Component** -- **Action Required**
--- -- ---
**Mocks to Remove** -- Mock `sqliteDb`, Mock `neo4jDriver`.
**Real Components to Use** -- The real SQLite database connection. -- The real Neo4j driver from [`src/utils/neo4jDriver.js`](../../src/utils/neo4jDriver.js), connected to a live, local Neo4j instance.
**Test Data Strategy** -- **Setup**: Before each test, the Neo4j database will be completely cleared (`MATCH (n) DETACH DELETE n`). The `analysis_results` and `refactoring_tasks` tables in SQLite will be populated with a controlled set of "golden" data representing the test scenario. -- **Teardown**: The Neo4j database and SQLite tables will be cleaned to ensure test isolation.
**Assertion Changes** -- Assertions will change from checking mock calls to executing live Cypher queries against the Neo4j database to validate the resulting graph structure (node counts, relationship counts, properties). Assertions will also query SQLite to confirm task statuses were correctly updated to `ingested` or `completed`.

## 4. Prerequisites

*   A local SQLite environment will be managed automatically by the tests.
*   A local Neo4j server **must be running and accessible** at the URI specified in the project's `config.js` before executing the `GraphIngestorAgent` tests.

## 5. Updated Test Execution Flow

1.  **Setup**: The test runner will first ensure the database schema is initialized.
2.  **ScoutAgent Tests**: Run against a temporary file system directory and the live SQLite DB.
3.  **WorkerAgent Tests**: Run against the live SQLite DB, using golden data to simulate the LLM response.
4.  **GraphIngestorAgent Tests**: Run against the live SQLite and Neo4j databases.
5.  **Teardown**: All database states and temporary files are cleaned up.