# Granular E2E Master Acceptance Test Plan

## 1. Introduction

This document outlines the Master Acceptance Test Plan for the cognitive triangulation pipeline. It is based on the detailed process flow described in the [`docs/research/application_pipeline_map.md`](../research/application_pipeline_map.md).

The testing strategy adheres to a "no mocking" principle, requiring all tests to be executed against live instances of all external dependencies, including Redis, SQLite, Neo4j, and the Deepseek AI service. Each test case is designed as a granular, end-to-end (E2E) scenario that verifies a specific step in the application pipeline. Every test includes an AI-verifiable completion criterion to enable automated validation of the system's behavior.

A small, well-defined `polyglot-test` directory will be used as the target for analysis in all test cases to ensure consistent and predictable outcomes.

## 2. Test Environment & Dependencies

- **Target Codebase**: The `polyglot-test` directory.
- **Node.js**: Runtime environment.
- **Redis**: Live instance for BullMQ and caching.
- **SQLite**: Live instance for transactional data.
- **Neo4j**: Live instance with the APOC library installed.
- **Deepseek AI**: A valid API key must be configured in the environment.

## 3. High-Level Acceptance Tests

### Phase 1-- Pipeline Initiation & Job Creation

---

#### Test Case-- E2E-INIT-01-- CLI-Triggered Run

- **Description**-- Verifies that the pipeline can be successfully initiated via the command-line interface (`src/main.js`), and that the `EntityScout` agent correctly populates the initial job queues.
- **Given**-- A clean environment (empty Redis queues, empty SQLite `outbox` and `relationships` tables).
- **When**-- The command `node src/main.js --target polyglot-test` is executed.
- **Then**-- The `EntityScout` agent scans the `polyglot-test` directory and creates jobs.
- **AI-Verifiable Completion Criterion**--
    1.  The `file-analysis-queue` in BullMQ (Redis) must contain a job for every file inside the `polyglot-test` directory.
    2.  The `directory-resolution-queue` in BullMQ (Redis) must contain a job for every subdirectory within `polyglot-test`.
    3.  A run manifest key must exist in Redis containing metadata about the initiated run.

---

### Phase 2-- Core Analysis Pipeline

---

#### Test Case-- E2E-CORE-01-- File-Level POI Analysis

- **Description**-- Verifies that the `FileAnalysisWorker` correctly processes a file, queries the LLM, and persists the findings to the transactional outbox.
- **Given**-- An `analyze-file` job for a specific file (e.g., `polyglot-test/js/auth.js`) is present in the `file-analysis-queue`.
- **When**-- The `FileAnalysisWorker` consumes and processes the job.
- **Then**-- The worker sends the file's content to the Deepseek LLM and receives a list of Points of Interest (POIs).
- **AI-Verifiable Completion Criterion**--
    1.  A new record with the `event_type` of `file-analysis-finding` must be created in the SQLite `outbox` table.
    2.  The `payload` of this record must be a valid JSON structure containing POIs (e.g., function definitions, imports) identified from the source file.

---

#### Test Case-- E2E-CORE-02-- Directory-Level Summary

- **Description**-- Verifies that the `DirectoryResolutionWorker` correctly generates and persists a summary for a directory.
- **Given**-- An `analyze-directory` job for a specific directory (e.g., `polyglot-test/python`) is present in the `directory-resolution-queue`.
- **When**-- The `DirectoryResolutionWorker` consumes and processes the job.
- **Then**-- The worker sends the contents of all files in the directory to the LLM and receives a summary.
- **AI-Verifiable Completion Criterion**--
    1.  A new record with the `event_type` of `directory-analysis-finding` must be created in the SQLite `outbox` table.
    2.  The `payload` of this record must contain a non-empty string with the LLM-generated summary.

---

#### Test Case-- E2E-CORE-03-- Intra-File Relationship Analysis

- **Description**-- Verifies that after a file analysis is complete, the `TransactionalOutboxPublisher` and `RelationshipResolutionWorker` collaborate to identify relationships between POIs within that file.
- **Given**-- A `file-analysis-finding` event exists in the `outbox` table.
- **When**--
    1. The `TransactionalOutboxPublisher` polls the `outbox` and creates a `relationship-resolution` job.
    2. The `RelationshipResolutionWorker` consumes and processes the job.
- **Then**-- The worker queries the LLM to find relationships between the POIs from the initial analysis.
- **AI-Verifiable Completion Criterion**--
    1.  A new record with the `event_type` of `relationship-analysis-finding` must be created in the SQLite `outbox` table.
    2.  The `payload` of this record must be a valid JSON structure containing identified relationships (e.g., `CALLS`, `IMPORTS`) between the POIs of the file.

---

### Phase 3-- Validation, Reconciliation, and Persistence

---

#### Test Case-- E2E-VALID-01-- Evidence Aggregation

- **Description**-- Verifies that the `ValidationWorker` correctly aggregates evidence for a relationship and tracks its progress.
- **Given**-- A `relationship-analysis-finding` event exists in the `outbox` table, which is then moved to the `analysis-findings-queue`.
- **When**-- The `ValidationWorker` consumes the job from the `analysis-findings-queue`.
- **Then**-- The worker persists the finding as evidence and updates the central counter.
- **AI-Verifiable Completion Criterion**--
    1.  A new record must be created in the `relationship_evidence` table in SQLite, corresponding to the finding.
    2.  A Redis key for the relationship's evidence count must be incremented to `1`.

---

#### Test Case-- E2E-RECON-01-- Relationship Reconciliation and Scoring

- **Description**-- Verifies that the `ReconciliationWorker` correctly calculates a confidence score and persists a `VALIDATED` relationship when the score exceeds the configured threshold.
- **Given**-- A `reconcile-relationship` job exists in the `reconciliation-queue` (triggered previously by the `ValidationWorker`).
- **When**-- The `ReconciliationWorker` consumes and processes the job.
- **Then**-- The `ConfidenceScoringService` calculates a score based on all available evidence.
- **AI-Verifiable Completion Criterion**--
    1.  Assuming the confidence score exceeds the threshold, a new record must be created in the `relationships` table in SQLite with a `status` of `VALIDATED`.
    2.  The `source_poi_id` and `target_poi_id` in the record must correctly link to existing POIs.

---

#### Test Case-- E2E-BUILD-01-- Knowledge Graph Construction

- **Description**-- Verifies that the `GraphBuilder` agent can successfully read validated relationships from SQLite and persist them as a graph in Neo4j.
- **Given**-- The SQLite `relationships` table contains at least one `VALIDATED` relationship. The Neo4j database is empty.
- **When**-- The `GraphBuilder` agent is executed after all other pipeline jobs for the run are complete.
- **Then**-- The agent reads the validated data and executes Cypher queries to build the graph.
- **AI-Verifiable Completion Criterion**--
    1.  Execute a Cypher query in Neo4j-- `MATCH (n)-[r]->(m) RETURN count(r) AS relationshipCount`.
    2.  The `relationshipCount` must be greater than 0 and match the number of `VALIDATED` relationships in the SQLite `relationships` table for the completed run.