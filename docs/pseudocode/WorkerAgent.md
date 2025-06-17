# Pseudocode-- WorkerAgent

## 1. Constants and Configuration

-   `SQLITE_DB_PATH`-- String -- Path to the SQLite database file.
-   `DEEPSEEK_API_KEY`-- String -- API key for DeepSeek service.
-   `WORKER_ID`-- String -- Unique identifier for this worker instance.
-   `LLM_RETRY_COUNT`-- Integer -- (Default-- 3) Max retries for LLM calls.
-   `LLM_BACKOFF_FACTOR`-- Integer -- (Default-- 2) Factor for exponential backoff on retries.
-   `POLLING_INTERVAL`-- Integer -- (Default-- 5 seconds) Time to wait when the queue is empty.

## 2. Main Entry Point

FUNCTION main()
    -- TEST-- main loop starts and continues running.
    -- TEST-- main function correctly initializes and uses the database connection.
    
    dbConnection = connectToDatabase(SQLITE_DB_PATH)
    IF dbConnection is NOT valid THEN
        logError("Fatal-- Could not connect to database.")
        EXIT
    END IF

    LOOP forever
        task = claimTask(dbConnection, WORKER_ID)

        IF task IS NOT NULL THEN
            -- TEST-- A valid task is passed to processTask.
            logInfo("Claimed task ID-- " + task.id + " for file-- " + task.file_path)
            processTask(dbConnection, task)
        ELSE
            -- TEST-- When no task is claimed, the worker sleeps for POLLING_INTERVAL.
            logInfo("No pending tasks found. Sleeping.")
            sleep(POLLING_INTERVAL)
        END IF
    END LOOP
END FUNCTION

## 3. Core Functions

FUNCTION claimTask(db, workerId)
    -- INPUT-- db (DatabaseConnection), workerId (String)
    -- OUTPUT-- WorkItem (Object) or NULL
    -- TDD Anchor-- Test that this query correctly claims one 'pending' task and updates its status and worker_id.
    -- TDD Anchor-- Test that if two workers call this simultaneously, only one succeeds in claiming a specific task.
    -- TDD Anchor-- Test that it returns NULL when no 'pending' tasks exist in the work_queue.
    
    sql = "UPDATE work_queue SET status = 'processing', worker_id = ? WHERE id = (SELECT id FROM work_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1) RETURNING id, file_path, content_hash;"
    
    BEGIN TRANSACTION
    claimedTask = db.querySingle(sql, workerId)
    COMMIT TRANSACTION
    
    RETURN claimedTask
END FUNCTION

FUNCTION processTask(db, task)
    -- INPUT-- db (DatabaseConnection), task (WorkItem)
    -- OUTPUT-- None
    
    TRY
        -- TEST-- processTask correctly calls readFileContent with the task's file path.
        fileContent = readFileContent(task.file_path)
        
        -- TEST-- processTask correctly calls constructLlmPrompt.
        prompt = constructLlmPrompt(task.file_path, fileContent)
        
        -- TEST-- processTask correctly calls the LLM with retries.
        llmResponseText = callLlmWithRetries(prompt, DEEPSEEK_API_KEY, LLM_RETRY_COUNT, LLM_BACKOFF_FACTOR)
        
        -- TEST-- processTask correctly calls validateLlmResponse.
        validatedJson = validateLlmResponse(llmResponseText)
        
        -- TEST-- processTask correctly calls canonicalizeJson.
        canonicalJsonString = canonicalizeJson(validatedJson)

        -- TEST-- processTask calls saveSuccessResult on a fully successful workflow.
        saveSuccessResult(db, task.id, canonicalJsonString)
        logInfo("Successfully processed and stored result for task ID-- " + task.id)

    CATCH FileNotFoundError as e
        -- TEST-- A FileNotFoundError correctly triggers handleProcessingFailure.
        logError("File not found for task ID-- " + task.id + ". Error-- " + e.message)
        handleProcessingFailure(db, task.id, "File not found at path-- " + task.file_path)

    CATCH LlmCallFailedError as e
        -- TEST-- A final LlmCallFailedError correctly triggers handleProcessingFailure.
        logError("LLM call failed permanently for task ID-- " + task.id + ". Error-- " + e.message)
        handleProcessingFailure(db, task.id, "LLM call failed after all retries.")

    CATCH InvalidJsonResponseError as e
        -- TEST-- A persistent InvalidJsonResponseError correctly triggers handleProcessingFailure.
        logError("Invalid JSON from LLM after all retries for task ID-- " + task.id + ". Error-- " + e.message)
        handleProcessingFailure(db, task.id, "LLM returned invalid JSON.")
        
    CATCH DatabaseError as e
        -- TEST-- A DatabaseError logs a fatal error and causes the worker to exit.
        logError("Fatal database error during task processing. Shutting down. Error-- " + e.message)
        EXIT -- Or trigger a restart policy
        
    END TRY
