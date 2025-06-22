# High-Level Test Strategy Report

## 1. Introduction

This document outlines the optimal high-level acceptance testing strategy for the AI-driven code analysis pipeline. The primary objective of this strategy is to establish a comprehensive test suite that, if all tests pass, provides maximum confidence in the system's correctness, accuracy, and reliability.

The strategy is designed around the core vision of the project-- to analyze a polyglot codebase and represent it as a 100% accurate knowledge graph. It directly addresses the key success criteria of **Accuracy** and **Polyglot Capability** as defined in the [Mutual Understanding Document](docs/Mutual_Understanding_Document.md).

This report is founded on a meticulous review of all project documentation and in-depth research into best practices for testing AI-driven data pipelines, graph database ingestions, and complex data synthesis.

## 2. Guiding Principles of High-Level Testing

Our testing strategy is built upon established principles of effective software testing to avoid common pitfalls of high-level tests (brittleness, slowness, and obscurity). Each acceptance test should be--

-   **Independent**-- Each test should run in isolation and not depend on the state left by other tests. This is achieved by preparing a unique test environment (e.g., a specific test codebase) for each test scenario.
-   **Reliable**-- Tests must produce consistent, deterministic results. Flakiness is unacceptable. This is achieved by controlling all inputs--the test codebase, configuration, and mocked API responses.
-   **Understandable**-- The purpose, steps, and success criteria of each test should be clear and directly traceable to a user story or requirement. The test name and structure will reflect the scenario it validates.
-   **Provides Clear Feedback**-- When a test fails, the output should clearly indicate what went wrong. Our verification steps, which rely on specific Cypher queries, will provide precise feedback on the state of the graph versus the expected state.

## 3. Overall Testing Strategy

Our approach is multi-layered, ensuring that we validate the system at different levels of granularity, culminating in full end-to-end acceptance tests.

-   **Data Validation Tests**-- These are the most granular checks, focused on the integrity of the data at rest.
    -   **SQLite Schema Validation**-- Before the pipeline runs, a test will verify that the SQLite database schema matches the specification.
    -   **Neo4j Schema Validation**-- After ingestion, a test will validate the Neo4j graph schema (nodes, relationships, properties) against the documented project schema. This is critical for **User Story 4**.

-   **Integration Tests**-- These tests verify the handoffs between the pipeline's agents.
    -   **Scout -> Worker**-- A test will ensure that files identified by the `ScoutAgent` are correctly picked up by `WorkerAgents`.
    -   **Worker -> Ingestor**-- A test will ensure that the JSON output from a `WorkerAgent` is correctly retrieved and processed by the `GraphIngestorAgent`.

-   **End-to-End (E2E) Acceptance Tests**-- These are the highest-level tests and form the core of our acceptance suite. Each test validates a complete user story by running the entire pipeline against a controlled input and verifying the final state of the Neo4j graph. These are detailed in Section 5.

## 4. Test Data Strategy

A robust testing strategy requires robust test data. Our strategy involves both sourcing real-world code and synthesizing specific scenarios. All test data will be stored in a version-controlled `polyglot-test/` directory.

-   **Sourcing Real-World Code**-- We will use small-to-medium-sized open-source repositories that represent a variety of languages and complexities. This provides a realistic baseline for testing the polyglot capabilities of the system.
-   **Synthesizing Edge Cases**-- To test specific, challenging scenarios, we will create small, targeted codebases. These will include--
    -   **Recursion Test**-- A project with functions that call themselves to ensure the graph correctly represents cyclic relationships.
    -   **Polyglot Interaction Test**-- A project where code in one language (e.g., Python) interacts with code in another (e.g., JavaScript), to validate cross-language relationship detection.
    -   **Complex Inheritance Test**-- A project with deep and multiple inheritance to test the `INHERITS_FROM` relationship logic.
    -   **Error Condition Test**-- A project containing syntax errors or code that the AI might misinterpret, to understand and define failure modes.

This hybrid approach ensures we test against both realistic, common code structures and the difficult edge cases that are critical for achieving 100% accuracy.

## 5. High-Level Test Suite Mapped to User Stories

The following tests are designed to be fully automatable and AI-verifiable. The "Verification" for each is a set of queries or checks that can be run by a script, with the results compared against a pre-defined ground truth.

---

**Test for User Story 1-- Comprehensive Codebase Graph Generation**

-   **Objective**-- Verify that the pipeline can generate a complete and accurate knowledge graph from a polyglot codebase.
-   **Test Setup**-- A small test directory containing--
    -   `main.py` (Python)-- A function `foo()` that calls a function `bar()` in another file.
    -   `utils.js` (JavaScript)-- A function `bar()` that is imported and used by `main.py`.
-   **Execution Steps**-- Run the full pipeline against the test directory.
-   **Verification (AI-Verifiable)**--
    1.  Execute a Cypher query-- `MATCH (n) RETURN labels(n) AS NodeLabels, count(*) AS Count`. The result must contain counts for `File`, `Function` nodes matching the exact number of files and functions in the test directory.
    2.  Execute a Cypher query-- `MATCH ()-[r]->() RETURN type(r) AS RelationshipType, count(*) AS Count`. The result must contain counts for `IMPORTS` and `CALLS` relationships that match the ground truth.
    3.  Execute a specific query-- `MATCH (py:Function {name-- 'foo'})-[:CALLS]->(js:Function {name-- 'bar'}) RETURN count(*)` must return `1`.

