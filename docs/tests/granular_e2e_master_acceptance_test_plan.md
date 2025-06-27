# Granular E2E Master Acceptance Test Plan (Revised)

## 1. Introduction

This document outlines the revised Master Acceptance Test Plan for the cognitive triangulation pipeline, with a focus on **granular data integrity validation** at every persistence layer. It directly addresses the critiques outlined in [`docs/devil/critique_report_sprint_7_granular_e2e_specs.md`](../devil/critique_report_sprint_7_granular_e2e_specs.md) by replacing superficial checks with deep, schema-aware, and semantically-validated criteria.

The testing strategy requires all tests to be executed against live instances of all external dependencies. Each test case verifies a specific step in the application pipeline by querying the database state directly. Every test includes a highly detailed, AI-verifiable completion criterion to enable automated validation of the system's data correctness.

A small, well-defined `polyglot-test` directory will be used as the target for analysis in all test cases to ensure consistent and predictable outcomes.

## 2. Test Environment & Dependencies

- **Target Codebase**: The `polyglot-test` directory.
- **Node.js**: Runtime environment.
- **Redis**: Live instance for BullMQ and caching.
- **SQLite**: Live instance for transactional and relational data.
- **Neo4j**: Live instance with the APOC library installed.
- **Deepseek AI**: A valid API key must be configured in the environment.

## 3. High-Level Acceptance Tests

### Phase 1-- Project Initialization and Job Creation

---

#### Test Case-- E2E-INIT-01-- CLI-Triggered Run and Job Validation

- **Description**-- Verifies that the `EntityScout` agent correctly populates the initial job queues and run manifests with semantically correct data.
- **Given**-- A clean environment (empty Redis queues, empty relevant SQLite tables).
- **When**-- The command `node src/main.js --target polyglot-test` is executed.
- **Then**-- The `EntityScout` agent scans the `polyglot-test` directory and creates jobs.
- **AI-Verifiable Completion Criterion**--
    1.  **Redis `file-analysis-queue`**:
        -   The queue must contain a job for every non-binary file inside the `polyglot-test` directory.
        -   Each job's payload (data) must be a JSON object containing a `file_path` key, where the value is a non-empty string (e.g., `polyglot-test/js/auth.js`).
    2.  **Redis `directory-resolution-queue`**:
        -   The queue must contain a job for every subdirectory.
        -   Each job's payload must be a JSON object containing a `directory_path` key.
    3.  **Redis Run Manifest**:
        -   A run manifest key (e.g., `run_manifest:<run_id>`) must exist.
        -   The manifest must be a Redis Hash containing keys like `start_time`, `target_directory`, and `status`, with `status` being `IN_PROGRESS`.

---

### Phase 2-- File Analysis and Entity Extraction

---

#### Test Case-- E2E-CORE-01-- File-Level POI Analysis and Database Validation

- **Description**-- Verifies that the `FileAnalysisWorker` correctly processes a file, queries the LLM, and persists findings with full schema and data integrity in the `points_of_interest` table.
- **Given**-- An `analyze-file` job for `polyglot-test/js/auth.js` is processed.
- **When**-- The `FileAnalysisWorker` consumes the job and persists the results.
- **Then**-- The worker calls the LLM and writes the resulting Points of Interest (POIs) to the SQLite database.
- **AI-Verifiable Completion Criterion**--
    1.  **SQLite `points_of_interest` Table Schema**:
        -   Query `PRAGMA table_info('points_of_interest')`.
        -   The result must contain columns-- `id` (TEXT, PK), `file_path` (TEXT, NOT NULL), `name` (TEXT, NOT NULL), `type` (TEXT, NOT NULL), `start_line` (INTEGER), `end_line` (INTEGER), `confidence` (REAL).
    2.  **SQLite `points_of_interest` Data Correctness**:
        -   `SELECT * FROM points_of_interest WHERE file_path = 'polyglot-test/js/auth.js'`.
        -   The query must return multiple rows.
        -   For a known function like `authenticateUser`, there must be a row where `name` is 'authenticateUser', `type` is 'Function', and `start_line` and `end_line` are accurate integer values.
        -   The `id` for each POI must be a unique, non-null string.

---

### Phase 3-- Relationship Resolution

---

#### Test Case-- E2E-CORE-02-- Intra-File Relationship Analysis and Database Validation

