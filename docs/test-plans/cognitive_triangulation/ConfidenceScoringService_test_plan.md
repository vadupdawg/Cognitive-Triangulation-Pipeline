# Granular Test Plan-- ConfidenceScoringService

## 1. Introduction and Purpose

This document outlines the detailed test plan for the `ConfidenceScoringService`, a critical component within the Cognitive Triangulation v2 architecture. The purpose of this plan is to provide a clear, actionable strategy for verifying the correctness and reliability of the service's logic, ensuring it aligns perfectly with its specifications and the project's overall goals.

This plan adheres to London School of TDD principles, focusing on interaction-based testing and observable outcomes. It is designed to be used by both human developers and AI agents to implement a comprehensive suite of unit tests.

**Source Documents--**
-   **Specification**: [`docs/specifications/cognitive_triangulation/ConfidenceScoringService_specs.md`](docs/specifications/cognitive_triangulation/ConfidenceScoringService_specs.md)
-   **Primary Project Plan**: [`docs/primary_project_planning_document_sprint_6_cognitive_triangulation.md`](docs/primary_project_planning_document_sprint_6_cognitive_triangulation.md)

---

## 2. Test Scope and AI-Verifiable End Result

### 2.1. In Scope

-   Unit testing of all public methods within the `ConfidenceScoringService`.
-   Verification of all logic paths, including boosts, penalties, and conflict flagging.
-   Validation of interactions with external collaborators (e.g., the `logger`).

### 2.2. Out of Scope

-   Integration testing of the `ConfidenceScoringService` with other system components (this will be covered in separate, higher-level test plans).
-   Performance testing.

### 2.3. AI-Verifiable End Result Targeted

This test plan is designed to directly satisfy the following AI-verifiable end result from the primary project planning document--

-   **Task 1.1 Implement `ConfidenceScoringService`**: 'All unit tests defined in `ConfidenceScoringService_specs.md` must pass. Specifically, tests for `getInitialScoreFromLlm` and `calculateFinalScore` (including boost, penalty, and conflict flagging logic) must succeed.'

**AI Verifiable Completion Criterion for this Test Plan**: The existence of this document at the path [`docs/test-plans/cognitive_triangulation/ConfidenceScoringService_test_plan.md`](docs/test-plans/cognitive_triangulation/ConfidenceScoringService_test_plan.md) and the successful execution of all test cases defined herein.

---

## 3. Test Strategy-- London School of TDD

Our testing strategy is rooted in the **London School of TDD**. We will test the `ConfidenceScoringService` as a "unit" and focus on its observable behavior through its interactions with collaborators, rather than inspecting its internal state.

-   **Interaction-Based Testing**: Tests will be structured to verify that the service produces the correct output (return values) and calls its collaborators correctly based on the provided inputs.
-   **Collaborator Mocking**: The `ConfidenceScoringService` has one external dependency-- a `logger`. In our tests, this collaborator will be mocked. This allows us to isolate the `ConfidenceScoringService` and verify that it attempts to log messages under the specified conditions without needing a real logging mechanism.

---

## 4. Recursive Testing (Regression) Strategy

A robust and frequent regression testing strategy is crucial for maintaining stability. The tests for this service are lightweight and fast, making them ideal candidates for frequent execution.

### 4.1. Regression Triggers (When to Re-run Tests)

-   **On-Commit**: All tests defined in this plan will be run automatically via a pre-commit hook or CI check whenever a change is made to [`src/services/ConfidenceScoringService.js`](src/services/ConfidenceScoringService.js).
-   **Component Integration Change**: The full suite will be run whenever a component that *uses* the `ConfidenceScoringService` (e.g., `ValidationCoordinator`, `FileAnalysisWorker`) is modified, to ensure no breaking changes have been introduced.
-   **Continuous Integration (CI) Build**: The full suite will be included in every CI build for the project.

### 4.2. Test Prioritization and Tagging

To facilitate selective test execution, tests will be tagged as follows--

-   `@unit`: All tests in this plan.
-   `@scoring`: All tests in this plan, allowing for targeted runs of all scoring-related logic.
-   `@fast`: All tests in this plan.

### 4.3. Test Selection for Regression

-   **Developer Workflow**: Developers can run `npm test -- --tags @scoring` to get rapid feedback while working on the service.
-   **CI Workflow**: The CI server will run the full `@unit` test suite on every build.

---

## 5. Test Cases

