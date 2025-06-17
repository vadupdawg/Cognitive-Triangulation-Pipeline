# Granular Test Plan-- WorkerAgent

## 1. Introduction

This document provides a detailed test plan for the `WorkerAgent` feature. The `WorkerAgent` is a core component responsible for processing file analysis tasks by interacting with a central database, the file system, and an external LLM API.

This plan adheres to the London School of TDD, focusing on testing the interactions and observable behavior of the `WorkerAgent` with its collaborators, rather than its internal state. It also defines a comprehensive recursive testing strategy to ensure long-term stability and prevent regressions. Every test case is designed to verify a specific, AI-verifiable outcome outlined in the [`ProjectMasterPlan.md`](../ProjectMasterPlan.md).

## 2. Test Scope & AI-Verifiable End Results

The primary goal of these tests is to verify the following AI-Verifiable End Results for the `WorkerAgent` as defined in the project's primary planning documents:

*   **Successful Task Completion:** A `work_queue` task with `status = 'pending'` is correctly processed, leading to an updated status of `'completed'`.
*   **Result Persistence:** A successful analysis results in the creation of a new, corresponding record in the `analysis_results` table containing the validated, structured JSON output from the LLM.
*   **Failure Handling (Dead-Letter Queue):** A task that persistently fails analysis (e.g., due to invalid LLM responses or file system errors) is moved to the `failed_work` table, and its status in the `work_queue` is updated to `'failed'`.
*   **Data Integrity:** The `llm_output` stored in the `analysis_results` table is a valid, well-structured JSON string that conforms to the project's data contract.
*   **System Resilience:** The agent demonstrates resilience by handling transient errors (e.g., LLM API errors, network issues) through a retry-with-backoff mechanism.
*   **Large File Handling:** The agent can correctly process files that exceed the size threshold by chunking the content, analyzing each chunk, and aggregating the results.

## 3. Test Strategy

### 3.1. London School of TDD (Interaction-Based Testing)

Our testing approach will treat the `WorkerAgent` as a black box. We will not inspect its internal variables or state. Instead, we will verify its behavior by observing the messages it sends to its collaborators. This is achieved by providing mock implementations for all collaborators and asserting that the `WorkerAgent` calls the correct methods on these mocks with the expected arguments.

-   **Unit Under Test (UUT):** The `WorkerAgent` module/class.
-   **Collaborators:** All external dependencies will be mocked. This includes:
    -   **Database Connector:** To simulate interactions with the SQLite database (`work_queue`, `analysis_results`, `failed_work` tables).
    -   **File System Reader:** To simulate reading file content.
    -   **LLM API Client:** To simulate responses from the DeepSeek LLM API.

### 3.2. Recursive Testing (Regression Strategy)

A multi-layered regression strategy will be employed to ensure continuous stability as the codebase evolves. Tests will be tagged to allow for selective execution.

-   **Test Tags:** `unit`, `happy-path`, `error-handling`, `resilience`, `chunking`

-   **Execution Triggers & Scopes:**
    -   **On-Commit (Pre-push hook):** Run all `unit` and `happy-path` tests. This provides a fast feedback loop for developers.
        -   *AI Verifiable Criterion:* The pre-commit hook script executes the test runner with the specified tags and passes.
    -   **On Pull Request (CI Pipeline):** Run the entire test suite (`unit`, `happy-path`, `error-handling`, `resilience`, `chunking`). This ensures that no regressions are introduced into the main branch.
        -   *AI Verifiable Criterion:* The CI pipeline configuration file shows the test command being executed without tag restrictions, and the build succeeds.
    -   **Before Release (Staging Deployment):** Run the entire test suite against a staging environment that may include semi-integrated components. This is a final quality gate.
        -   *AI Verifiable Criterion:* Release management documentation confirms the execution of the full test suite as a release checklist item.

## 4. Test Environment and Mocking

-   **Test Runner:** A standard testing framework like Jest or Mocha.
-   **Mocking Library:** A library like `sinon` or Jest's built-in mocking capabilities.

