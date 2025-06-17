# High-Level Test Strategy-- Universal Code Graph V4 (LLM-Only Architecture)

## 1. Introduction & Guiding Principles

This document outlines the testing strategy for the Universal Code Graph V4 project. This version adheres to a strict **100% LLM-only architecture**, where all code analysis is performed by a Large Language Model. The primary goal is to ensure the pipeline is deterministic and resilient, producing a high-fidelity knowledge graph based solely on the LLM's interpretation of the source code.

Our testing approach is guided by the following principles--

- **Confidence in the LLM's Output**-- Tests must validate that the system accurately transforms code into a queryable graph *according to our defined data contract*.
- **Focus on Pipeline Mechanics**-- We must ensure the plumbing of the system--file discovery, queueing, and ingestion--is flawless.
- **Automate Everything**-- All tests must be automated to support CI/CD and continuous monitoring of the LLM's performance.
- **Embrace and Test for Change**-- The system must be tested against realistic failure modes and, critically, against potential behavioral shifts in the underlying LLM provider's models.

## 2. Overall Testing Approach-- Validating Mechanics and Model

Our testing model focuses on two distinct but complementary areas--

-   **End-to-End (E2E) Pipeline Tests (70% Focus)**-- These are the most critical tests for validating the system's mechanics. They treat the entire pipeline as a black box, feeding a repository at the input and asserting the final state of the Neo4j graph at the output. This is the ultimate measure of the system's operational success.
-   **Model Evaluation Tests (30% Focus)**-- These tests are designed to evaluate the **consistency and stability of the LLM's output over time**. Their goal is to detect regressions or significant changes in the LLM's analytical behavior, especially when the model provider pushes updates.

## 3. Key Test Scenarios (AI-Verifiable)

These scenarios represent the core user stories and critical paths. Each test is AI-verifiable, meaning its success or failure can be determined programmatically.

#### Scenario 1-- Processing a New Repository from Scratch

-   **Description**-- Validates the pipeline's mechanical ability to process a "greenfield" repository.
-   **Verification**--
    1.  **SQLite State**-- Assert that all tasks in `work_queue` are `completed` and all items in `analysis_results` are `ingested`.
    2.  **Neo4j Graph State**-- Execute a Cypher query against the Neo4j database to compare the resulting graph structure against a pre-defined "golden" graph. This golden graph is generated directly from our **manually-verified, ideal LLM output** for the sample codebase.

#### Scenario 2-- Processing an Incremental Update

-   **Description**-- Validates the `ScoutAgent`'s change detection and the pipeline's ability to correctly update the graph based on file modifications.
-   **Verification**--
    1.  **SQLite State**-- Assert that the `work_queue` only contained tasks for the new/modified files and `refactoring_tasks` for deleted/renamed files.
    2.  **Neo4j Graph State**-- Assert the graph correctly reflects all additions, modifications, and deletions, again by comparing it to the expected state derived from the golden LLM output.

#### Scenario 3-- Model Stability and Regression Testing

-   **Description**-- Tests the consistency of the `WorkerAgent`'s LLM analysis over time, guarding against unannounced changes or regressions in the provider's model.
-   **Setup**--
    1.  A curated set of diverse and complex "litmus test" code files.
    2.  A stored set of "golden" JSON outputs for each of these files. These golden files represent the **manually verified, ideal analysis from a known-good version of the LLM**.
-   **Execution & Verification**--
    1.  Periodically (e.g., nightly) and on-demand after a suspected model update, run the litmus test files through the `WorkerAgent`.
    2.  Perform a deep comparison between the newly generated JSON and the stored "golden" JSON.
    3.  The test fails if there are significant, unexpected deviations, such as missing entities, incorrect relationships, or altered `qualifiedName` structures. This failure indicates a regression in the LLM's analytical capabilities that must be addressed through prompt engineering or other mitigation strategies.

## 4. Test Data Strategy

#### LLM Golden Output Dataset

-   **Sourcing**-- We will maintain a dedicated `test-data` directory containing small, representative codebases from various languages and paradigms.
-   **Golden Output Generation**-- For each test codebase, the process is as follows--
    1. Run the code through the `WorkerAgent` using a known-good version of the LLM.
    2. **Manually inspect and verify the resulting JSON output.** This human-in-the-loop step is critical. We are validating that the LLM's interpretation aligns with our desired level of detail and correctness.
    3. Store this verified JSON as the "golden output".
    4. This "golden output" is the ground truth for all correctness tests. It is used to generate the expected Neo4j state for E2E tests and serves as the baseline for Model Stability tests.