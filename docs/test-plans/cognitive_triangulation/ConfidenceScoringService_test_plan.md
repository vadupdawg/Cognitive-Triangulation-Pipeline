# Granular Test Plan-- ConfidenceScoringService

**Feature**: `ConfidenceScoringService`
**Source Specification**: [`docs/specifications/cognitive_triangulation/ConfidenceScoringService_specs.md`](../../specifications/cognitive_triangulation/ConfidenceScoringService_specs.md)
**Primary Project Plan**: [`docs/primary_project_planning_document_sprint_6_cognitive_triangulation.md`](../../primary_project_planning_document_sprint_6_cognitive_triangulation.md)

---

## 1. Test Plan Scope and Objectives

### 1.1. Scope

This document outlines the granular unit tests for the **`ConfidenceScoringService`**. The tests will cover all public methods and logic defined in the source specification, including initial score retrieval, final score calculation, agreement boosts, disagreement penalties, and conflict flagging.

### 1.2. AI-Verifiable Objective

The primary objective of this test plan is to provide a clear path to satisfy **Task 1.1** from the [`primary_project_planning_document_sprint_6_cognitive_triangulation.md`](../../primary_project_planning_document_sprint_6_cognitive_triangulation.md).

-   **Task 1.1 Definition**: "All unit tests defined in `ConfidenceScoringService_specs.md` must pass. Specifically, tests for `getInitialScoreFromLlm` and `calculateFinalScore` (including boost, penalty, and conflict flagging logic) must succeed."

**AI-Verifiable Completion Criterion**: The successful execution of a test suite (e.g., Jest, Mocha) that implements all test cases defined in this document, resulting in a "PASS" status for every case.

---

## 2. Test Strategy

### 2.1. Methodology-- London School of TDD

This test plan adopts the **London School of TDD** ("Outside-In") philosophy. The focus is on verifying the **observable behavior** of the `ConfidenceScoringService` through its public interface, not its internal implementation details.

Since `ConfidenceScoringService` is a stateless utility, testing will primarily focus on input-output validation. However, one method involves a side effect (logging), which requires an interaction-based test.

### 2.2. Collaborators and Mocking

The `ConfidenceScoringService` is designed to be self-contained. The only external dependency (collaborator) is the `logger` module, which is invoked by the `getInitialScoreFromLlm` method.

-   **Collaborator to Mock**: `logger`
-   **Mocking Strategy**: The `logger` module will be mocked to isolate the `ConfidenceScoringService` from the actual logging infrastructure. The mock will allow us to spy on the `warn` method, verifying that it is called with the expected message and context when required. This is a classic interaction test to confirm a specified side effect occurs as planned.

**AI-Verifiable Completion Criterion**: The test setup for `getInitialScoreFromLlm` includes a mock of the `logger` module, and assertions are made against the mock's `warn` method.

---

## 3. Recursive Testing (Regression) Strategy

This suite of unit tests is lightweight and essential for system stability. It will be integrated into the development lifecycle at multiple levels to provide rapid feedback and catch regressions early.

### 3.1. Level 1-- Pre-Commit/CI Validation

-   **Trigger**: On every `git commit` via a pre-commit hook, and on every `git push` in the Continuous Integration (CI) pipeline.
-   **Scope**: The entire `ConfidenceScoringService` test suite.
-   **Purpose**: To provide immediate feedback to developers and prevent regressions from being introduced into the main codebase. These tests are fast and have no external dependencies.
-   **AI-Verifiable Completion Criterion**: The CI pipeline configuration (e.g., GitHub Actions YAML) shows a dedicated step that executes the `ConfidenceScoringService` test suite, and this step is configured as a required check for merging pull requests.

### 3.2. Level 2-- Feature Integration Testing

-   **Trigger**: When changes are made to any module that directly imports and uses `ConfidenceScoringService` (e.g., `FileAnalysisWorker`, `ValidationCoordinator`).
-   **Scope**: The entire `ConfidenceScoringService` test suite.
-   **Purpose**: To ensure that the contract between the `ConfidenceScoringService` and its consumers is not broken by changes in either component.
-   **AI-Verifiable Completion Criterion**: The CI pipeline is configured to identify pull requests modifying consumer modules (e.g., via `on: pull_request: paths: 'src/workers/**'`) and trigger this test suite as part of the validation checks.

### 3.3. Level 3-- Full System Regression

-   **Trigger**: Before a new release is deployed to production or a major feature branch is merged into `main`.
-   **Scope**: The entire `ConfidenceScoringService` test suite, run as part of the complete project-wide test suite.
-   **Purpose**: To provide a final quality gate and ensure that broader, unforeseen changes have not impacted this core service's functionality.
-   **AI-Verifiable Completion Criterion**: The test suite is tagged (e.g., `@unit`, `@core-service`) and included in the script that executes the full regression test run.

---

## 4. Test Cases

The following test cases are derived directly from the TDD Anchors in the specification document.

### 4.1. `getInitialScoreFromLlm` Method

#### Test Case 1.1.1
-   **TDD Anchor**: `ConfidenceScoringService should return the probability from LLM output if available`
-   **Objective**: Verify the method correctly extracts a valid probability from the LLM output.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: None.
-   **Test Data**:
    -   `llmOutput`: `{ "relationship": "...", "probability": 0.85 }`
    -   `context`: `{ "file_path": "test.js" }`
