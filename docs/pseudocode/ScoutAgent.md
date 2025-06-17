# Pseudocode-- ScoutAgent

## 1. Constants and Configuration

-   `SCOUT_STATE_FILE`: String -- Path to the JSON file for storing file state.
-   `SQLITE_DB_PATH`: String -- Path to the central SQLite database.
-   `EXCLUSION_PATTERNS`: List of Strings -- Patterns for files/directories to ignore (e.g., `node_modules`, `*.pyc`, `.git`).

## 2. Main Execution Block

```pseudocode
FUNCTION main(repositoryPath)
    -- TEST happy path-- Ensure the agent completes a full run without errors.
    
    -- Load the state from the last successful run.
    -- TEST error handling-- Run with a non-existent or corrupt state file.
    previousState = loadPreviousState(SCOUT_STATE_FILE)

    -- Scan the repository to get a snapshot of the current file state.
    -- TEST repository scanning-- Ensure it correctly finds files and ignores excluded ones.
    currentState = scanRepository(repositoryPath, EXCLUSION_PATTERNS)

    -- Compare the new state with the old state to identify all changes.
    changes = analyzeChanges(currentState, previousState)

    -- Log the summary of detected changes.
    LOG "Discovered " + changes.newAndModifiedFiles.length + " new/modified files."
    LOG "Discovered " + changes.deletedFiles.length + " deleted files."
    LOG "Discovered " + changes.renamedFiles.length + " renamed files."

    -- Connect to the database with retry logic.
    -- TEST database connection-- Test connection failure and retry mechanism.
    dbConnection = connectToDatabaseWithRetry(SQLITE_DB_PATH, maxRetries=3, backoffFactor=2)
    
    IF dbConnection IS NOT successful THEN
        LOG_ERROR "Failed to connect to the database after multiple retries. Aborting."
        EXIT with failure code
    END IF

    -- Populate the database queues with the detected changes.
    -- TEST queue population-- Verify correct tasks are created for each change type.
    success = populateQueues(dbConnection, changes)

    -- If the queues were populated successfully, save the new state for the next run.
    IF success THEN
        saveCurrentState(SCOUT_STATE_FILE, currentState)
        LOG "Scout run completed successfully. New state saved."
    ELSE
        LOG_ERROR "Failed to populate queues. State will not be updated to ensure data consistency."
        EXIT with failure code
    END IF

    CLOSE dbConnection
END FUNCTION
```

## 3. Core Functions

### 3.1. `loadPreviousState`

```pseudocode
FUNCTION loadPreviousState(stateFilePath)
    -- INPUT-- stateFilePath (String)
    -- OUTPUT-- A map of { filePath -> contentHash } or an empty map.

    -- TEST file not found-- The function should return an empty map and log a warning.
    -- TEST invalid JSON-- The function should return an empty map and log a warning.
    
    TRY
        IF file at stateFilePath does not exist THEN
            LOG_WARNING "State file not found. Assuming first run."
            RETURN new Map()
        END IF

        fileContent = READ_FILE(stateFilePath)
        previousState = PARSE_JSON(fileContent)
        RETURN previousState
    CATCH JSONParseException
        LOG_WARNING "Could not parse state file. Starting fresh."
        RETURN new Map()
    CATCH FileReadException
        LOG_ERROR "Could not read state file."
        RETURN new Map()
    END TRY
END FUNCTION
```

### 3.2. `scanRepository`

```pseudocode
FUNCTION scanRepository(repositoryPath, exclusionPatterns)
    -- INPUT-- repositoryPath (String), exclusionPatterns (List of Strings)
    -- OUTPUT-- A map of { filePath -> contentHash } for all non-excluded files.

    -- TEST exclusion-- Ensure files matching exclusion patterns are ignored.
    -- TEST inclusion-- Ensure files not matching exclusion patterns are included.
    -- TEST file read error-- A single unreadable file should be skipped, not halt the scan.

    currentState = new Map()
    filePaths = RECURSIVELY_LIST_FILES(repositoryPath)

    FOR EACH filePath IN filePaths
        IF pathMatchesAny(filePath, exclusionPatterns) THEN
            CONTINUE -- Skip this file
        END IF

        TRY
            hash = calculateFileHash(filePath, "SHA-256")
            currentState.set(filePath, hash)
        CATCH FileAccessException
            LOG_ERROR "Permission denied or file not found while hashing-- " + filePath
            CONTINUE
        END TRY
    END FOR

    RETURN currentState
END FUNCTION
```

### 3.3. `analyzeChanges`

