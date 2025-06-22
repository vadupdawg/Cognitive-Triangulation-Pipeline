# Master Acceptance Test Plan

## 1. Introduction

This document outlines the master plan for the acceptance testing of the AI-driven code analysis pipeline. Its purpose is to define the ultimate success criteria for the project, ensuring that the final system's output perfectly matches the definitive ground truth established in the [`docs/reports/polyglot-test-analysis-report.md`](docs/reports/polyglot-test-analysis-report.md).

The acceptance test is designed to be a single, comprehensive **end-to-end (E2E)** validation. It runs the entire analysis pipeline against the `polyglot-test/` directory and verifies the resulting graph state against precise, pre-defined counts. This approach provides a black-box validation of the complete, integrated system.

The test has a clear, **AI-verifiable completion criterion**-- the exact match of entity and relationship counts in the live Neo4j database with the counts specified in the ground truth report.

## 2. Guiding Principles

-   **Authoritative Source of Truth**-- The `polyglot-test-analysis-report.md` is the single, undisputed source of truth for expected outcomes.
-   **Live System Validation**-- The test must run against a live, running Neo4j database, with no mocking of the database or the core pipeline components.
-   **Deterministic Outcome**-- Given the `polyglot-test` directory as input, the pipeline must produce the exact same graph structure every time.
-   **Actionable Feedback**-- A test failure provides immediate, specific feedback by highlighting the exact entity or relationship count that deviates from the ground truth.

## 3. Test Strategy-- Ground Truth Validation

The testing strategy has been consolidated into a single, primary E2E test case that serves as the definitive measure of project success. The previous phased approach and multiple, isolated test cases are now superseded by this unified validation method.

The pipeline is executed on the entire `polyglot-test` directory. After completion, a series of Cypher queries are run against the Neo4j database to count all generated nodes by label and relationships by type. These counts are then asserted against the "My Count" column in the ground truth report.

## 4. The Definitive Acceptance Test

The following E2E test constitutes the sole acceptance test for the project. It fully encapsulates the final definition of "done."

---

### Test Case-- A-01 (Ground Truth Validation)

-   **Test Name**-- `test_ground_truth_validation`
-   **Objective**-- Verify that the pipeline, when run on the `polyglot-test` directory, produces a Neo4j graph that perfectly matches the entity and relationship counts specified in the `polyglot-test-analysis-report.md`.
-   **Test Data**-- The entire `polyglot-test/` directory.
-   **AI-Verifiable Completion Criterion**--
    1.  The pipeline completes with a zero exit code.
    2.  The Neo4j database is queried for the counts of all node labels and relationship types.
    3.  The following assertions **must all be true**:
        -   `MATCH (n:File) RETURN count(n)` must equal **15**.
        -   `MATCH (n:Database) RETURN count(n)` must equal **1**.
        -   `MATCH (n:Table) RETURN count(n)` must equal **15**.
        -   `MATCH (n:Class) RETURN count(n)` must equal **20**.
        -   `MATCH (n:Function) RETURN count(n)` must equal **203**.
        -   `MATCH (n:Variable) RETURN count(n)` must equal **59**.
        -   `MATCH ()-[r:IMPORTS]->() RETURN count(r)` must equal **65**.
        -   `MATCH ()-[r:EXPORTS]->() RETURN count(r)` must equal **38**.
        -   `MATCH ()-[r:EXTENDS]->() RETURN count(r)` must equal **2**.
        -   `MATCH ()-[r:CONTAINS]->() RETURN count(r)` must equal **381**.
        -   `MATCH ()-[r:CALLS]->() RETURN count(r)` must be approximately **135** (within a defined tolerance, e.g., +/- 5%).
        -   `MATCH ()-[r:USES]->() RETURN count(r)` must be approximately **200** (within a defined tolerance, e.g., +/- 5%).

A successful run of this single test case, verifying all counts, confirms that the system meets its core requirements and is considered complete.