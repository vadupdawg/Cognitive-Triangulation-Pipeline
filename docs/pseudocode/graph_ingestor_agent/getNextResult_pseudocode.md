# GraphIngestorAgent getNextResult() Method Pseudocode

## 1. Description

This document provides the pseudocode for the `getNextResult` method of the `GraphIngestorAgent`. This method is responsible for atomically fetching a single, unprocessed analysis result from the SQLite database and marking it as processed to prevent duplicate work by other agents or processes.

## 2. SPARC Framework Compliance

- **Specification**-- The `getNextResult` method adheres to the specifications defined in [`docs/specifications/graph_ingestor_agent_specs.md`](docs/specifications/graph_ingestor_agent_specs.md).
- **Pseudocode**-- This document.
- **Architecture**-- The architecture will be defined in the Architecture phase.
- **Refinement**-- The implementation will be refined based on this pseudocode.
- **Completion**-- The final implementation will be a result of this process.

## 3. Pseudocode

```plaintext
FUNCTION getNextResult()
    -- **TDD Anchor**
    -- TEST 'should return an unprocessed result and mark it as processed in a single transaction'
    -- TEST 'should return null if no unprocessed results are available'
    -- TEST 'should handle database errors gracefully'

    -- **Input**
    -- None.

    -- **Output**
    -- A Promise that resolves to an Object representing the analysis result, or null if none are available.
    -- The object includes the file_path associated with the result.

    -- **Logic**
    -- 1. Initialize a variable 'result' to null.
    result = NULL

    -- 2. Begin a database transaction to ensure atomicity of the read and update operations.
    BEGIN TRANSACTION

    TRY
        -- 3. Select one analysis result that has not been processed yet (processed = 0).
        --    Join with the 'files' table to retrieve the 'file_path'.
        statement = "SELECT ar.*, f.file_path FROM analysis_results ar JOIN files f ON ar.file_id = f.id WHERE ar.processed = 0 LIMIT 1"
        result = this.db.query(statement)

        -- 4. Check if a result was found.
        IF result IS NOT NULL THEN
            -- 5. If a result was found, update its 'processed' status to 1 to mark it as processed.
            --    This prevents it from being picked up again.
            update_statement = "UPDATE analysis_results SET processed = 1 WHERE id = ?"
            this.db.execute(update_statement, result.id)
        ENDIF

        -- 6. Commit the transaction to make the changes permanent.
        COMMIT TRANSACTION
    CATCH error
        -- 7. If any error occurs, roll back the transaction to leave the database in its original state.
        ROLLBACK TRANSACTION
        -- 8. Log the error for debugging purposes.
        LOG "Error in getNextResult-- " + error.message
        -- 9. Re-throw the error or handle it as appropriate.
        THROW error
    ENDTRY

    -- 10. Return the fetched result (which will be null if no unprocessed results were found).
    RETURN result

ENDFUNCTION