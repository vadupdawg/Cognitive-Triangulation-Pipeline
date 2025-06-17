# Specification-- WorkerAgent

## 1. Overview

The `WorkerAgent` is the core analysis engine of the pipeline. It operates as a stateless, concurrent worker that pulls individual file analysis tasks from the central SQLite `work_queue`. For each task, it reads the corresponding file, orchestrates the analysis with the DeepSeek LLM, and stores the structured, validated JSON result back into the `analysis_results` table. This agent is designed to be scaled horizontally to increase processing throughput.

## 2. Core Logic

The agent's logic is a continuous loop of claiming a task, processing it, and storing the result.

1.  **Atomically Claim Task**-- The worker executes a single, atomic `UPDATE ... RETURNING` query on the `work_queue` table to claim an available job (`status = 'pending'`). This query immediately sets the status to `'processing'` and assigns the `worker_id`, preventing any other worker from picking up the same task. If the query returns no rows, the queue is empty, and the worker sleeps for a short, configurable interval before retrying.

2.  **Read Source File**-- Once a task is claimed, the worker reads the full content of the source code file specified by the `file_path` from the task.

3.  **Construct DeepSeek LLM Prompt**-- A precise, multi-part prompt is constructed to guide the LLM. The `WorkerAgent` is responsible for resolving the paths of any imported modules and providing this information as context to the LLM.
    *   **System Prompt**-- A detailed set of instructions defining the role of the LLM ("expert code analysis tool"), the exact JSON schema required, the `qualifiedName` format, and a strict rule to only output a single, valid JSON object.
    *   **User Prompt**-- A clear instruction to analyze the provided code, referencing the `file_path` and including the full `file_content`.

4.  **Execute LLM Call**-- The agent sends the complete prompt to the DeepSeek API. This call is wrapped in a robust error-handling mechanism that includes--
    *   **Retries**-- A configurable number of retries for transient network errors or API-side issues (e.g., HTTP 5xx errors).
    *   **Exponential Backoff**-- The time between retries increases exponentially to avoid overwhelming the API.

5.  **Validate LLM Response**--
    *   **JSON Validation**-- Upon receiving a response from the LLM, the agent first attempts to parse the text as JSON. If parsing fails, it is considered a failed attempt, and the agent will retry the LLM call if retries are remaining.
    *   **Schema Validation (Light)**-- The agent performs a basic check to ensure the parsed JSON contains the root keys (`filePath`, `entities`, `relationships`). A more strict validation against the full schema is an optional enhancement.

6.  **Canonicalize and Store Result**--
    *   **JSON Canonicalization**-- To ensure deterministic storage, the validated JSON object is canonicalized. This involves recursively sorting all keys in objects and all elements in arrays. This guarantees that two functionally identical JSON objects will have the exact same string representation.
    *   **Database Insertion**-- On successful validation, the agent opens a transaction to the SQLite database and performs two writes--
        1.  It `INSERT`s a new record into the `analysis_results` table, storing the complete, canonicalized, stringified JSON in the `llm_output` column and setting `status = 'pending_ingestion'`.
        2.  It `UPDATE`s the original task's status in the `work_queue` table to `'completed'`.

7.  **Handle Persistent Failures**-- If the LLM call fails after all retries (due to invalid JSON, repeated API errors, etc.), the agent moves the task to a `failed_work` table (a "dead-letter queue"). This prevents a single problematic file from blocking the pipeline. The original task in `work_queue` is marked as `'failed'`.

## 3. Inputs

*   **Database Records (SQLite)**-- A single task record claimed from the `work_queue` table.
*   **File System**-- The source code file located at the `file_path` specified in the task record.
*   **Environment Variables**-- The `DEEPSEEK_API_KEY` for authenticating with the LLM service.

## 4. Outputs

*   **Database Records (SQLite)**--
    *   A new row in the `analysis_results` table containing the structured JSON output.
    *   An updated status (`'completed'` or `'failed'`) for the processed task in the `work_queue` table.
    *   Potentially a new row in the `failed_work` table if processing fails permanently.