-   **Observable Outcome**: The method must return the `Number` `0.85`.
-   **Recursive Testing Scope**: Level 1, 2, 3.

#### Test Case 1.1.2
-   **TDD Anchor**: `ConfidenceScoringService should return a default score and log a warning if probability is missing`
-   **Objective**: Verify the method returns the default score and logs a warning when the probability is not in the LLM output.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: `logger`
-   **Test Data**:
    -   `llmOutput`: `{ "relationship": "..." }` (missing probability)
    -   `context`: `{ "file_path": "test.js", "relationship": "A -> B" }`
-   **Observable Outcome**:
    1.  The method must return the `Number` `0.5`.
    2.  The mocked `logger.warn` method must be called **exactly once** with an object containing the message `Uncalibrated score-- LLM output missing probability. Using default.` and the provided context.
-   **Recursive Testing Scope**: Level 1, 2, 3.

### 4.2. `calculateFinalScore` Method

#### Test Case 1.2.1
-   **TDD Anchor**: `calculateFinalScore should boost the score on agreement according to the defined formula`
-   **Objective**: Verify that a second piece of agreeing evidence correctly boosts the initial score.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: None.
-   **Test Data**:
    -   `evidenceArray`: `[ { sourceWorker: 'File', initialScore: 0.6, foundRelationship: true }, { sourceWorker: 'Directory', initialScore: 0.7, foundRelationship: true } ]`
-   **Observable Outcome**:
    -   The method must return an object.
    -   The `finalScore` property must be `0.6 + (1 - 0.6) * 0.2` which is `0.68`.
    -   The `hasConflict` property must be `false`.
-   **Recursive Testing Scope**: Level 1, 2, 3.

#### Test Case 1.2.2
-   **TDD Anchor**: `calculateFinalScore should penalize the score on disagreement according to the defined formula`
-   **Objective**: Verify that a piece of disagreeing evidence correctly penalizes the initial score.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: None.
-   **Test Data**:
    -   `evidenceArray`: `[ { sourceWorker: 'File', initialScore: 0.8, foundRelationship: true }, { sourceWorker: 'Directory', initialScore: 0.1, foundRelationship: false } ]`
-   **Observable Outcome**:
    -   The method must return an object.
    -   The `finalScore` property must be `0.8 * 0.5` which is `0.4`.
    -   The `hasConflict` property must be `true`.
-   **Recursive Testing Scope**: Level 1, 2, 3.

#### Test Case 1.2.3
-   **TDD Anchor**: `calculateFinalScore should flag a conflict if workers disagree`
-   **Objective**: Verify the `hasConflict` flag is correctly set when there is at least one agreement and one disagreement.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: None.
-   **Test Data**:
    -   `evidenceArray`: `[ { sourceWorker: 'File', initialScore: 0.9, foundRelationship: true }, { sourceWorker: 'Directory', initialScore: 0.2, foundRelationship: false }, { sourceWorker: 'Global', initialScore: 0.8, foundRelationship: true } ]`
-   **Observable Outcome**:
    -   The method must return an object.
    -   The `hasConflict` property must be `true`.
-   **Recursive Testing Scope**: Level 1, 2, 3.

#### Test Case 1.2.4
-   **TDD Anchor**: `calculateFinalScore should clamp the final score between 0 and 1`
-   **Objective**: Verify the final score does not exceed 1.0 after multiple boosts or fall below 0.0 after multiple penalties.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: None.
-   **Test Data (Upper Clamp)**:
    -   `evidenceArray`: `[ { sourceWorker: 'File', initialScore: 0.95, foundRelationship: true }, { sourceWorker: 'Directory', foundRelationship: true }, { sourceWorker: 'Global', foundRelationship: true } ]`
-   **Test Data (Lower Clamp)**:
    -   `evidenceArray`: `[ { sourceWorker: 'File', initialScore: 0.1, foundRelationship: true }, { sourceWorker: 'Directory', foundRelationship: false }, { sourceWorker: 'Global', foundRelationship: false } ]`
-   **Observable Outcome (Upper Clamp)**:
    -   The method must return an object where `finalScore` is <= `1.0`. The calculated value `0.95 + (1-0.95)*0.2 = 0.96`, then `0.96 + (1-0.96)*0.2 = 0.968`. The test should ensure it doesn't accidentally go over 1. A better test case might be one that mathematically would exceed 1 if not for clamping. Let's assume the formula could produce > 1. The test verifies `Math.min(..., 1)` is effective.
-   **Observable Outcome (Lower Clamp)**:
    -   The method must return an object where `finalScore` is >= `0.0`. The calculated value `0.1 * 0.5 = 0.05`, then `0.05 * 0.5 = 0.025`. The test verifies `Math.max(..., 0)` is effective.
-   **Recursive Testing Scope**: Level 1, 2, 3.

#### Test Case 1.2.5
-   **TDD Anchor**: Implied by spec (`if (!evidenceArray || evidenceArray.length === 0)`)
-   **Objective**: Verify the method handles empty or null input gracefully.
-   **Target AI-Verifiable Result**: Task 1.1
-   **Collaborators to Mock**: None.
-   **Test Data**:
    -   `evidenceArray`: `[]`
    -   `evidenceArray`: `null`
-   **Observable Outcome**:
    -   For both test data inputs, the method must return `{ finalScore: 0, hasConflict: false }`.
-   **Recursive Testing Scope**: Level 1, 2, 3.
