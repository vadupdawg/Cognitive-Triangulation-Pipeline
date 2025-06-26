# Cognitive Triangulation -- Master Acceptance Test Plan

## 1. Introduction

This document provides the Master Acceptance Test Plan for the Cognitive Triangulation architectural refactor. It is designed to guide the validation of the system against the goals and features outlined in the [`cognitive_triangulation_improvement_plan.md`](../../architecture/cognitive_triangulation_improvement_plan.md).

This plan is directly derived from the strategies defined in the [`cognitive_triangulation_test_strategy.md`](../../research/cognitive_triangulation_test_strategy.md) and is built to verify the user outcomes specified in [`cognitive_triangulation_user_stories.md`](../../specifications/user_stories/cognitive_triangulation_user_stories.md).

The primary objective is to ensure that the refactored system meets the required standards of accuracy, reliability, and observability through a series of AI-verifiable acceptance tests.

## 2. Testing Focus -- Critical Validation Areas

Our testing will be concentrated on the four critical areas identified in the test strategy document--

1.  **Accuracy of Confidence Scoring & Evidence**: Verifying that confidence scores are meaningful, auditable, and correctly calibrated.
2.  **Correctness of Cross-Validation Logic**: Ensuring the "peer-review" mechanism correctly boosts scores on agreement and lowers them on disagreement.
3.  **System Resilience Under Failure**: Validating the system's robustness against transient errors through retries and circuit breakers.
4.  **Observability and Status Monitoring**: Confirming that system health and job status are transparent and accessible.

## 3. Methodology

A multi-faceted testing methodology will be employed to ensure comprehensive coverage--

-- **End-to-End (E2E) Acceptance Testing**: This is the primary method. We will execute full analysis pipeline runs on curated test repositories and assert the final state of the Neo4j graph, SQLite database, and structured logs. This approach validates the system from a black-box, user-centric perspective.

-- **Integration Testing (Agent Collaboration)**: Focused tests will be used to validate the specific interactions between analysis agents (e.g., `FileAnalysisWorker`, `DirectoryResolutionWorker`) to ensure the data reconciliation and cross-validation logic is correct in isolation.

-- **Chaos Testing (Failure Injection)**: To validate resilience, we will deliberately inject failures by mocking external services (e.g., `deepseekClient`) to return errors or timeouts. This will test the system's retry logic and circuit breaker patterns.

## 4. Test Data & Environments

Testing will be conducted in a production-like environment. External dependencies, particularly the LLM API, will be mocked to allow for deterministic failure injection and consistent test execution.

The following repository types, as defined in the test strategy, are required--

-- **"Ground Truth" Repository**: A small, human-vetted codebase for measuring the accuracy of confidence scores.
-- **"Ambiguity" Repository**: A codebase with confusing patterns to test the system's handling of uncertainty.
-- **"Polyglot" Repository**: The `polyglot-test` project to validate cross-language analysis.
-- **"Large-Scale" Repository**: A real-world open-source project for performance and scalability testing.
-- **"Malformed" Repository**: A codebase with syntax errors to test robust error handling.

## 5. AI-Verifiable Success Criteria

Success is defined by the following quantifiable metrics. Each metric is designed to be programmatically verifiable by an AI or an automated script, forming the basis for our pass/fail criteria.

-- Category -- Metric -- Target
-- --- -- --- -- ---
-- **Confidence & Accuracy** -- Correlation between system confidence scores and human-annotated "ground truth" data. -- Spearman Correlation > 0.7
-- -- Percentage of known "false positives" correctly assigned a low confidence score (<0.3). -- > 80%
-- -- Percentage of known "true positives" receiving a score boost from agent agreement. -- > 90%
-- **Resilience** -- Successful pipeline completion rate when subjected to a 5% transient LLM error rate. -- > 99%
-- -- Time-to-recovery for a tripped circuit breaker. -- Recovers within the configured window.
-- **Performance** -- Performance overhead introduced by the refactor on a benchmark repository. -- < 15% increase in total run time.
-- **Observability** -- Uptime and response time of `/health/readiness` and `/health/liveness` endpoints. -- 100% uptime during test runs.

## 6. Test Phases

The testing process will be executed in the following phases--

1.  **Phase 1 - Foundational Accuracy**: Execute tests using the "Ground Truth" and "Ambiguity" repositories to validate the core confidence scoring and cross-validation logic.
2.  **Phase 2 - Resilience & Error Handling**: Execute chaos tests and tests on the "Malformed" repository to validate the system's robustness.
3.  **Phase 3 - Integration & Scale**: Execute tests on the "Polyglot" and "Large-Scale" repositories to validate performance and cross-language capabilities.

## 7. High-Level Acceptance Tests

The concrete, high-level acceptance tests that define the success of this project are documented in--
[`cognitive_triangulation_acceptance_tests.md`](./cognitive_triangulation_acceptance_tests.md).

These tests are implemented in the test suite at--
`tests/acceptance/cognitive_triangulation.spec.js`.