The following test cases are derived directly from the TDD anchors in the specification document.

### 5.1. Tests for `getInitialScoreFromLlm(llmOutput, context)`

#### **CSS-001-- Should return the probability from LLM output if available**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `getInitialScoreFromLlm`
-   **Collaborators to Mock**: None for this case.
-   **Input Data**: `llmOutput = { probability: 0.85 }`, `context = {}`
-   **Expected Observable Outcome**: The function must return the number `0.85`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-002-- Should return a default score if probability is missing**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `getInitialScoreFromLlm`
-   **Collaborators to Mock**: `logger`
-   **Input Data**: `llmOutput = { someOtherField: 'value' }`, `context = { file_path: 'test.js' }`
-   **Expected Observable Outcome**:
    1.  The function must return the default value `0.5`.
    2.  The mocked `logger.warn` method must be called **exactly once**.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-003-- Should log a warning with context when probability is missing**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `getInitialScoreFromLlm`
-   **Collaborators to Mock**: `logger`
-   **Input Data**: `llmOutput = {}`, `context = { file_path: 'src/main.js', relationship: 'USES' }`
-   **Expected Observable Outcome**: The mocked `logger.warn` method must be called with an object containing the message `Uncalibrated score-- LLM output missing probability. Using default.` and the properties from the `context` object.
-   **Recursive Testing Scope**: On-Commit, CI Build.

### 5.2. Tests for `calculateFinalScore(evidenceArray)`

#### **CSS-004-- Should return a zero score and no conflict for empty evidence**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = []`
-   **Expected Observable Outcome**: Return `{ finalScore: 0, hasConflict: false }`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-005-- Should boost the score on agreement**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = [ { initialScore: 0.6, foundRelationship: true }, { initialScore: 0.7, foundRelationship: true } ]`
-   **Expected Observable Outcome**: The `finalScore` must be `0.6 + (1 - 0.6) * 0.2 = 0.68`. The return object must be `{ finalScore: 0.68, hasConflict: false }`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-006-- Should penalize the score on disagreement**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = [ { initialScore: 0.8, foundRelationship: true }, { initialScore: 0.1, foundRelationship: false } ]`
-   **Expected Observable Outcome**: The `finalScore` must be `0.8 * 0.5 = 0.4`. The return object must be `{ finalScore: 0.4, hasConflict: true }`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-007-- Should flag a conflict if workers disagree**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = [ { initialScore: 0.9, foundRelationship: true }, { initialScore: 0.2, foundRelationship: false } ]`
-   **Expected Observable Outcome**: The `hasConflict` property of the returned object must be `true`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-008-- Should NOT flag a conflict if workers agree**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = [ { initialScore: 0.9, foundRelationship: true }, { initialScore: 0.8, foundRelationship: true } ]`
-   **Expected Observable Outcome**: The `hasConflict` property of the returned object must be `false`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-009-- Should clamp the final score to a maximum of 1**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = [ { initialScore: 0.9, foundRelationship: true }, { initialScore: 0.95, foundRelationship: true }, { initialScore: 0.98, foundRelationship: true }, { initialScore: 0.99, foundRelationship: true } ]` (A scenario that would push the score over 1)
-   **Expected Observable Outcome**: The `finalScore` in the returned object must be `1`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

#### **CSS-010-- Should clamp the final score to a minimum of 0**
-   **AI Verifiable End Result Targeted**: Task 1.1
-   **Unit Under Test**: `calculateFinalScore`
-   **Collaborators to Mock**: None.
-   **Input Data**: `evidenceArray = [ { initialScore: 0.1, foundRelationship: true }, { initialScore: 0.1, foundRelationship: false }, { initialScore: 0.1, foundRelationship: false }, { initialScore: 0.1, foundRelationship: false } ]` (A scenario that would push the score below 0)
-   **Expected Observable Outcome**: The `finalScore` in the returned object must be `0`.
-   **Recursive Testing Scope**: On-Commit, CI Build.

---

## 6. Test Environment and Data

### 6.1. Test Runner

-   **Framework**: Jest
-   **Execution**: Tests will be run via Node.js.

### 6.2. Mocking

-   Jest's built-in mocking capabilities (`jest.mock` and `jest.fn`) will be used to create a mock `logger` object.

### 6.3. Test Data

-   All test data will be defined as constants within the test file itself. No external data files are required. The input arrays and objects will be simple and designed to target the specific logic path of each test case.
