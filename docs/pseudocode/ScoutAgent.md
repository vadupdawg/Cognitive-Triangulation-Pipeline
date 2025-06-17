# Pseudocode-- ScoutAgent

## 1. Constants and Configuration

-   `SQLITE_DB_PATH`: String -- Path to the central SQLite database.
-   `EXCLUSION_PATTERNS`: List of Strings -- Patterns for files/directories to ignore (e.g., `node_modules`, `*.pyc`, `.git`).

## 2. Main Execution Block

```pseudocode
FUNCTION main(repositoryPath)
    -- TEST happy path-- Ensure the agent completes a full run without errors.
    
    -- Connect to the database with retry logic.
    -- TEST database connection-- Test connection failure and retry mechanism.
    dbConnection = connectToDatabaseWithRetry(SQLITE_DB_PATH, maxRetries=3, backoffFactor=2)
    
    IF dbConnection IS NOT successful THEN
        LOG_ERROR "Failed to connect to the database after multiple retries. Aborting."
        EXIT with failure code
    END IF

    -- The entire process is a single atomic transaction to ensure data consistency.
    BEGIN_TRANSACTION(dbConnection)
    TRY
        -- Load the state from the last successful run from the database.
        -- TEST database state loading-- Run with an empty file_state table (first run).
        previousState = loadPreviousStateFromDB(dbConnection)

        -- Scan the repository to get a snapshot of the current file state.
        -- TEST repository scanning-- Ensure it correctly finds files and ignores excluded ones.
        currentState = scanRepository(repositoryPath, EXCLUSION_PATTERNS)

        -- Compare the new state with the old state to identify all changes.
        changes = analyzeChanges(currentState, previousState)

        -- Log the summary of detected changes.
        LOG "Discovered " + changes.newFiles.length + " new files."
        LOG "Discovered " + changes.modifiedFiles.length + " modified files."
        LOG "Discovered " + changes.deletedFiles.length + " deleted files."
        LOG "Discovered " + changes.renamedFiles.length + " renamed files."

        -- Populate the database queues with the detected changes.
        -- TEST queue population-- Verify correct tasks are created for each change type.
        populateQueues(dbConnection, changes)
        
        -- Update the file state in the database for the next run.
        -- TEST state update-- Verify file_state table reflects the new currentState.
        updateFileStateInDB(dbConnection, currentState)

        -- If all steps succeeded, commit the transaction.
        COMMIT_TRANSACTION(dbConnection)
        LOG "Scout run completed successfully. State and queues updated."

    CATCH OperationException as e
        -- If any step failed, roll back the entire transaction.
        LOG_ERROR "An error occurred during scout execution-- " + e.message
        LOG_ERROR "Rolling back all database changes."
        ROLLBACK_TRANSACTION(dbConnection)
        EXIT with failure code
    FINALLY
        CLOSE dbConnection
    END TRY
END FUNCTION
```

## 3. Core Functions

### 3.1. `loadPreviousStateFromDB`

