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

FUNCTION claimTask(dbConnection, workerId)
    -- INPUT: dbConnection (Database Connection), workerId (String)
    -- OUTPUT: Task object or NULL
    -- TEST-- Returns a task when one is available.
    -- TEST-- Returns NULL when no tasks are pending.
    -- TEST-- Correctly updates the claimed task with worker_id and status.
    
    -- Atomic task claiming using UPDATE...WHERE to prevent race conditions
    updateResult = EXECUTE SQL: "UPDATE work_queue 
                                 SET status = 'processing', worker_id = ? 
                                 WHERE id = (SELECT id FROM work_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1) 
                                 AND status = 'pending'"
                                 WITH PARAMETERS: [workerId]
    
    IF updateResult.rowsAffected = 0 THEN
        RETURN NULL
    END IF
    
    claimedTask = EXECUTE SQL: "SELECT id, file_path, content_hash FROM work_queue WHERE worker_id = ? AND status = 'processing' ORDER BY id DESC LIMIT 1"
                               WITH PARAMETERS: [workerId]
    
    RETURN claimedTask
END FUNCTION

FUNCTION processTask(dbConnection, task)
    -- INPUT: dbConnection (Database Connection), task (Task Object)
    -- OUTPUT: None (side effects-- database updates)
    -- TEST-- Successfully processes a valid task and saves results.
    -- TEST-- Handles file reading errors gracefully.
    -- TEST-- Handles LLM call failures gracefully.
    -- TEST-- Handles JSON validation errors gracefully.
    
    TRY
        fileContent = readFileContent(task.file_path)
        analysisResult = analyzeFileContent(task.file_path, fileContent)
        saveSuccessResult(dbConnection, task.id, task.file_path, analysisResult)
        
        logInfo("Successfully processed task ID-- " + task.id)
    CATCH FileNotFoundError as e
        handleProcessingFailure(dbConnection, task.id, "File not found-- " + e.message)
    CATCH LlmCallFailedError as e
        handleProcessingFailure(dbConnection, task.id, "LLM call failed-- " + e.message)
    CATCH InvalidJsonResponseError as e
        handleProcessingFailure(dbConnection, task.id, "Invalid JSON response-- " + e.message)
    CATCH ANY other error as e
        handleProcessingFailure(dbConnection, task.id, "Unexpected error-- " + e.message)
    END TRY
END FUNCTION

FUNCTION analyzeFileContent(filePath, fileContent)
    -- INPUT: filePath (String), fileContent (String)
    -- OUTPUT: JSON Object with entities and relationships
    -- TEST-- Successfully processes file content and returns valid JSON.
    -- TEST-- For any file size, it calls the LLM and returns structured data.
    
    prompt = constructLlmPrompt(filePath, fileContent)
    llmResponseText = callLlmWithRetries(prompt, DEEPSEEK_API_KEY, LLM_RETRY_COUNT, LLM_BACKOFF_FACTOR)
    validatedJson = validateLlmResponse(llmResponseText)
    RETURN validatedJson
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
                logWarning("LLM API returned server error-- " + response.statusCode + ". Retrying...")
            ELSE
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
    -- TEST-- Given a valid JSON string, it returns the parsed object.
    -- TEST-- Given a non-JSON string, it throws InvalidJsonResponseError.
    -- TEST-- Given valid JSON missing 'entities' or 'relationships' (for chunks or full files), it throws InvalidJsonResponseError.
    
    TRY
        parsedJson = JSON.parse(responseText)
    CATCH JsonParseError
        THROW new InvalidJsonResponseError("Response is not valid JSON.")
    END TRY
    
    IF "entities" NOT IN parsedJson OR "relationships" NOT IN parsedJson THEN
        THROW new InvalidJsonResponseError("JSON is missing required 'entities' or 'relationships' keys.")
    END IF
    
    RETURN parsedJson
END FUNCTION

FUNCTION computeSha256Hash(text)
    -- INPUT-- text (String)
    -- OUTPUT-- String (SHA-256 hash)
    -- TEST-- Returns a known, correct SHA-256 hash for a given input string.
    -- TEST-- Returns different hashes for different input strings.
    
    RETURN SHA256(text)
END FUNCTION

FUNCTION saveSuccessResult(db, taskId, rawJsonString, jsonHash)
    -- INPUT-- db (DatabaseConnection), taskId (Integer), rawJsonString (String), jsonHash (String)
    -- OUTPUT-- None
    -- THROWS-- DatabaseError
    -- TDD Anchor-- Test that a new record is created in analysis_results with the correct taskId, llm_output, and llm_output_hash.
    -- TDD Anchor-- Test that the work_queue item corresponding to taskId is marked 'completed'.
    -- TDD Anchor-- Test that both the INSERT and UPDATE happen within a single, atomic transaction.
    
    BEGIN TRANSACTION
    TRY
        insertSql = "INSERT INTO analysis_results (work_item_id, llm_output, llm_output_hash, status) VALUES (?, ?, ?, 'pending_ingestion');"
        db.execute(insertSql, taskId, rawJsonString, jsonHash)
        
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