### Mock Collaborator Details:

-   **Mock Database Connector:**
    -   Will expose methods like `querySingle` and `execute`.
    -   Will be configured to return specific data for `SELECT` queries (e.g., a pending task) or to track `INSERT`/`UPDATE` calls for verification.
    -   Can be configured to simulate transaction rollbacks or connection errors.
-   **Mock File System Reader:**
    -   Will expose a `readFileContent` method.
    -   Can be configured to return specific file content (string) or throw a `FileNotFoundError`.
-   **Mock LLM API Client:**
    -   Will expose a `callLlmWithRetries` method.
    -   Can be configured to return various responses:
        -   A valid JSON string.
        -   A malformed JSON string.
        -   An HTTP 5xx server error to test retries.
        -   A complete failure to test the dead-letter queue mechanism.

## 5. Test Cases

### 5.1. Task Claiming (`claimTask`)

-   **AI Verifiable Result Targeted:** Successful Task Completion.
-   **UUT:** `WorkerAgent.claimTask` function.
-   **Test Case 1.1: Claim a pending task successfully**
    -   **Interaction:** The `claimTask` function calls the `db.querySingle` method.
    -   **Mock Config:** The mock `db.querySingle` is configured to return a single task object (e.g., `{ id: 1, file_path: 'src/test.js' }`).
    -   **Expected Outcome:** The `db.querySingle` method is called once with the correct atomic `UPDATE ... RETURNING` SQL statement. The function returns the task object.
    -   **Tag:** `unit`, `happy-path`
-   **Test Case 1.2: No pending tasks available**
    -   **Interaction:** The `claimTask` function calls the `db.querySingle` method.
    -   **Mock Config:** The mock `db.querySingle` is configured to return `NULL`.
    -   **Expected Outcome:** The `db.querySingle` method is called once. The function returns `NULL`.
    -   **Tag:** `unit`

### 5.2. Successful Task Processing (`processTask`)

-   **AI Verifiable Result Targeted:** Successful Task Completion, Result Persistence, Data Integrity.
-   **UUT:** `WorkerAgent.processTask` function.
-   **Test Case 2.1: Full successful workflow for a small file**
    -   **Interaction:** `processTask` orchestrates calls to `readFileContent`, `callLlmWithRetries`, `validateLlmResponse`, and `saveSuccessResult`.
    -   **Mock Config:**
        -   `readFileContent`: Returns "some code content".
        -   `callLlmWithRetries`: Returns a valid, stringified JSON object matching the data contract.
        -   `saveSuccessResult`: Mocked to verify it's called correctly.
    -   **Expected Outcome:**
        1.  `readFileContent` is called with the correct `file_path`.
        2.  `callLlmWithRetries` is called with a correctly constructed prompt.
        3.  `saveSuccessResult` is called with the correct `taskId`, the raw JSON string from the LLM, and its computed hash.
    -   **Tag:** `unit`, `happy-path`

### 5.3. Result & Failure Persistence

-   **AI Verifiable Result Targeted:** Result Persistence, Failure Handling.
-   **UUT:** `saveSuccessResult` and `handleProcessingFailure` functions.
-   **Test Case 3.1: Save a successful result**
    -   **Interaction:** The `saveSuccessResult` function executes two database queries within a transaction.
    -   **Mock Config:** The mock `db.execute` is configured to succeed.
    -   **Expected Outcome:**
        1.  `db.execute` is called with an `INSERT` statement for the `analysis_results` table, containing the correct `taskId` and `llm_output`.
        2.  `db.execute` is called with an `UPDATE` statement for the `work_queue` table, setting `status = 'completed'` for the correct `taskId`.
        3.  The calls are wrapped in `BEGIN TRANSACTION` and `COMMIT TRANSACTION` calls.
    -   **Tag:** `unit`, `happy-path`
