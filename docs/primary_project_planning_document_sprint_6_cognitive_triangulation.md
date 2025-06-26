# Primary Project Planning Document-- Sprint 6-- Cognitive Triangulation Refactor

## 1. Overview

This document outlines the detailed project plan for **Sprint 6-- Cognitive Triangulation Refactor**. The goal of this sprint is to re-architect the existing analysis pipeline into a true multi-pass, collaborative system that incorporates confidence scoring, cross-validation, and enhanced resilience.

This plan is the synthesis of all prior research, specification, and test planning. It breaks down the entire effort into granular, actionable tasks, each with a precise, **AI-verifiable end result** to ensure automated and continuous validation of progress.

**Key Source Documents--**

*   **Architecture & Strategy**: [`docs/architecture/cognitive_triangulation_improvement_plan.md`](docs/architecture/cognitive_triangulation_improvement_plan.md), [`docs/research/cognitive_triangulation_strategy_report.md`](docs/research/cognitive_triangulation_strategy_report.md)
*   **User Stories**: [`docs/specifications/user_stories/cognitive_triangulation_user_stories.md`](docs/specifications/user_stories/cognitive_triangulation_user_stories.md)
*   **Acceptance Tests**: [`docs/tests/cognitive_triangulation_master_acceptance_test_plan.md`](docs/tests/cognitive_triangulation_master_acceptance_test_plan.md), [`docs/tests/cognitive_triangulation_acceptance_tests.md`](docs/tests/cognitive_triangulation_acceptance_tests.md)
*   **Component Specifications**: All files within [`docs/specifications/cognitive_triangulation/`](docs/specifications/cognitive_triangulation/)

---

## 2. Sprint 6-- Cognitive Triangulation Refactor

### Phase 1-- Foundational Services and Data Model Changes

**Objective**: To build the core, non-worker components and update the database schema to support confidence scoring and evidence tracking.

-- **Task** -- **AI-Verifiable End Result**
-- --- -- ---
-- **1.1 Implement `ConfidenceScoringService`** -- All unit tests defined in `ConfidenceScoringService_specs.md` must pass. Specifically, tests for `getInitialScoreFromLlm` and `calculateFinalScore` (including boost, penalty, and conflict flagging logic) must succeed.
-- **1.2 Update SQLite Schema** -- A test script successfully applies the schema changes defined in `job_data_models_v2_specs.md`. An assertion confirms that the `relationships` table has the new `status` and `confidenceScore` columns, and the `relationship_evidence` table exists.
-- **1.3 Create `LlmClient` Abstraction** -- A unit test successfully instantiates the `LlmClient` and calls a generic `analyze` method, verifying that it correctly routes the call to the underlying `deepseekClient`.
-- **1.4 Implement Basic Resilience-- Retries** -- A unit test for a worker's API call shows that when the mocked `LlmClient` throws a transient error, the call is retried 3 times with exponential backoff, as verified by structured logs.
-- **1.5 Implement Basic Resilience-- Circuit Breaker** -- An integration test shows that after 3 consecutive failures from the mocked `LlmClient`, a "circuit breaker opened" message is logged, and subsequent calls are blocked for the configured duration.

### Phase 2-- Core Triangulation Logic and Worker Refactoring

**Objective**: To refactor the existing workers to interact with the new services and to implement the new `ValidationCoordinator` agent.

-- **Task** -- **AI-Verifiable End Result**
-- --- -- ---
-- **2.1 Refactor `FileAnalysisWorker` (v2)** -- A functional test runs the `FileAnalysisWorker`. It must verify that for each relationship found, `ConfidenceScoringService.getInitialScoreFromLlm` is called, the relationship is saved to SQLite with `status='PENDING_VALIDATION'`, and a `file-analysis-completed` event is correctly published to the event queue.
-- **2.2 Refactor `DirectoryResolutionWorker` (v2)** -- A functional test runs the `DirectoryResolutionWorker`. It must verify that it fetches POIs from SQLite, calls the LLM, and publishes a `directory-analysis-completed` event containing findings for all relevant relationships (both those it found and those it did not).
-- **2.3 Refactor `GlobalResolutionWorker` (v2)** -- A functional test runs the `GlobalResolutionWorker`. It must verify that it fetches directory summaries from SQLite, calls the LLM, and publishes a `global-analysis-completed` event with its findings.
-- **2.4 Implement `ValidationCoordinator`** -- Unit tests for the `ValidationCoordinator` must pass, verifying that it can correctly aggregate evidence from multiple events into its `evidenceStore`.
-- **2.5 Implement Reconciliation Logic** -- An integration test sends multiple `*-analysis-completed` events to the `ValidationCoordinator`. It must verify that `ConfidenceScoringService.calculateFinalScore` is called, a structured log is created for any conflicts, and the relationship's `status` is updated to `VALIDATED` in SQLite.
-- **2.6 Implement Evidence Trail Persistence** -- Following the integration test in 2.5, a SQL query `SELECT evidencePayload FROM relationship_evidence WHERE relationshipId = ?` must return a valid JSON object containing the evidence from all contributing workers, matching the structure in `job_data_models_v2_specs.md`.

### Phase 3-- Pipeline Integration and Final Persistence

**Objective**: To integrate all the refactored components into a complete, end-to-end pipeline and ensure the final data is correctly persisted to the Neo4j graph.

-- **Task** -- **AI-Verifiable End Result**
-- --- -- ---
-- **3.1 Implement `ValidationCoordinator` Completion Check** -- An integration test must show that after the `global-analysis-completed` event is processed, the `ValidationCoordinator` correctly identifies that the run is complete and calls `finalizeRun()`.
-- **3.2 Refactor `GraphBuilder`** -- A functional test for the `GraphBuilder` must show that it queries SQLite and only reads relationships with `status = 'VALIDATED'`.
-- **3.3 End-to-End Pipeline Integration** -- The high-level acceptance test **A-CT-01** passes. A full pipeline run on the "Ground Truth" repo results in a Cypher query `MATCH ()-[r]->() RETURN count(r) AS total, count(r.confidenceScore) AS scored` returning equal, non-zero values.
-- **3.4 Verify Agreement Boost (E2E)** -- The high-level acceptance test **A-CT-03** passes. The `confidenceScore` of a known "true positive" relationship in the final Neo4j graph is > 0.9.
-- **3.5 Verify Disagreement Penalty (E2E)** -- The high-level acceptance test **A-CT-04** passes. The `confidenceScore` of a known ambiguous relationship is < 0.3, and a discrepancy is logged.
-- **3.6 Verify Resilience (E2E)** -- The high-level acceptance test **A-CT-05** passes. The pipeline completes successfully despite 2 transient errors from the mocked LLM.
-- **3.7 Verify Health Checks** -- The high-level acceptance test **A-CT-08** passes. HTTP GET requests to `/health/liveness` and `/health/readiness` on all running services return a 200 OK status.