```pseudocode
FUNCTION loadPreviousStateFromDB(dbConnection)
    -- INPUT-- dbConnection (Object)
    -- OUTPUT-- A map of { filePath -> contentHash } or an empty map.
    -- TEST database read-- Ensure it correctly reads from the file_state table.

    previousState = new Map()
    TRY
        -- The file_state table holds the last known state.
        -- It's okay if this table is empty on the first run.
        results = QUERY(dbConnection, "SELECT file_path, content_hash FROM file_state")
        FOR EACH row IN results
            previousState.set(row.file_path, row.content_hash)
        END FOR
    CATCH DatabaseException as e
        LOG_ERROR "Failed to load previous state from database-- " + e.message
        -- Propagate the exception to trigger a transaction rollback.
        THROW new OperationException("Database read failure")
    END TRY
    RETURN previousState
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
    -- OUTPUT-- An object containing lists of new, modified, deleted, and renamed files.
    
    -- TDD Anchor-- Test with empty previousState (initial run). All files should be 'new'.
    -- TDD Anchor-- Test with a modified file (hash change).
    -- TDD Anchor-- Test with a new file.
    -- TDD Anchor-- Test with a deleted file.
    -- TDD Anchor-- Test with a renamed file (path changes, hash is identical).
    -- TDD Anchor-- Test a rename where a new file is created with the same hash as the deleted file. The logic must deterministically identify the rename.
    -- TDD Anchor-- Test with no changes. All lists should be empty.

    newFiles = new List()
    modifiedFiles = new List()
    deletedFiles = new List()
    renamedFiles = new List()

    currentPaths = new Set(currentState.keys())
    previousPaths = new Set(previousState.keys())

    persistedPaths = currentPaths.intersection(previousPaths)
    addedPaths = currentPaths.difference(previousPaths)
    potentiallyDeletedPaths = previousPaths.difference(currentPaths)

    -- Step 1-- Identify modified files.
    FOR EACH path IN persistedPaths
        IF currentState.get(path) IS NOT EQUAL to previousState.get(path) THEN
            modifiedFiles.add({ path-- path, hash-- currentState.get(path) })
        END IF
    END FOR

    -- Step 2-- Differentiate renames from true additions/deletions.
    -- Create a lookup map of hashes for all newly added files.
    addedFileHashes = new Map() -- { hash -> path }
    FOR EACH path IN addedPaths
        addedFileHashes.set(currentState.get(path), path)
    END FOR

    FOR EACH path IN potentiallyDeletedPaths
        hash = previousState.get(path)
        IF addedFileHashes.has(hash) THEN
            -- A file with this hash exists at a new path. It's a rename.
            newPath = addedFileHashes.get(hash)
            renamedFiles.add({ old_path-- path, new_path-- newPath })
            
            -- Remove this file from the set of added paths so it's not also marked as new.
            addedPaths.delete(newPath)
            -- Remove the hash from the lookup to handle cases where multiple new files have the same hash.
            addedFileHashes.delete(hash)
        ELSE
            -- No matching hash found in new files. It's a genuine deletion.
            deletedFiles.add(path)
        END IF
    END FOR

    -- Step 3-- Any remaining files in addedPaths are genuinely new.
    FOR EACH path IN addedPaths
        newFiles.add({ path-- path, hash-- currentState.get(path) })
    END FOR
    
    RETURN {
        newFiles-- newFiles,
        modifiedFiles-- modifiedFiles,
        deletedFiles-- deletedFiles,
        renamedFiles-- renamedFiles
    }
END FUNCTION
```

### 3.4. `populateQueues`

```pseudocode
FUNCTION populateQueues(dbConnection, changes)
    -- INPUT-- dbConnection (Object), changes (Object)
    -- OUTPUT-- None. Modifies the database. Throws exception on failure.
    -- TDD Anchor-- Test that a new file creates a 'pending' task in work_queue.
    -- TDD Anchor-- Test that a modified file creates a 'pending' task in work_queue.
    -- TDD Anchor-- Test that a deleted file creates a 'DELETE' task in refactoring_tasks.
    -- TDD Anchor-- Test that a renamed file creates a 'RENAME' task in refactoring_tasks.

    TRY
        -- Combine new and modified files for processing.
        allFilesToProcess = changes.newFiles.concat(changes.modifiedFiles)

        -- Add new and modified files to the work queue
        FOR EACH file IN allFilesToProcess
            -- Use INSERT OR IGNORE to prevent duplicate pending tasks.
            EXECUTE_SQL(dbConnection, "INSERT OR IGNORE INTO work_queue (file_path, status) VALUES (?, 'pending')", [file.path])
        END FOR

        -- Add deleted files to the refactoring tasks queue
        FOR EACH filePath IN changes.deletedFiles
            EXECUTE_SQL(dbConnection, "INSERT INTO refactoring_tasks (task_type, old_path) VALUES ('DELETE', ?)", [filePath])
        END FOR

        -- Add renamed files to the refactoring tasks queue
        FOR EACH file IN changes.renamedFiles
            EXECUTE_SQL(dbConnection, "INSERT INTO refactoring_tasks (task_type, old_path, new_path) VALUES ('RENAME', ?, ?)", [file.old_path, file.new_path])
        END FOR
    CATCH DatabaseException as e
        LOG_ERROR "Database error during queue population-- " + e.message
        THROW new OperationException("Queue population failure")
    END TRY
END FUNCTION
```

### 3.5. `updateFileStateInDB`

```pseudocode
FUNCTION updateFileStateInDB(dbConnection, currentState)
    -- INPUT-- dbConnection (Object), currentState (Map)
    -- OUTPUT-- None. Modifies the database. Throws exception on failure.
    -- TEST state update-- Verify table is cleared and rewritten correctly.
    
    TRY
        -- Clear the old state completely.
        EXECUTE_SQL(dbConnection, "DELETE FROM file_state")

        -- Insert the new state.
        -- This should be done as a single batch insert for performance.
        sql = "INSERT INTO file_state (file_path, content_hash) VALUES (?, ?)"
        batchData = new List()
        FOR EACH filePath, hash IN currentState
            batchData.add([filePath, hash])
        END FOR
        
        IF batchData is not empty THEN
            EXECUTE_BATCH_SQL(dbConnection, sql, batchData)
        END IF

    CATCH DatabaseException as e
        LOG_ERROR "Failed to update file state in database-- " + e.message
        THROW new OperationException("State update failure")
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