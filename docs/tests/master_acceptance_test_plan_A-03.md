# Master Acceptance Test Plan -- Granular E2E Validation (A-03)

## 1.0 Overview

This document outlines the master acceptance test plan for the V2 high-performance pipeline, focusing on a "glass-box" testing methodology. The primary objective is to move beyond black-box, end-state validation and implement granular checks at each data persistence layer (Redis, SQLite, Neo4j). This ensures not only that the pipeline completes but that each stage correctly transforms and persists the data required by the subsequent stage.

The ultimate success criterion is the successful execution of the `A-03_v2_granular_e2e_validation.test.js` suite, which programmatically verifies the data integrity and schema correctness at each step.

## 2.0 Test Strategy

The strategy is centered around **verifiable data state transitions**. Instead of only checking the final graph, we will intercept and validate the data at intermediate storage points. This approach provides earlier and more precise feedback, pinpointing failures to the exact pipeline stage where they occur.

-- **Ground Truth Source**-- The definitive reference for the final graph state is the [`polyglot-test-analysis-report.md`](../../docs/reports/polyglot-test-analysis-report.md).
-- **Test Target**-- The test will execute the full V2 pipeline against the `polyglot-test/` directory.
-- **Methodology**-- Glass-Box Validation.

## 3.0 Test Phases & AI-Verifiable Criteria

The test is implemented as a single, sequential process within `tests/acceptance/A-03_v2_granular_e2e_validation.test.js`. The phases below correspond to validation checkpoints within that test.

### Phase 1-- Environment Initialization

*   **Description**-- Before the pipeline runs, all data stores are wiped to ensure a clean, deterministic test environment.
*   **AI-Verifiable Completion Criterion**--
    *   Execution of `clearRedis()`, `clearSqlite()`, and `clearNeo4j()` completes without error.
    *   A pre-check on Redis, SQLite, and Neo4j confirms they are empty of project-specific data.

### Phase 2-- Pipeline Execution & Initial Redis Validation (Post-EntityScout)

*   **Description**-- The V2 pipeline is executed. The first checkpoint validates the initial jobs created by the `EntityScout` service and stored in Redis.
*   **AI-Verifiable Completion Criterion**--
    *   The pipeline process exits with code 0.
    *   Redis `EXISTS` command returns `1` for keys `llm-analysis-queue` and `graph-ingestion-queue`.
    *   Redis `HGETALL` on `run_manifest` returns a hash containing a `status` field.
    *   Redis `LLEN` on `llm-analysis-queue` returns `15`, matching the number of files in the test directory.

### Phase 3-- SQLite Schema & Data Validation (Post-AnalysisWorkers)

*   **Description**-- After the analysis workers have processed the files, this phase validates the structure and content of the intermediate SQLite database.
*   **AI-Verifiable Completion Criterion**--
    *   `PRAGMA table_info(points_of_interest)` returns column definitions matching the spec (id, file_path, entity_type, entity_name, code_snippet).
    *   `PRAGMA table_info(resolved_relationships)` returns column definitions matching the spec (id, source_entity_id, target_entity_id, relationship_type).
    *   A `SELECT` query for a known entity (e.g., `DataService` class) returns a row with the correct `entity_type` ('Class') and `file_path`.

### Phase 4-- Neo4j Final State Validation (Post-GraphIngestionWorker)

*   **Description**-- This is the final state-of-the-world check, verifying that the aggregated and processed data has been correctly ingested into the Neo4j graph.
*   **AI-Verifiable Completion Criterion**--
    *   `MATCH` queries for node counts (`File`, `Class`, `Function`, etc.) return values that exactly match the counts specified in the ground truth report.
    *   `MATCH` queries for relationship counts (`IMPORTS`, `CONTAINS`, etc.) return values that exactly match the counts specified in the ground truth report.
    *   A specific `MATCH` query confirms a known relationship exists (e.g., `(Class {name-- 'DataService'})-[:USES]->(Database)`).

## 4.0 Test Implementation

*   **Test Plan Document**-- [`docs/tests/master_acceptance_test_plan_A-03.md`](./master_acceptance_test_plan_A-03.md)
*   **High-Level Test File**-- [`tests/acceptance/A-03_v2_granular_e2e_validation.test.js`](../../tests/acceptance/A-03_v2_granular_e2e_validation.test.js)