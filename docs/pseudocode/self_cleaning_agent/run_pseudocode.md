# SelfCleaningAgent `run` Method Pseudocode

## FUNCTION run()

### Description
Orchestrates the cleanup of files that have been deleted from the filesystem. This method ensures that the cleanup process is atomic, operating on a batch of files. It first identifies all deleted files. If any are found, it proceeds to delete the corresponding records from both the Neo4j and SQLite databases in atomic, all-or-nothing transactions. The entire operation is wrapped in a try-catch block to handle failures gracefully, ensuring the system remains in a consistent state.

### TDD Anchors
-   TEST should do nothing if no files are found to be deleted.
-   TEST should call `_findDeletedFiles` to get the list of files.
-   TEST should call `_cleanNeo4jBatch` with the correct file paths if files are deleted.
-   TEST should call `_cleanSqliteBatch` with the correct file paths if Neo4j cleanup is successful.
-   TEST should NOT call `_cleanSqliteBatch` if `_cleanNeo4jBatch` fails.
-   TEST should log an error and not delete anything if `_cleanNeo4jBatch` fails.
-   TEST should log an error if `_cleanSqliteBatch` fails after Neo4j succeeded.
-   TEST should log success when both cleanup operations succeed.

### Logic
```pseudocode
FUNCTION run()
  -- TEST--run executes cleanup successfully for a batch of deleted files
  -- TEST--run does nothing when no files are deleted
  -- TEST--run logs an error and stops if Neo4j batch cleanup fails
  -- TEST--run logs an error if SQLite batch cleanup fails after Neo4j succeeded

  LOG "SelfCleaningAgent run initiated."
  
  -- The _findDeletedFiles method is now responsible for the revised reconciliation logic
  deletedFiles = CALL _findDeletedFiles() 
  
  IF deletedFiles IS NULL OR deletedFiles IS EMPTY
    LOG "No files to clean up."
    RETURN
  END IF

  -- Extract just the file paths for the batch operations
  filePathsToDelete = deletedFiles.map(file => file.file_path)
  LOG `Found ${filePathsToDelete.length} files for cleanup.`

  TRY
    -- Atomically clean the entire batch from Neo4j in a single transaction
    -- TEST--run calls _cleanNeo4jBatch with all file paths
    CALL _cleanNeo4jBatch(filePathsToDelete)

    -- ONLY if Neo4j cleanup succeeds, atomically clean the entire batch from SQLite
    -- TEST--run calls _cleanSqliteBatch after successful Neo4j cleanup
    CALL _cleanSqliteBatch(filePathsToDelete)

    LOG `Successfully cleaned up ${filePathsToDelete.length} files from all data stores.`

  CATCH error
    -- This block catches failures from either _cleanNeo4jBatch or _cleanSqliteBatch
    LOG_ERROR `Failed to complete batch cleanup. The system may be in an inconsistent state. Reason: ${error.message}`
    -- The error is logged, and the process stops. The state is inconsistent if Neo4j succeeded and SQLite failed.
    -- The next run of the agent will re-process the files that failed in SQLite.
  END TRY
END FUNCTION