---

**Test for User Story 2-- Configurable Analysis Scope**

-   **Objective**-- Verify that the pipeline correctly excludes specified files and directories.
-   **Test Setup**-- A test directory containing `src/app.js`, `vendor/lib.js`, and `docs/guide.md`. A configuration file specifies excluding the `vendor/` directory and all `*.md` files.
-   **Execution Steps**-- Run the `ScoutAgent` with the specified configuration.
-   **Verification (AI-Verifiable)**--
    1.  Check the `files` table in the SQLite database. It must contain a record for `src/app.js`.
    2.  The `files` table must NOT contain records for `vendor/lib.js` or `docs/guide.md`.
    3.  The pipeline log file must contain entries explicitly stating that the vendor directory and markdown file were excluded.

---

**Test for User Story 3-- Code Discovery and Usage Analysis**

-   **Objective**-- Verify that the graph can be queried to accurately find the definition and all usages of a specific function.
-   **Test Setup**-- A test directory where a function `getUser` is defined in `api.js` and called by `logic_A.js` and `logic_B.js`.
-   **Execution Steps**-- Run the full pipeline against the test directory.
-   **Verification (AI-Verifiable)**--
    1.  Execute a Cypher query-- `MATCH (f:Function {name-- 'getUser'}) RETURN f.filePath, f.startLine`. The returned path and line number must match the ground truth location of the function definition.
    2.  Execute a Cypher query-- `MATCH (f:Function {name-- 'getUser'})<-[:CALLS]-(caller) RETURN caller.name`. The result must be a list containing the names of the two calling functions-- `['logic_A_function', 'logic_B_function']`. The count must be exactly 2.

---

**Test for User Story 4-- Reliable and Schema-Compliant Graph Consumption**

-   **Objective**-- Verify that the graph is idempotent and strictly adheres to the schema.
-   **Test Setup**-- Use the same test directory from User Story 1.
-   **Execution Steps**--
    1.  Run the full pipeline.
    2.  Run the `GraphIngestorAgent` a second time on the same (already processed) data.
-   **Verification (AI-Verifiable)**--
    1.  After the first run, execute a schema validation script that checks all node labels, property keys, and relationship types against the master schema definition. The validation must pass.
    2.  After the second run, execute a Cypher query to count all nodes and relationships (`MATCH (n) RETURN count(n)` and `MATCH ()-[r]->() RETURN count(r)`). The counts must be identical to the counts after the first run, proving idempotency.

---

**Test for User Story 5-- Efficient and Scalable Processing**

-   **Objective**-- Verify that the pipeline processes files in parallel and uses batched transactions.
-   **Test Setup**-- A test directory with at least 5 code files.
-   **Execution Steps**-- Run the full pipeline with at least 2 `WorkerAgent` instances.
-   **Verification (AI-Verifiable)**--
    1.  Monitor the pipeline logs. The logs must show that multiple `WorkerAgents` started and that files were assigned to different worker IDs.
    2.  The logs for the `GraphIngestorAgent` must contain messages indicating that it is processing data in batches (e.g., "Ingesting batch 1 of 3...").
    3.  The intermediate SQLite database must correctly store the structured output from all workers before the ingestor begins.

---

**Test for User Story 6-- Accurate Cross-File Relationship Resolution**

-   **Objective**-- Verify the two-pass ingestion strategy correctly resolves cross-file relationships.
-   **Test Setup**-- Use the polyglot test directory from User Story 1 where `main.py` calls `utils.js`.
-   **Execution Steps**-- Run the `GraphIngestorAgent` with instrumentation to log the state after each pass.
-   **Verification (AI-Verifiable)**--
    1.  After the first pass (node creation), the logs or a direct query must show that the `Function` nodes for `foo` and `bar` exist, but the `CALLS` relationship does not.
    2.  After the second pass (relationship creation), a Cypher query `MATCH (a:Function {name--'foo'})-[r:CALLS]->(b:Function {name--'bar'}) RETURN r` must return the relationship, confirming it was created successfully.

## 6. API and External Connections Testing

The primary external dependency is the Deepseek API used by the `WorkerAgent`. As we cannot control the external service, our testing will focus on our side of the contract.

-   **Mock Server**-- We will use a mock server (e.g., `nock` in Node.js) to simulate the Deepseek API.
-   **Contract Tests**--
    -   **Success Case**-- A test will ensure that when the `deepseekClient` receives a valid success response from the mock API, it correctly parses the JSON and returns the structured data.
    -   **Error Case**-- A test will ensure that if the mock API returns an error (e.g., 500 status code), the `deepseekClient` handles it gracefully, logs the error, and does not crash.
    -   **Invalid JSON Case**-- A test will ensure that if the API returns a malformed JSON response, the `WorkerAgent` catches the parsing error and updates the file status to 'error'.

This strategy ensures our system is resilient to external API issues without depending on the availability or behavior of the actual service during testing.