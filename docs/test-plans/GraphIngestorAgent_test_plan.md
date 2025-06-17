# Granular Test Plan-- GraphIngestorAgent

## 1. Introduction

This document outlines the detailed test plan for the `GraphIngestorAgent` module. The primary purpose of this agent is to consume structured analysis and refactoring data from a central SQLite database and deterministically build a knowledge graph in a Neo4j database.

This plan adheres to the London School of TDD, focusing on interaction-based testing of the agent's observable behavior with its collaborators. It is directly derived from the feature's specification, pseudocode, and architecture documents, and its success is measured by its ability to fulfill specific AI-verifiable outcomes defined in the [`ProjectMasterPlan.md`](../ProjectMasterPlan.md).

## 2. Test Scope & AI-Verifiable End Results

These granular tests are designed to verify the following AI-verifiable outcomes from the [`ProjectMasterPlan.md`](../ProjectMasterPlan.md) before running the full, slower acceptance tests--

*   **P3-A-- Deterministic Graph Construction--** The agent correctly translates `analysis_results` records into the corresponding nodes and relationships in the Neo4j graph.
*   **P3-B-- Transactional Integrity--** All graph modifications for a given batch are atomic. The graph is never left in a partially-ingested, inconsistent state.
*   **P3-C-- State Management--** The agent correctly updates the status of records in the SQLite database (`analysis_results`, `refactoring_tasks`) to `ingested` or `completed` *only after* a successful Neo4j transaction commit.
*   **P3-D-- Refactoring Handling--** The agent correctly processes `DELETE` and `RENAME` tasks from the `refactoring_tasks` table, ensuring the graph accurately reflects the state of the file system.

## 3. Test Strategy (London School of TDD)

The testing approach isolates the `GraphIngestorAgent` as the **System Under Test (SUT)** and focuses on its interactions with its external dependencies, which are treated as **Collaborators**.

*   **System Under Test (SUT)**-- The `GraphIngestorAgent`'s core logic, specifically the `processBatch` function and its sub-routines (`handleRefactoring`, `createNodes`, `createRelationships`).
*   **Collaborators**--
    *   **SQLite Database Driver**-- This will be mocked to provide controlled batches of pending tasks and to verify that the SUT sends the correct `UPDATE` statements to mark tasks as complete.
    *   **Neo4j Database Driver**-- This will be mocked at the driver/session/transaction level. The tests will not connect to a real Neo4j instance. Instead, they will verify that the SUT initiates a transaction, executes the correct sequence of Cypher queries with the correct parameters, and calls `commit()` on success or `rollback()` on failure.

*   **Testing Focus**-- We will verify the **observable outcomes** of the agent's work, which are the commands it sends to its collaborators. We will assert that--
    1.  The agent requests the correct data from the SQLite mock.
    2.  The agent generates and executes the expected Cypher queries (as strings) via the Neo4j transaction mock.
    3.  The agent commits the transaction mock after all queries succeed.
    4.  The agent sends the correct status updates to the SQLite mock after the commit.
    5.  The agent rolls back the transaction mock if any query execution fails, and does *not* send status updates to SQLite.

This interaction-based approach ensures the agent's logic is correct without relying on the internal state of the agent or the state of external databases, making the tests fast, reliable, and highly specific.

## 4. Recursive Testing & Regression Strategy

A multi-layered, recursive testing strategy will be employed to ensure continuous stability and catch regressions early.