```pseudocode
FUNCTION analyzeChanges(currentState, previousState)
    -- INPUT-- currentState (Map), previousState (Map)
    -- OUTPUT-- An object containing lists of new/modified, deleted, and renamed files.
    
    -- TDD Anchor-- Test with empty previousState (initial run).
    -- TDD Anchor-- Test with a modified file (hash change).
    -- TDD Anchor-- Test with a new file.
    -- TDD Anchor-- Test with a deleted file.
    -- TDD Anchor-- Test with a renamed file (hash match between deleted and new).
    -- TDD Anchor-- Test with a file that was deleted and a new one with the same hash added (rename).
    -- TDD Anchor-- Test with no changes.

    newAndModifiedFiles = new List()
    deletedFilePaths = new List()
    renamedFiles = new List()

    -- Invert the currentState map for efficient hash lookups
    currentHashes = new Map() -- { hash -> filePath }
    FOR EACH filePath, hash IN currentState
        currentHashes.set(hash, filePath)
    END FOR

    -- Step 1 & 2-- Identify new/modified files and potential renames
    FOR EACH filePath, currentHash IN currentState
        previousHash = previousState.get(filePath)
        IF previousHash IS NULL OR previousHash IS NOT EQUAL to currentHash THEN
            -- This file is either new or modified.
            newAndModifiedFiles.add({ path-- filePath, hash-- currentHash })
        END IF
    END FOR

    -- Step 3-- Identify deleted files
    FOR EACH filePath, previousHash IN previousState
        IF currentState.has(filePath) IS FALSE THEN
            -- This file seems to be deleted. Check if it was a rename.
            newFilePath = currentHashes.get(previousHash)
            IF newFilePath IS NOT NULL THEN
                -- Found a file with the same hash in the current state. It's a rename.
                renamedFiles.add({ old_path-- filePath, new_path-- newFilePath })
                
                -- Remove the renamed file from the newAndModifiedFiles list to avoid processing it twice.
                REMOVE item from newAndModifiedFiles WHERE item.path == newFilePath
            ELSE
                -- It's a genuine deletion.
                deletedFilePaths.add(filePath)
            END IF
        END IF
    END FOR

    RETURN {
        newAndModifiedFiles-- newAndModifiedFiles,
        deletedFiles-- deletedFilePaths,
        renamedFiles-- renamedFiles
    }
END FUNCTION
```

### 3.4. `populateQueues`

```pseudocode
FUNCTION populateQueues(dbConnection, changes)
    -- INPUT-- dbConnection (Object), changes (Object)
    -- OUTPUT-- Boolean indicating success or failure.

    -- TDD Anchor-- Test that a new/modified file creates a 'pending' task in work_queue.
    -- TDD Anchor-- Test that a deleted file creates a 'DELETE' task in refactoring_tasks.
    -- TDD Anchor-- Test that a renamed file creates a 'RENAME' task in refactoring_tasks.
    -- TDD Anchor-- Test database transactionality (all or nothing).

    TRY
        BEGIN_TRANSACTION(dbConnection)

        -- Add new and modified files to the work queue
        FOR EACH file IN changes.newAndModifiedFiles
            INSERT INTO work_queue (file_path, status) VALUES (file.path, 'pending')
        END FOR

        -- Add deleted files to the refactoring tasks queue
        FOR EACH filePath IN changes.deletedFiles
            INSERT INTO refactoring_tasks (task_type, old_path) VALUES ('DELETE', filePath)
        END FOR

        -- Add renamed files to the refactoring tasks queue
        FOR EACH file IN changes.renamedFiles
            INSERT INTO refactoring_tasks (task_type, old_path, new_path) VALUES ('RENAME', file.old_path, file.new_path)
        END FOR

        COMMIT_TRANSACTION(dbConnection)
        RETURN TRUE
    CATCH DatabaseException as e
        LOG_ERROR "Database error during queue population-- " + e.message
        ROLLBACK_TRANSACTION(dbConnection)
        RETURN FALSE
    END TRY
END FUNCTION
```

### 3.5. `saveCurrentState`

```pseudocode
FUNCTION saveCurrentState(stateFilePath, currentState)
    -- INPUT-- stateFilePath (String), currentState (Map)
    -- OUTPUT-- None. Side effect is writing to a file.

    -- TEST successful write-- Verify file content matches the currentState map.
    -- TEST file write error-- Handle permissions errors gracefully.

    TRY
        jsonString = SERIALIZE_TO_JSON(currentState)
        WRITE_FILE(stateFilePath, jsonString)
    CATCH FileWriteException as e
        LOG_ERROR "Failed to save current state to " + stateFilePath + "-- " + e.message
    END TRY
END FUNCTION
```

## 4. Helper Functions

```pseudocode
FUNCTION calculateFileHash(filePath, algorithm)
    -- Reads file content and returns its hash.
END FUNCTION

FUNCTION pathMatchesAny(filePath, patterns)
    -- Checks if a file path matches any of the glob/regex patterns.
END FUNCTION

FUNCTION connectToDatabaseWithRetry(dbPath, maxRetries, backoffFactor)
    -- Attempts to connect to the database, retrying on failure with exponential backoff.
END FUNCTION