-   **Test Case 3.2: Handle a persistent processing failure**
    -   **Interaction:** The `handleProcessingFailure` function moves a task to the dead-letter queue.
    -   **Mock Config:** The mock `db.execute` is configured to succeed.
    -   **Expected Outcome:**
        1.  `db.execute` is called with an `INSERT` statement for the `failed_work` table with the correct `taskId` and `errorMessage`.
        2.  `db.execute` is called with an `UPDATE` statement for the `work_queue` table, setting `status = 'failed'` for the correct `taskId`.
        3.  The calls are wrapped in `BEGIN TRANSACTION` and `COMMIT TRANSACTION` calls.
    -   **Tag:** `unit`, `error-handling`

### 5.4. Error Handling and Resilience

-   **AI Verifiable Result Targeted:** System Resilience, Failure Handling.
-   **UUT:** `processTask`, `callLlmWithRetries`.
-   **Test Case 4.1: File not found**
    -   **Interaction:** `processTask` calls `readFileContent`, which throws an error.
    -   **Mock Config:** `readFileContent` is configured to throw `FileNotFoundError`.
    -   **Expected Outcome:** The `handleProcessingFailure` function is called with the correct `taskId` and an appropriate error message. The `callLlmWithRetries` function is NOT called.
    -   **Tag:** `unit`, `error-handling`
-   **Test Case 4.2: LLM call fails with transient errors**
    -   **Interaction:** `callLlmWithRetries` receives server errors from the API.
    -   **Mock Config:** The mock LLM client is configured to fail twice with a 503 error, then succeed on the third attempt.
    -   **Expected Outcome:** The LLM client is called exactly three times. The `processTask` completes successfully.
    -   **Tag:** `unit`, `resilience`
-   **Test Case 4.3: LLM call fails permanently**
    -   **Interaction:** `callLlmWithRetries` fails after all retry attempts.
    -   **Mock Config:** The mock LLM client is configured to fail on all attempts.
    -   **Expected Outcome:** `callLlmWithRetries` throws `LlmCallFailedError`. `processTask` catches this and calls `handleProcessingFailure`.
    -   **Tag:** `unit`, `error-handling`, `resilience`
-   **Test Case 4.4: LLM returns invalid JSON permanently**
    -   **Interaction:** The LLM consistently returns non-JSON text.
    -   **Mock Config:** The mock LLM client returns "This is not JSON" on all attempts.
    -   **Expected Outcome:** `validateLlmResponse` throws `InvalidJsonResponseError` on each attempt. `processTask` catches the final error and calls `handleProcessingFailure`.
    -   **Tag:** `unit`, `error-handling`, `resilience`

### 5.5. Large File Chunking

-   **AI Verifiable Result Targeted:** Large File Handling.
-   **UUT:** `analyzeFileContent`, `createChunks`.
-   **Test Case 5.1: File below size threshold**
    -   **Interaction:** `analyzeFileContent` processes a file smaller than `FILE_SIZE_THRESHOLD_KB`.
    -   **Mock Config:** `readFileContent` returns a small string.
    -   **Expected Outcome:** `createChunks` is NOT called. The mock LLM client is called exactly once with a prompt for the full file.
    -   **Tag:** `unit`, `chunking`
-   **Test Case 5.2: File above size threshold**
    -   **Interaction:** `analyzeFileContent` processes a file larger than `FILE_SIZE_THRESHOLD_KB`.
    -   **Mock Config:** `readFileContent` returns a large string.
    -   **Expected Outcome:**
        1.  `createChunks` is called with the file content.
        2.  The mock LLM client is called multiple times (once for each chunk).
        3.  The prompts for each chunk are correctly formatted (e.g., "Analyze chunk 1 of 3...").
        4.  The final result is an aggregation of the `entities` and `relationships` from all chunk responses, with duplicates removed.
    -   **Tag:** `unit`, `chunking`

## 6. AI-Verifiable Completion Criterion

The successful creation and saving of this test plan document at [`docs/test-plans/WorkerAgent_test_plan.md`](docs/test-plans/WorkerAgent_test_plan.md) constitutes the AI-verifiable completion of this task. This document provides a clear and comprehensive roadmap for the subsequent test implementation phase.