END FUNCTION


## 4. Helper Functions

FUNCTION readFileContent(filePath)
    -- INPUT-- filePath (String)
    -- OUTPUT-- String (file content)
    -- THROWS-- FileNotFoundError
    -- TEST-- Given a valid path, it returns the correct file content.
    -- TEST-- Given an invalid or non-existent path, it throws FileNotFoundError.
    
    IF fileExists(filePath) THEN
        RETURN readTextFromFile(filePath)
    ELSE
        THROW new FileNotFoundError("File not found-- " + filePath)
    END IF
END FUNCTION

FUNCTION constructLlmPrompt(filePath, fileContent)
    -- INPUT-- filePath (String), fileContent (String)
    -- OUTPUT-- Prompt (Object with system and user parts)
    -- TEST-- The system prompt contains the required JSON schema instructions.
    -- TEST-- The user prompt correctly includes the file path and the full file content.
    
    systemPrompt = "You are an expert code analysis tool. Your task is to analyze the provided source code and output a single, valid JSON object. Do not include any other text, explanations, or markdown formatting. The JSON schema must have root keys 'filePath', 'entities', and 'relationships'. All code entities must have a 'qualifiedName'."
    
    userPrompt = "Analyze the following code from the file '" + filePath + "'.\n\n---\n\n" + fileContent
    
    RETURN { system-- systemPrompt, user-- userPrompt }
END FUNCTION

FUNCTION callLlmWithRetries(prompt, apiKey, retryCount, backoffFactor)
    -- INPUT-- prompt (Object), apiKey (String), retryCount (Integer), backoffFactor (Integer)
    -- OUTPUT-- String (LLM response text)
    -- THROWS-- LlmCallFailedError
    -- TEST-- On a successful API call, it returns the response text.
    -- TEST-- For a transient API error (e.g., 503), it retries up to retryCount times with exponential backoff.
    -- TEST-- After all retries fail, it throws LlmCallFailedError.
    
    currentAttempt = 1
    delay = 1 -- initial delay in seconds
    
    LOOP while currentAttempt <= retryCount
        TRY
            response = httpPost("https://api.deepseek.com/...", prompt, { Authorization-- "Bearer " + apiKey })
            IF response.statusCode >= 200 AND response.statusCode < 300 THEN
                RETURN response.body
            ELSE IF response.statusCode >= 500 THEN
                -- Server-side error, retry
                logWarning("LLM API returned server error-- " + response.statusCode + ". Retrying...")
            ELSE
                -- Client-side error, don't retry
                THROW new LlmCallFailedError("LLM API returned client error-- " + response.statusCode)
            END IF
        CATCH NetworkError as e
            logWarning("LLM API call failed with network error. Retrying...")
        END TRY
        
        sleep(delay)
        delay = delay * backoffFactor
        currentAttempt = currentAttempt + 1
    END LOOP
    
    THROW new LlmCallFailedError("LLM call failed after " + retryCount + " attempts.")
END FUNCTION

