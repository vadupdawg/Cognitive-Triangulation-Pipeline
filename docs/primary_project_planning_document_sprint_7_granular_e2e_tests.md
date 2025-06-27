# Primary Project Planning Document-- Sprint 7-- Granular E2E Tests

## 1. Introduction

This document outlines the project plan for implementing the new, granular End-to-End (E2E) testing pipeline for the cognitive triangulation system. The plan is derived from the master acceptance tests defined in the [`docs/tests/granular_e2e_master_acceptance_test_plan.md`](./tests/granular_e2e_master_acceptance_test_plan.md) and the implementation details in [`tests/acceptance/granular_e2e_pipeline.spec.js`](../../tests/acceptance/granular_e2e_pipeline.spec.js).

The primary goal of this sprint is to build and validate a "no mocking" E2E test suite that runs against live service instances to ensure the reliability and correctness of the entire data processing pipeline. Each task is defined with a clear, AI-verifiable end result to facilitate automated verification and continuous integration.

## 2. Sprints & Phases

### Sprint 7-- Granular E2E Pipeline Implementation

#### Phase 1-- Pipeline Initiation & Job Creation

**Objective**-- To ensure the system can be correctly initiated and that the initial job creation process populates the queues as expected.

---

**Task 1.1-- Implement CLI Entry Point for Pipeline Trigger**

*   **Description**-- Create and configure the main entry point for the application at [`src/main.js`](../../src/main.js) to accept command-line arguments, specifically the `--target` directory. This script will be responsible for instantiating and running the `EntityScout` agent.
*   **Functions/Classes to Build**--
    *   `main` function within [`src/main.js`](../../src/main.js).
*   **AI-Verifiable End Result**--
    *   Executing `node src/main.js --target polyglot-test` runs without errors.

---

**Task 1.2-- Implement `EntityScout` Agent for Job Creation**

*   **Description**-- Develop the `EntityScout` agent to scan the target directory, identify all files and subdirectories, and create corresponding jobs in the appropriate BullMQ queues.
*   **Functions/Classes to Build**--
    *   `EntityScout` class.
    *   `run()` method within `EntityScout`.
*   **AI-Verifiable End Result** (Test Case E2E-INIT-01)--
    1.  The `file-analysis-queue` in Redis contains a job for every file in the `polyglot-test` directory.
    2.  The `directory-resolution-queue` in Redis contains a job for every subdirectory in the `polyglot-test` directory.
    3.  A Redis key matching the pattern `run--*` exists, containing the run manifest.

---

#### Phase 2-- Core Analysis Pipeline

**Objective**-- To build the core workers responsible for file analysis, directory summarization, and intra-file relationship discovery.

---

**Task 2.1-- Implement `FileAnalysisWorker`**

*   **Description**-- Create a worker to process jobs from the `file-analysis-queue`. This worker will read the file content, query the Deepseek LLM to identify Points of Interest (POIs), and save the findings.
*   **Functions/Classes to Build**--
    *   `FileAnalysisWorker` class.
    *   `processJob(job)` method within `FileAnalysisWorker`.
*   **AI-Verifiable End Result** (Test Case E2E-CORE-01)--
    *   A record with `event_type` = `file-analysis-finding` is created in the SQLite `outbox` table, with a JSON payload containing an array of POIs.

---

**Task 2.2-- Implement `DirectoryResolutionWorker`**

*   **Description**-- Create a worker to process jobs from the `directory-resolution-queue`. This worker will aggregate the content of all files within a directory, query the LLM for a summary, and persist the result.
*   **Functions/Classes to Build**--
    *   `DirectoryResolutionWorker` class.
    *   `processJob(job)` method within `DirectoryResolutionWorker`.
*   **AI-Verifiable End Result** (Test Case E2E-CORE-02)--
    *   A record with `event_type` = `directory-analysis-finding` is created in the SQLite `outbox` table, with a payload containing a non-empty summary string.

---

**Task 2.3-- Implement `TransactionalOutboxPublisher` and `RelationshipResolutionWorker`**

*   **Description**-- Implement two components-- 1) a publisher that polls the `outbox` table for new `file-analysis-finding` events and creates jobs for relationship resolution, and 2) a worker that consumes these jobs, queries the LLM to find relationships between POIs within a single file, and persists the findings.
*   **Functions/Classes to Build**--
    *   `TransactionalOutboxPublisher` service/class.
    *   `RelationshipResolutionWorker` class.
    *   `processJob(job)` method within `RelationshipResolutionWorker`.
*   **AI-Verifiable End Result** (Test Case E2E-CORE-03)--
    *   A record with `event_type` = `relationship-analysis-finding` is created in the SQLite `outbox` table, with a JSON payload containing an array of relationships.

---

#### Phase 3-- Validation, Reconciliation, and Persistence

**Objective**-- To validate findings, score relationships for confidence, and build the final knowledge graph.

---

**Task 3.1-- Implement `ValidationWorker` for Evidence Aggregation**

*   **Description**-- Create a worker that consumes `relationship-analysis-finding` events. It will persist each finding as a piece of evidence and update a counter to track how many times a particular relationship has been identified.
*   **Functions/Classes to Build**--
    *   `ValidationWorker` class.
    *   `processJob(job)` method within `ValidationWorker`.
*   **AI-Verifiable End Result** (Test Case E2E-VALID-01)--
    1.  A new record is created in the `relationship_evidence` table in SQLite.
    2.  A Redis key for the relationship's evidence count is incremented.

---

**Task 3.2-- Implement `ReconciliationWorker` and `ConfidenceScoringService`**

*   **Description**-- Develop a worker that triggers a confidence score calculation when new evidence is added. The associated service will calculate the score. If the score meets the threshold, the relationship is marked as `VALIDATED`.
*   **Functions/Classes to Build**--
    *   `ReconciliationWorker` class.
    *   `ConfidenceScoringService` class.
*   **AI-Verifiable End Result** (Test Case E2E-RECON-01)--
    *   A record in the `relationships` table in SQLite is updated to have a `status` of `VALIDATED` and a `confidence_score` greater than 0.

---

**Task 3.3-- Implement `GraphBuilder` Agent**

*   **Description**-- Create a final agent that runs after all pipeline processing is complete for a given run. This agent will read all `VALIDATED` relationships from the SQLite `relationships` table and construct the corresponding nodes and relationships in the Neo4j database.
*   **Functions/Classes to Build**--
    *   `GraphBuilder` class.
    *   `run()` method within `GraphBuilder`.
*   **AI-Verifiable End Result** (Test Case E2E-BUILD-01)--
    *   A Cypher query (`MATCH (n)-[r]->(m) RETURN count(r) AS relationshipCount`) executed against the Neo4j database returns a `relationshipCount` that is greater than 0 and matches the number of `VALIDATED` relationships in SQLite.