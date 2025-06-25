# _cleanSqliteBatch Pseudocode

**Function:** `_cleanSqliteBatch`
**Class:** `SelfCleaningAgent`

## 1. Purpose

Deletes a batch of file records from the SQLite `files` table within a single transaction to ensure atomicity. It includes a verification step to confirm that the `ON DELETE CASCADE` constraint on foreign keys is functioning correctly by checking for orphaned records in related tables.

## 2. Inputs

- `filePaths`: `Array<string>` -- An array of file path strings corresponding to the `file_path` column in the `files` table. These are the records to be deleted.

## 3. Output

- `Promise<void>` -- A promise that resolves when the operation is complete or rejects with an error if the transaction fails or a data integrity violation is detected.

## 4. TDD Anchors

- **TEST-1 (Happy Path)--** `_cleanSqliteBatch` should successfully delete multiple file records and their associated `points_of_interest` within a single transaction.
- **TEST-2 (Empty Input)--** `_cleanSqliteBatch` should log a warning and return immediately if called with an empty or null `filePaths` array.
- **TEST-3 (Data Integrity Failure)--** `_cleanSqliteBatch` should throw an error and roll back the transaction if orphaned `points_of_interest` are found after the deletion attempt.
- **TEST-4 (Database Error)--** `_cleanSqliteBatch` should catch any generic database errors, roll back the transaction, and re-throw the error.
- **TEST-5 (No Orphans Found)--** `_cleanSqliteBatch` should correctly commit the transaction when the verification step finds no orphaned records.

## 5. Pseudocode

```pseudocode
FUNCTION _cleanSqliteBatch(filePaths)
  // TEST Anchor-- TEST-2
  IF filePaths IS NULL OR filePaths.length EQUALS 0
    LOG_WARN "Attempted to clean SQLite batch with no file paths. Aborting operation."
    RETURN
  END IF

  // TEST Anchor-- TEST-4
  TRY
    // TEST Anchor-- TEST-1, TEST-3
    BEGIN_TRANSACTION

    // Dynamically generate placeholders for the SQL 'IN' clause
    // to prevent SQL injection vulnerabilities.
    placeholders = generatePlaceholdersForArray(filePaths) // e.g., "?, ?, ?"

    // Construct the DELETE query for the 'files' table
    deleteQuery = "DELETE FROM files WHERE file_path IN (" + placeholders + ")"

    // Execute the deletion
    // Await the database driver's run/execute method
    deleteResult = AWAIT DATABASE.execute(deleteQuery, filePaths)
    LOG_INFO "SQLite batch delete executed. Rows affected: " + deleteResult.changes

    // **Verification Step**
    // Check for orphaned records in the 'points_of_interest' table.
    // This verifies that 'ON DELETE CASCADE' is working as expected.
    verifyQuery = "SELECT id FROM points_of_interest WHERE file_path IN (" + placeholders + ")"
    orphanedPois = AWAIT DATABASE.query(verifyQuery, filePaths)

    // TEST Anchor-- TEST-3
    IF orphanedPois.length > 0
      // This is a critical failure. The database schema is not behaving as expected.
      errorMessage = "Data integrity violation-- Found " + orphanedPois.length + " orphaned points_of_interest after batch delete. Rolling back."
      LOG_ERROR errorMessage
      ROLLBACK_TRANSACTION
      THROW NEW Error(errorMessage)
    END IF

    // TEST Anchor-- TEST-1, TEST-5
    COMMIT_TRANSACTION
    LOG_INFO "SQLite batch cleanup successful. Transaction committed."

  CATCH error
    // TEST Anchor-- TEST-4
    LOG_ERROR "SQLite batch cleanup failed due to an error-- " + error.message
    // Attempt to roll back the transaction to leave the database in a consistent state.
    ROLLBACK_TRANSACTION
    // Propagate the error up the call stack so the caller is aware of the failure.
    THROW error
  END TRY
END FUNCTION