# Pseudocode for `_findDeletedFiles` Method (Revised)

**Module--** `SelfCleaningAgent`
**Method--** `_findDeletedFiles`

## 1. Purpose

This method acts as a reconciler between the database's file records and the actual file system. It identifies files that have been deleted from the disk but are not yet marked as `DELETED_ON_DISK` in the database, updates their status, and then returns a complete list of all files marked for deletion. This ensures that the cleanup process can handle files that were missed due to failures in other parts of the system.

## 2. Pre-conditions

- A connection to the SQLite database (`sqliteDb`) is established and available.
- The `files` table exists in the database with `file_path` and `status` columns.
- The `fileSystem` module is available to check for file existence.

## 3. Post-conditions

- The `status` of any file found to be missing from the disk will be updated to `DELETED_ON_DISK` in the database.
- Returns an array of file objects, each representing a file that is confirmed to be deleted from the disk.

## 4. Inputs

- None

## 5. Outputs

- `allDeletedFiles`-- An array of objects, where each object contains the `file_path` of a file marked as `DELETED_ON_DISK`.

## 6. SPARC Pseudocode

```pseudocode
FUNCTION _findDeletedFiles()
  -- Phase 1-- Reconcile files in the database with the file system.
  -- TEST-- Ensure the query correctly fetches only files not marked for deletion.
  -- Get all files that are NOT yet marked as deleted from the database.
  candidateFiles = AWAIT sqliteDb.query("SELECT file_path FROM files WHERE status != 'DELETED_ON_DISK'")

  -- This loop verifies each candidate file against the file system.
  FOR each file in candidateFiles
    -- TEST-- Mock fileSystem.exists to return FALSE and verify the database is updated.
    IF fileSystem.exists(file.file_path) IS FALSE
      -- This block handles files that exist in the DB but not on disk, indicating a prior failure.
      LOG_WARN `Found orphaned file in DB not on disk-- ${file.file_path}. Marking for deletion.`

      -- Update the status to 'DELETED_ON_DISK' so the main cleanup loop can process it.
      -- TEST-- Verify this specific UPDATE query is called with the correct file path.
      AWAIT sqliteDb.run("UPDATE files SET status = 'DELETED_ON_DISK' WHERE file_path = ?", [file.file_path])
    END IF
  END FOR

  -- Phase 2-- Retrieve the complete list of deleted files.
  -- Now, get the full list including those already marked and those we just found and updated.
  -- TEST-- Ensure this query returns both pre-existing and newly marked deleted files.
  allDeletedFiles = AWAIT sqliteDb.query("SELECT file_path FROM files WHERE status = 'DELETED_ON_DISK'")

  -- TEST-- Verify the function returns the correct and complete list of deleted files.
  RETURN allDeletedFiles
END FUNCTION
```

## 7. TDD Anchors

- **TDD-1-- `test_fetches_non_deleted_files`--** Verify that the initial query correctly selects files whose `status` is not `DELETED_ON_DISK`.
- **TDD-2-- `test_detects_and_updates_missing_file`--** Mock the file system to report a file as non-existent. Verify that the method logs a warning and correctly calls the `UPDATE` statement on the database for that file.
- **TDD-3-- `test_ignores_existing_files`--** Mock the file system to report a file as existing. Verify that the method does *not* attempt to update its status in the database.
- **TDD-4-- `test_returns_comprehensive_list`--** Pre-populate the database with some files already marked as `DELETED_ON_DISK` and some not. Simulate one of the non-deleted files as missing. Verify that the final returned list includes both the pre-existing and the newly marked files.
- **TDD-5-- `test_handles_empty_candidate_list`--** If all files are already marked for deletion, ensure the method runs without errors and returns the correct list of already-deleted files.
- **TDD-6-- `test_handles_no_files_deleted`--** If no files are missing from the disk, ensure no database updates occur and the method returns only the list of files previously marked as deleted.