*   **Log Messages**-- Logs indicating which file is being processed, the success or failure of the LLM call, and any errors encountered.

## 5. Data Structures

*   **`WorkItem`**-- An in-memory object representing the task claimed from the database, e.g., `{ id, file_path, content_hash }`.
*   **`LLMResponse`**-- An in-memory object representing the parsed JSON structure from the LLM, matching the contract defined in the project plan.

## 6. Error Handling & Resilience

*   **Task Claiming**-- The atomic `UPDATE ... RETURNING` query is inherently resilient to race conditions.
*   **File Not Found**-- If the source file is missing (e.g., deleted after the Scout run), the task is immediately marked as `'failed'`.
*   **LLM API Errors (5xx, Timeouts)**-- Handled by the retry-with-exponential-backoff mechanism.
*   **Malformed LLM Response (Invalid JSON)**-- Handled by the retry mechanism. If it persists, the task is moved to the dead-letter queue as described below.
*   **Persistent Task Failure**-- If a task fails after all retries (e.g., 3 attempts), the `WorkerAgent` will create a new record in the `failed_work` table, capturing the `work_item_id` and the final error message. It then updates the status of the item in the `work_queue` to `'failed'` to prevent it from being picked up again.
*   **Database Errors**-- Connection/write errors will trigger a retry loop with backoff. If it fails consistently, the agent will log a fatal error and exit.

## 7. Configuration

*   **`SQLITE_DB_PATH`**-- (Required) The file path to the central SQLite database.
*   **`DEEPSEEK_API_KEY`**-- (Required) The API key for the DeepSeek LLM service.
*   **`WORKER_ID`**-- (Required) A unique identifier for the worker instance, used for logging and tracking.
*   **`LLM_RETRY_COUNT`**-- (Optional, Default-- 3) Number of times to retry a failed LLM call.
*   **`LLM_BACKOFF_FACTOR`**-- (Optional, Default-- 2) The factor by which to increase the backoff delay between retries.

## 8. Initial Pseudocode Stubs / TDD Anchors

```pseudocode
FUNCTION main(workerId)
    db = connectToDatabase(SQLITE_DB_PATH)

    LOOP forever
        // Atomically claim a task from the queue
        task = claimTask(db, workerId)

        IF task IS NOT NULL THEN
            processTask(db, task)
        ELSE
            -- No tasks available, wait before checking again
            sleep(POLLING_INTERVAL)
        END IF
    END LOOP
END FUNCTION

FUNCTION claimTask(db, workerId)
    -- TDD Anchor-- Test that this query correctly claims one 'pending' task.
    -- TDD Anchor-- Test that two workers calling this simultaneously only one succeeds.
    -- TDD Anchor-- Test that it returns NULL when no 'pending' tasks exist.
    sql = "UPDATE work_queue SET status = 'processing', worker_id = ? WHERE id = (SELECT id FROM work_queue WHERE status = 'pending' LIMIT 1) RETURNING id, file_path;"
    RETURN db.query(sql, workerId)
END FUNCTION

FUNCTION processTask(db, task)
    TRY
        fileContent = readFile(task.file_path)
        prompt = constructPrompt(task.file_path, fileContent)
        
        -- Use a library that handles retries and backoff
        llmResponse = callLlmWithRetries(prompt, DEEPSEEK_API_KEY)

        validatedJson = validateLlmResponse(llmResponse)

        -- Store results in a single transaction
        saveSuccessResult(db, task.id, validatedJson)

    CATCH FileNotFoundError
        markTaskAsFailed(db, task.id, "File not found")
    CATCH LlmCallFailed or InvalidJsonResponse
        -- Move to dead-letter queue after all retries fail
        moveToDeadLetterQueue(db, task.id, "LLM processing failed")
    END TRY
END FUNCTION

FUNCTION saveSuccessResult(db, taskId, jsonResult)
    -- TDD Anchor-- Test that a new record is created in analysis_results.
    -- TDD Anchor-- Test that the work_queue item is marked 'completed'.
    -- TDD Anchor-- Test that both writes happen in a single transaction.
END FUNCTION