- **Description**-- Verifies that the `RelationshipResolutionWorker` identifies relationships between POIs within a file and persists them correctly to the `resolved_relationships` table.
- **Given**-- POIs for a file (e.g., `polyglot-test/js/auth.js`) exist in the `points_of_interest` table.
- **When**-- The `RelationshipResolutionWorker` processes the POIs for the file.
- **Then**-- The worker queries the LLM and persists the identified relationships.
- **AI-Verifiable Completion Criterion**--
    1.  **SQLite `resolved_relationships` Table Schema**:
        -   Query `PRAGMA table_info('resolved_relationships')`.
        -   Verify columns-- `id` (INTEGER, PK), `source_poi_id` (TEXT, NOT NULL), `target_poi_id` (TEXT, NOT NULL), `type` (TEXT, NOT NULL), `confidence` (REAL), `explanation` (TEXT), `pass_type` (TEXT).
        -   Verify Foreign Key constraints on `source_poi_id` and `target_poi_id`.
    2.  **SQLite `resolved_relationships` Data Correctness**:
        -   Execute a JOIN query to find relationships for `polyglot-test/js/auth.js`.
        -   For a known relationship (e.g., `authenticateUser` calling `hashPassword`), a row must exist where the `source_poi_id` corresponds to `authenticateUser`, `target_poi_id` corresponds to `hashPassword`, and `type` is 'CALLS'.
        -   The `pass_type` must be 'INTRA_FILE'.
        -   `confidence` must be a floating-point number between 0 and 1.

---

### Phase 4-- Graph Construction

---

#### Test Case-- E2E-BUILD-01-- Knowledge Graph Construction and Validation

- **Description**-- Verifies that the `GraphBuilder` agent correctly reads validated relationships from SQLite and persists them as a semantically accurate graph in Neo4j.
- **Given**-- The SQLite `resolved_relationships` table contains validated relationships. The Neo4j database is empty.
- **When**-- The `GraphBuilder` agent is executed.
- **Then**-- The agent reads from SQLite and executes Cypher queries to build the graph.
- **AI-Verifiable Completion Criterion**--
    1.  **Neo4j Node Validation**:
        -   `MATCH (f:File {path: 'polyglot-test/js/auth.js'}) RETURN f.path, f.language`. The query must return one node with the correct path and language ('JavaScript').
        -   `MATCH (p:Function {name: 'authenticateUser'}) RETURN p.name, p.startLine`. The query must return one node with the correct name and an integer `startLine`.
        -   All nodes must have the correct labels (`File`, `Function`, `Class`, etc.) as specified in the schema.
    2.  **Neo4j Relationship Validation**:
        -   `MATCH (f:Function {name: 'authenticateUser'})-[r:CALLS]->(t:Function {name: 'hashPassword'}) RETURN type(r)`. The query must return one relationship of type 'CALLS'.
        -   `MATCH (file:File)-[r:CONTAINS]->(func:Function) WHERE file.path = 'polyglot-test/js/auth.js' RETURN count(func)`. The count must match the number of functions in that file.
        -   All relationship types must match the allowed types in the schema (`CONTAINS`, `CALLS`, `IMPORTS`, etc.).

---

### Phase 5-- Data Invalidation and Self-Cleaning

---

#### Test Case-- E2E-CLEAN-01-- File Deletion and Cascade Delete Validation

- **Description**-- Verifies that when a file is deleted from the source, the `SelfCleaningAgent` correctly removes the corresponding data from all databases.
- **Given**-- A complete graph exists for the `polyglot-test` directory. The file `polyglot-test/js/auth.js` is deleted from the filesystem.
- **When**-- The `SelfCleaningAgent` is executed.
- **Then**-- The agent identifies the deleted file and triggers cascade deletions.
- **AI-Verifiable Completion Criterion**--
    1.  **SQLite Validation**:
        -   `SELECT * FROM points_of_interest WHERE file_path = 'polyglot-test/js/auth.js'`. The query must return 0 rows.
        -   `SELECT * FROM resolved_relationships WHERE source_poi_id LIKE '%polyglot-test/js/auth.js%'`. The query must return 0 rows.
    2.  **Neo4j Validation**:
        -   `MATCH (f:File {path: 'polyglot-test/js/auth.js'}) RETURN f`. The query must return 0 nodes.
        -   `MATCH (p) WHERE p.id CONTAINS 'polyglot-test/js/auth.js' RETURN p`. The query must return 0 nodes (verifying POIs are also gone).