---
**Trigger** -- **Test Scope** -- **Description & Purpose**
--- -- --- -- ---
**On Code Commit (`pre-commit` hook)** -- **Unit Tests (Fastest)** -- Tests individual functions (`handleRefactoring`, `createNodes`, `createRelationships`) in isolation. They verify that given a specific input (e.g., a list of refactoring tasks), the function generates the correct Cypher queries. These are tagged as `scope--unit`.
**On Pull Request (CI Pipeline)** -- **Integration Tests (Medium)** -- Tests the `processBatch` orchestrator function. Verifies the correct sequence of operations (Refactor -> Nodes -> Rels), transactional integrity (commit/rollback), and state updates in SQLite. These are tagged as `scope--integration`.
**Nightly Build / Pre-Deployment** -- **Full Granular Suite** -- Runs all `unit` and `integration` tests together to provide a comprehensive health check of the component.
**After a failed Acceptance Test** -- **Full Granular Suite & Review** -- If a high-level test like [`tests/acceptance/graph_correctness.test.js`](../../tests/acceptance/graph_correctness.test.js) fails, the full granular suite for this agent is run first. The failure is then analyzed to determine if a new granular test case is needed to cover the specific scenario that the acceptance test caught, improving future regression detection.

---

## 5. Test Cases

### 5.1. Refactoring Logic (`handleRefactoring`)