FUNCTION validateLlmResponse(responseText)
    -- INPUT-- responseText (String)
    -- OUTPUT-- Parsed JSON (Object)
    -- THROWS-- InvalidJsonResponseError
    -- TEST-- Given a valid JSON string matching the schema, it returns the parsed object.
    -- TEST-- Given a non-JSON string, it throws InvalidJsonResponseError.
    -- TEST-- Given valid JSON missing a required root key ('filePath', 'entities', 'relationships'), it throws InvalidJsonResponseError.
    
    TRY
        parsedJson = JSON.parse(responseText)
    CATCH JsonParseError
        THROW new InvalidJsonResponseError("Response is not valid JSON.")
    END TRY
    
    IF "filePath" NOT IN parsedJson OR "entities" NOT IN parsedJson OR "relationships" NOT IN parsedJson THEN
        THROW new InvalidJsonResponseError("JSON is missing required root keys.")
    END IF
    
    RETURN parsedJson
END FUNCTION

FUNCTION canonicalizeJson(jsonObject)
    -- INPUT-- jsonObject (Object)
    -- OUTPUT-- String (canonicalized JSON string)
    -- TEST-- It correctly sorts keys in a simple object.
    -- TEST-- It correctly sorts elements in an array of objects.
    -- TEST-- It handles nested objects and arrays recursively, sorting all keys.
    -- TEST-- Two functionally identical but differently ordered objects produce the exact same output string.

    -- This is a conceptual function. The implementation would involve recursively
    -- traversing the JSON structure, sorting object keys alphabetically at each level,
    -- and then serializing it to a string without extra whitespace.
    
    RETURN recursivelySortKeysAndStringify(jsonObject)
END FUNCTION


FUNCTION saveSuccessResult(db, taskId, canonicalJsonString)
    -- INPUT-- db (DatabaseConnection), taskId (Integer), canonicalJsonString (String)
    -- OUTPUT-- None
    -- THROWS-- DatabaseError
    -- TDD Anchor-- Test that a new record is created in analysis_results with the correct taskId and llm_output.
    -- TDD Anchor-- Test that the work_queue item corresponding to taskId is marked 'completed'.
    -- TDD Anchor-- Test that both the INSERT and UPDATE happen within a single, atomic transaction.
    -- TDD Anchor-- Test that if the INSERT fails, the UPDATE is rolled back.
    
    BEGIN TRANSACTION
    TRY
        insertSql = "INSERT INTO analysis_results (work_item_id, llm_output, status) VALUES (?, ?, 'pending_ingestion');"
        db.execute(insertSql, taskId, canonicalJsonString)
        
        updateSql = "UPDATE work_queue SET status = 'completed' WHERE id = ?;"
        db.execute(updateSql, taskId)
        
        COMMIT TRANSACTION
    CATCH e
        ROLLBACK TRANSACTION
        THROW new DatabaseError("Failed to save success result-- " + e.message)
    END TRY
END FUNCTION

FUNCTION handleProcessingFailure(db, taskId, errorMessage)
    -- INPUT-- db (DatabaseConnection), taskId (Integer), errorMessage (String)
    -- OUTPUT-- None
    -- THROWS-- DatabaseError
    -- TDD Anchor-- Test that a new record is created in the failed_work table with the correct work_item_id and error message.
    -- TDD Anchor-- Test that the corresponding work_queue item is marked as 'failed'.
    -- TDD Anchor-- Test that both writes occur in a single transaction.
    
    BEGIN TRANSACTION
    TRY
        insertSql = "INSERT INTO failed_work (work_item_id, error_message) VALUES (?, ?);"
        db.execute(insertSql, taskId, errorMessage)
        
        updateSql = "UPDATE work_queue SET status = 'failed' WHERE id = ?;"
        db.execute(updateSql, taskId)
        
        COMMIT TRANSACTION
    CATCH e
        ROLLBACK TRANSACTION
        THROW new DatabaseError("Failed to handle processing failure-- " + e.message)
    END TRY
END FUNCTION