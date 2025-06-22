# `WorkerAgent.getNextFile` Pseudocode

## 1. Description

This pseudocode details the logic for atomically fetching a single file with a 'pending' status from the database. To prevent multiple workers from processing the same file, the operation is performed within a transaction. The file's status is updated to 'processing' and assigned the current worker's ID.

## 2. SPARC Pseudocode

```plaintext
ASYNC FUNCTION getNextFile()
    -- TEST: When a 'pending' file exists, it should be returned.
    -- TEST: The returned file's status should be updated to 'processing' in the DB.
    -- TEST: The returned file's 'worker_id' should be updated to the current worker's ID.
    -- TEST: When no 'pending' files exist, the function should return null.
    -- TEST: The entire operation should be atomic (transactional).

    -- Inputs: None
    -- Output:
    --   On success: An object representing the file record from the database.
    --   On failure or no pending files: null.

    DECLARE file AS a file object or null

    -- It is critical that the following operations are atomic to prevent race conditions
    -- where multiple workers could grab the same file.
    BEGIN DATABASE TRANSACTION

    TRY
        -- Find the first file that is waiting to be processed.
        -- The LIMIT 1 clause ensures only one file is selected.
        SET file TO this.db.query("SELECT * FROM files WHERE status = 'pending' LIMIT 1")

        -- Check if a file was found.
        IF file IS NOT null THEN
            -- If a file was found, immediately update its status to 'processing'
            -- and mark it with the current worker's ID to claim it.
            this.db.execute(
                "UPDATE files SET status = 'processing', worker_id = ? WHERE id = ?",
                this.workerId,
                file.id
            )
        END IF

        -- If the transaction is successful, commit the changes.
        COMMIT DATABASE TRANSACTION

    CATCH error
        -- If any error occurs during the process, roll back the transaction
        -- to leave the database in its original state.
        ROLLBACK DATABASE TRANSACTION
        -- Log the error for debugging purposes.
        LOG "Error in getNextFile transaction: " + error.message
        -- Ensure 'file' is null in case of an error.
        SET file TO null
    END TRY

    -- Return the retrieved file object, or null if no file was found or an error occurred.
    RETURN file

END FUNCTION