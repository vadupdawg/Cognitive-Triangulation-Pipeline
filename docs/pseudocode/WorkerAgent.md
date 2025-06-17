# Pseudocode-- WorkerAgent

## 1. Constants and Configuration

-   `SQLITE_DB_PATH`-- String -- Path to the SQLite database file.
-   `DEEPSEEK_API_KEY`-- String -- API key for DeepSeek service.
-   `WORKER_ID`-- String -- Unique identifier for this worker instance.
-   `LLM_RETRY_COUNT`-- Integer -- (Default-- 3) Max retries for LLM calls.
-   `LLM_BACKOFF_FACTOR`-- Integer -- (Default-- 2) Factor for exponential backoff on retries.
-   `POLLING_INTERVAL`-- Integer -- (Default-- 5 seconds) Time to wait when the queue is empty.
-   `FILE_SIZE_THRESHOLD_KB`-- Integer -- (Default-- 128) Files larger than this will be chunked.
-   `CHUNK_SIZE_KB`-- Integer -- (Default-- 120) The size of each chunk sent to the LLM.
-   `CHUNK_OVERLAP_LINES`-- Integer -- (Default-- 50) Number of lines to overlap between chunks to maintain context.

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
        -- TEST-- processTask correctly calls readFileContent.
        fileContent = readFileContent(task.file_path)
        
        -- TEST-- processTask correctly calls analyzeFileContent.
        llmAnalysisResult = analyzeFileContent(task.file_path, fileContent)
        
        -- The raw response text is needed for hashing to avoid complexities of canonicalization.
        rawJsonString = JSON.stringify(llmAnalysisResult)
        
        -- TEST-- processTask correctly calls computeSha256Hash on the raw JSON string.
        responseHash = computeSha256Hash(rawJsonString)

        -- TEST-- processTask calls saveSuccessResult on a fully successful workflow.
        saveSuccessResult(db, task.id, rawJsonString, responseHash)
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

FUNCTION analyzeFileContent(filePath, fileContent)
    -- INPUT-- filePath (String), fileContent (String)
    -- OUTPUT-- A single JSON object representing the complete analysis.
    -- THROWS-- LlmCallFailedError, InvalidJsonResponseError
    -- TEST-- For a file below threshold, it calls constructLlmPrompt once and returns the result.
    -- TEST-- For a file above threshold, it calls createChunks.
    -- TEST-- For a large file, it calls the LLM for each chunk and aggregates the results.
    -- TEST-- For a large file, it correctly deduplicates entities and relationships from the aggregated chunks.

    IF length(fileContent) <= FILE_SIZE_THRESHOLD_KB * 1024 THEN
        prompt = constructLlmPrompt(filePath, fileContent)
        llmResponseText = callLlmWithRetries(prompt, DEEPSEEK_API_KEY, LLM_RETRY_COUNT, LLM_BACKOFF_FACTOR)
        validatedJson = validateLlmResponse(llmResponseText)
        RETURN validatedJson
    ELSE
        chunks = createChunks(fileContent, CHUNK_SIZE_KB * 1024, CHUNK_OVERLAP_LINES)
        allEntities = []
        allRelationships = []
        
        LOOP for i from 0 to length(chunks) - 1
            chunk = chunks[i]
            prompt = constructLlmPromptForChunk(filePath, chunk, i + 1, length(chunks))
            chunkResponseText = callLlmWithRetries(prompt, DEEPSEEK_API_KEY, LLM_RETRY_COUNT, LLM_BACKOFF_FACTOR)
            chunkJson = validateLlmResponse(chunkResponseText)
            
            APPEND all elements of chunkJson.entities TO allEntities
            APPEND all elements of chunkJson.relationships TO allRelationships
        END LOOP
        
        -- Deduplication is crucial to merge overlapping analyses correctly.
        -- The exact mechanism for deduplication (e.g., based on 'qualifiedName') needs to be defined.
        uniqueEntities = deduplicate(allEntities, key="qualifiedName")
        uniqueRelationships = deduplicate(allRelationships, key="source_qName,target_qName,type")

        RETURN {
            "filePath": filePath,
            "entities": uniqueEntities,
            "relationships": uniqueRelationships,
            "is_chunked": true
        }
    END IF
END FUNCTION


## 4. Helper Functions

FUNCTION createChunks(content, chunkSize, overlapLines)
    -- INPUT-- content (String), chunkSize (Integer), overlapLines (Integer)
    -- OUTPUT-- Array of Strings (chunks)
    -- TEST-- Returns a single chunk if content is smaller than chunkSize.
    -- TEST-- Returns multiple chunks for larger content.
    -- TEST-- Correctly overlaps consecutive chunks by overlapLines.
    -- TEST-- The combination of all chunks (without overlap) reconstructs the original content.
    
    lines = split(content, "\n")
    chunks = []
    currentPosition = 0
    
    WHILE currentPosition < length(lines)
        endPosition = findPositionForChunkSize(lines, currentPosition, chunkSize)
        chunkLines = lines from currentPosition to endPosition
        ADD join(chunkLines, "\n") to chunks
        
        overlapStart = max(0, endPosition - overlapLines)
        currentPosition = overlapStart
    END WHILE
    
    RETURN chunks
END FUNCTION

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

FUNCTION constructLlmPromptForChunk(filePath, chunkContent, chunkNum, totalChunks)
    -- INPUT-- filePath (String), chunkContent (String), chunkNum (Integer), totalChunks (Integer)
    -- OUTPUT-- Prompt (Object)
    -- TEST-- The system prompt correctly instructs the LLM that it is seeing a partial file.
    -- TEST-- The user prompt includes the file path, chunk number, and total chunks.

    systemPrompt = "You are an expert code analysis tool. You are analyzing a chunk of a larger file. Focus only on the code provided in this chunk. Output a single, valid JSON object with 'entities' and 'relationships' found *within this chunk*. Do not include a 'filePath' key. All code entities must have a 'qualifiedName'. Be aware that some relationships may span across chunks; only declare relationships where you can identify both source and target within this chunk."

    userPrompt = "Analyze chunk " + chunkNum + " of " + totalChunks + " for the file '" + filePath + "'.\n\n---\n\n" + chunkContent

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