*   **AI Verifiable Target**-- P3-D-- Refactoring Handling
*   **TDD Anchor**-- [`docs/pseudocode/GraphIngestorAgent.md#L112-L121`](../pseudocode/GraphIngestorAgent.md#L112-L121)
*   **Scope**-- `scope--unit`

---
**Test Case** -- **Collaborator Mocks** -- **Expected Interactions & Observable Outcome** -- **AI Verifiable Completion**
--- -- --- -- ---
**1.1-- A 'DELETE' task generates the correct Cypher query.** -- Neo4j Transaction -- The `transaction.run` mock is called exactly once with the query `MATCH (n {filePath-- $filePath}) DETACH DELETE n` and parameters `{ "filePath"-- "path/to/deleted/file.js" }`. -- The mock receives the specified query and parameters.
**1.2-- A 'RENAME' task generates the correct Cypher query.** -- Neo4j Transaction -- The `transaction.run` mock is called exactly once with the query containing `SET n.filePath = $new_path, n.qualifiedName = replace(...)` and parameters `{ "old_path"-- "path/to/old.js", "new_path"-- "path/to/new.js" }`. -- The mock receives the specified query and parameters.
**1.3-- A mixed batch of tasks generates multiple queries.** -- Neo4j Transaction -- The `transaction.run` mock is called twice, once for the DELETE and once for the RENAME, with the correct queries and parameters for each. -- The mock's call count is 2, and call arguments are verified for each.

### 5.2. Node Creation Logic (`createNodes`)

*   **AI Verifiable Target**-- P3-A-- Deterministic Graph Construction
*   **TDD Anchor**-- [`docs/pseudocode/GraphIngestorAgent.md#L141-L176`](../pseudocode/GraphIngestorAgent.md#L141-L176)
*   **Scope**-- `scope--unit`

---
**Test Case** -- **Collaborator Mocks** -- **Expected Interactions & Observable Outcome** -- **AI Verifiable Completion**
--- -- --- -- ---
**2.1-- A single analysis result creates nodes with a batched query.** -- Neo4j Transaction -- The `transaction.run` mock is called once per entity type (e.g., once for `:Function`, once for `:File`). The query is `UNWIND $batch as properties MERGE (n--...` and the `$batch` parameter is an array of property maps for each node of that type. -- The mock is called with the expected batched queries and corresponding node data arrays.
**2.2-- Multiple analysis results are aggregated into single queries per type.** -- Neo4j Transaction -- Same as 2.1. Even with multiple input files, only one `UNWIND` query per entity type is generated, and the `$batch` parameter contains aggregated nodes from all inputs. -- The mock is called with a single batched query per label, and the batch parameter contains the fully aggregated list of nodes.
**2.3-- Idempotency-- Re-processing the same data generates the same query.** -- Neo4j Transaction -- Processing the same `analysisBatch` twice results in the exact same calls to the `transaction.run` mock. -- The mock's call history is identical across two runs.

### 5.3. Relationship Creation Logic (`createRelationships`)

*   **AI Verifiable Target**-- P3-A-- Deterministic Graph Construction
*   **TDD Anchor**-- [`docs/pseudocode/GraphIngestorAgent.md#L189-L218`](../pseudocode/GraphIngestorAgent.md#L189-L218)
*   **Scope**-- `scope--unit`

---
**Test Case** -- **Collaborator Mocks** -- **Expected Interactions & Observable Outcome** -- **AI Verifiable Completion**
--- -- --- -- ---
**3.1-- A single analysis result creates relationships with a batched query.** -- Neo4j Transaction -- The `transaction.run` mock is called once per relationship type (e.g., once for `:CALLS`). The query is `UNWIND $batch as rel MATCH (source)... MATCH (target)... MERGE (source)-...` and the `$batch` parameter is an array of relationship data. -- The mock is called with the expected batched queries and corresponding relationship data arrays.
**3.2-- Idempotency-- Re-processing does not create duplicate relationships.** -- Neo4j Transaction -- Processing the same `analysisBatch` twice results in the exact same calls to the `transaction.run` mock. The `MERGE` statement handles idempotency in the query itself. -- The mock's call history is identical across two runs.

### 5.4. Batch Processing Orchestration (`processBatch`)

*   **AI Verifiable Target**-- P3-B-- Transactional Integrity, P3-C-- State Management
*   **TDD Anchor**-- [`docs/pseudocode/GraphIngestorAgent.md#L95-L96`](../pseudocode/GraphIngestorAgent.md#L95-L96)
*   **Scope**-- `scope--integration`

---
**Test Case** -- **Collaborator Mocks** -- **Expected Interactions & Observable Outcome** -- **AI Verifiable Completion**
--- -- --- -- ---
**4.1-- Full successful workflow.** -- SQLite DB, Neo4j Driver/Session/Transaction -- 1. `neo4j.beginTransaction` is called. 2. `transaction.run` is called in the correct order (Refactor, Nodes, Rels). 3. `transaction.commit` is called. 4. `sqlite.execute` is called with `UPDATE` statements for both `analysis_results` and `refactoring_tasks` tables *after* the commit. -- All mocks are called in the specified sequence. The SQLite update mock is only called after the transaction commit mock is called.
**4.2-- Neo4j query failure causes rollback.** -- SQLite DB, Neo4j Driver/Session/Transaction -- 1. `neo4j.beginTransaction` is called. 2. `transaction.run` is called and is configured to throw an error. 3. `transaction.rollback` is called. 4. `transaction.commit` is **NOT** called. 5. The `sqlite.execute` mock for updating statuses is **NEVER** called. -- The `rollback` mock is called, `commit` is not, and the SQLite `UPDATE` mock call count is 0.
**4.3-- An empty batch does nothing.** -- SQLite DB, Neo4j Driver/Session/Transaction -- The `neo4j.beginTransaction` mock is never called. The `sqlite.execute` mock for updates is never called. -- The call counts for all Neo4j and SQLite update mocks are 0.

## 6. Test Data and Mock Configuration

*   **`analysisBatch`**: A list of objects, each representing a row from `analysis_results`.
    *   Example Item-- `{ id-- 'uuid-1', llm_output-- '{"filePath"--"a.js", "entities"--[...], "relationships"--[...]}' }`
*   **`refactoringBatch`**: A list of objects, each representing a row from `refactoring_tasks`.
    *   Example Item-- `{ id-- 'uuid-delete-1', type-- 'DELETE', old_path-- 'b.js', new_path-- null }`
*   **Mock `neo4jTransaction`**: An object with methods `run`, `commit`, and `rollback`. Each of these will be a spy/mock function (e.g., `jest.fn()`) that records its calls and can be configured to throw errors for specific test cases.
*   **Mock `sqliteDB`**: An object with a method `execute`. This will be a spy that records calls and can be configured to return specific test data.

This plan provides a clear and comprehensive path for developing robust, outcome-focused tests that ensure the `GraphIngestorAgent` is reliable, correct, and resilient.