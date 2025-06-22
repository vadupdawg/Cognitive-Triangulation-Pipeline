# Primary Project Planning Document-- Ground Truth Validation

## 1. Project Vision and Core Objective

**Vision**-- To create a sophisticated, AI-driven pipeline that analyzes the `polyglot-test/` codebase and generates a Neo4j knowledge graph that is a **100% verifiable match** with the established ground truth.

**Core Objective**-- The single, definitive goal of this project is to **pass the `A-01_ground_truth_validation.test.js` acceptance test**. This test verifies that the pipeline's output perfectly matches the entity and relationship counts detailed in the [`docs/reports/polyglot-test-analysis-report.md`](docs/reports/polyglot-test-analysis-report.md).

**Primary Success Metric**-- A successful, zero-failure execution of the ground truth acceptance test, confirming that all 11 node and relationship count assertions pass.

---

## 2. The Three-Phase Plan to Ground Truth

The project is structured into three sequential phases, each building upon the last to achieve the final, verifiable outcome.

### Phase 1: Foundation and File Scouting

**Goal**-- Establish the project's foundational infrastructure and develop a `ScoutAgent` that can accurately discover and catalog the 15 source files within the `polyglot-test/` directory.

**AI-Verifiable End Result**--
1.  The intermediate SQLite and Neo4j databases are created with schemas matching the [`docs/specifications/database_schema_specs.md`](docs/specifications/database_schema_specs.md).
2.  The `ScoutAgent`, when run, populates the `files` table in the SQLite database with exactly **15** records, corresponding to the files in the `polyglot-test/` directory. This is verifiable with the SQL query `SELECT count(*) FROM files;`.

**Tasks**--
*   **Task 1.1: Initialize Databases**
    *   **Description**-- Create the `initializeDb.js` and `neo4jDriver.js` scripts.
    *   **Functions to Build**-- `initializeDb()`, `getNeo4jDriver()`
    *   **AI-Verifiable End Result**-- The database schemas are validated against the specifications.
*   **Task 1.2: Implement `ScoutAgent`**
    *   **Description**-- Create the `ScoutAgent` to discover files, detect languages, and save records to the database.
    *   **Classes to Build**-- `ScoutAgent`
    *   **Functions to Build**-- `constructor()`, `run()`, `discoverFiles()`, `detectLanguage()`, `calculateChecksum()`, `saveFilesToDb()`
    *   **AI-Verifiable End Result**-- `ScoutAgent.run()` populates the database with the 15 target files.

### Phase 2: Language-Specific Analysis with Worker Agents

**Goal**-- Develop `WorkerAgent`(s) that use language-specific parsers to analyze each of the 15 files and produce structured JSON output containing the exact entities and relationships required to match the ground truth.

**AI-Verifiable End Result**--
1.  The `WorkerAgent` class and its language-specific parsing methods are fully implemented.
2.  After the `WorkerAgent`(s) run, the `analysis_results` table in SQLite is populated with 15 records, one for each file.
3.  The combined JSON in these records, when aggregated, must contain the exact counts of entities specified in the ground truth report (e.g., 20 Classes, 203 Functions, 59 Variables).

**Tasks**--
*   **Task 2.1: Implement `WorkerAgent` Core**
    *   **Description**-- Create the main `WorkerAgent` class for fetching files and managing the process.
    *   **Classes to Build**-- `WorkerAgent`
    *   **Functions to Build**-- `constructor()`, `run()`, `getNextFile()`, `processFile()`, `saveResult()`, `updateFileStatus()`
    *   **AI-Verifiable End Result**-- The agent can successfully process the file queue.
*   **Task 2.2: Implement Language-Specific Parsers**
    *   **Description**-- Implement the parsing logic for each language to extract entities and relationships according to the specs.
    *   **Functions to Build**-- `parseJavaScript()`, `parsePython()`, `parseJava()`, `parseSql()`
    *   **AI-Verifiable End Result**-- Each parser, when run on its corresponding test files, produces a JSON structure that correctly identifies the entities and relationships as per the ground truth analysis.

### Phase 3: Graph Ingestion and Final Validation

**Goal**-- Develop the `GraphIngestorAgent` to flawlessly transform the JSON analysis results from SQLite into the final Neo4j knowledge graph, and then pass the definitive acceptance test.

**AI-Verifiable End Result**--
1.  The `GraphIngestorAgent` is fully implemented.
2.  **The `A-01_ground_truth_validation.test.js` test passes with zero failures.** This is the ultimate, non-negotiable end result for the entire project.

**Tasks**--
*   **Task 3.1: Implement `GraphIngestorAgent`**
    *   **Description**-- Create the `GraphIngestorAgent` to read from SQLite and write to Neo4j idempotently.
    *   **Classes to Build**-- `GraphIngestorAgent`
    *   **Functions to Build**-- `constructor()`, `run()`, `getNextResult()`, `processResult()`, `createNode()`, `createRelationship()`
    *   **AI-Verifiable End Result**-- The agent processes all 15 results from the `analysis_results` table.
*   **Task 3.2: Execute the Definitive Acceptance Test**
    *   **Description**-- Run the entire pipeline from start to finish, culminating in the execution of the master acceptance test.
    *   **Test Script to Run**-- `tests/acceptance/A-01_ground_truth_validation.test.js`
    *   **AI-Verifiable End Result**-- The test script exits with code 0, and the console output confirms all 11 assertions for node and relationship counts have passed.