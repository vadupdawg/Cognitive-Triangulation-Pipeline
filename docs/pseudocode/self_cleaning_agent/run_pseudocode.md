# Pseudocode for SelfCleaningAgent.run()

## Description

This document outlines the pseudocode for the `run` method of the `SelfCleaningAgent`. This method orchestrates the cleanup of file records from the databases when files are detected as deleted from the filesystem. The process is designed to be atomic, ensuring that if any part of the cleanup fails, the entire batch operation is rolled back, leaving the system in a consistent state.

## Method-- `run`

### Signature

`FUNCTION run()`

### Logic

1.  **Find Deleted Files**
    *   `deletedFiles = CALL _findDeletedFiles()`
    *   This helper function identifies files present in the database but no longer on the filesystem.
    *   **TDD Anchor**: TEST `_findDeletedFiles` is called once when `run` is executed.

2.  **Check for Cleanup Task**
    *   `IF deletedFiles IS EMPTY THEN`
        *   `LOG "No files to clean up."`
        *   `RETURN`
    *   `END IF`
    *   **TDD Anchor**: TEST `run` logs "No files to clean up" and exits when `_findDeletedFiles` returns an empty list.

3.  **Prepare for Batch Deletion**
    *   `filePathsToDelete = EXTRACT file_path FROM each file IN deletedFiles`
    *   A list of file paths is created from the `deletedFiles` records for batch deletion.

4.  **Atomic Batch Cleanup**
    *   `TRY`
        *   `-- Atomically clean the entire batch from Neo4j`
        *   `CALL _cleanNeo4jBatch(filePathsToDelete)`
        *   **TDD Anchor**: TEST `_cleanNeo4jBatch` is called with the correct list of file paths when deleted files are found.

        *   `-- ONLY if Neo4j succeeds, atomically clean the entire batch from SQLite`
        *   `CALL _cleanSqliteBatch(filePathsToDelete)`
        *   **TDD Anchor**: TEST `_cleanSqliteBatch` is called with the correct list of file paths after `_cleanNeo4jBatch` completes successfully.

        *   `LOG "Successfully cleaned up ${count of deletedFiles} files."`
        *   **TDD Anchor**: TEST `run` logs a success message with the correct file count after both batch operations succeed.

    *   `CATCH error`
        *   `LOG_ERROR "Failed to clean up batch. No records were deleted. Reason-- ${error.message}"`
        *   `-- The system remains in a consistent state for the next run.`
        *   **TDD Anchor**: TEST `run` logs an error and performs no deletions if `_cleanNeo4jBatch` fails.
        *   **TDD Anchor**: TEST `run` logs an error and performs no SQLite deletions if `_cleanSqliteBatch` fails.

    *   `END TRY`

### Dependencies

*   `_findDeletedFiles()`-- Finds files that have been deleted from the filesystem.
*   `_cleanNeo4jBatch(filePaths)`-- Atomically deletes all nodes and relationships for the given file paths from Neo4j.
*   `_cleanSqliteBatch(filePaths)`-- Atomically deletes all records for the given file paths from SQLite.

### TDD Anchors

*   **Happy Path**
    *   TEST `run` successfully orchestrates the deletion of multiple files from both databases.
    *   TEST `run` logs a success message with the correct count of cleaned files.
*   **Edge Cases**
    *   TEST `run` exits early with a log message if no files are found for cleanup.
*   **Error Handling**
    *   TEST `run` logs an error if the Neo4j batch cleanup fails and does not proceed to SQLite cleanup.
    *   TEST `run` logs an error if the SQLite batch cleanup fails.