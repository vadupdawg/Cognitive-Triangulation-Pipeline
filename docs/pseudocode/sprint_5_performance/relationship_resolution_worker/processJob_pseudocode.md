# Pseudocode for `processJob(job)`

## Description
This method orchestrates the resolution of relationships for a batch of analyzed files. It ensures that the entire unit of work—saving new relationships to the database and triggering the next job in the pipeline—is performed atomically using a database transaction. This prevents partial updates and data inconsistencies.

## SPARC Pseudocode Design

```plaintext
FUNCTION processJob(job)
  
  DEFINE dbConnection = NULL
  DEFINE transaction = NULL

  TRY
    -- 1. Validate Job Payload
    -- TDD ANCHOR Test that the job is rejected if batchId is missing.
    IF job.data.batchId IS NULL THEN
      THROW new Error("Job is missing required 'batchId'.")
    END IF

    -- 2. Get DB Connection and Start Transaction
    -- TDD ANCHOR Test that a database connection is acquired.
    dbConnection = getDatabaseConnection()
    -- TDD ANCHOR Test that a transaction is successfully started.
    transaction = dbConnection.beginTransaction()

    -- 3. Load Analysis Results
    batchId = job.data.batchId
    -- TDD ANCHOR Test that _loadAnalysisResults is called with the correct batchId.
    analysisResults = this._loadAnalysisResults(batchId)

    -- TDD ANCHOR Test that the process aborts if no analysis results are found for the batchId.
    IF analysisResults IS empty THEN
      LOG "No analysis results for batchId: " + batchId + ". Job complete."
      -- Still need to commit the empty transaction to close it cleanly.
      transaction.commit()
      RETURN
    END IF

    -- 4. Resolve Relationships
    -- TDD ANCHOR Test that _resolveRelationships is called with the loaded analysisResults.
    newRelationships = this._resolveRelationships(analysisResults)

    -- 5. Save Relationships within the Transaction
    -- TDD ANCHOR Test that _saveRelationships is called with the new relationships and the active transaction.
    this._saveRelationships(newRelationships, transaction)

    -- 6. Trigger Next Job
    -- TDD ANCHOR Test that _triggerPartialGraphBuild is called with the correct batchId.
    this._triggerPartialGraphBuild(batchId)

    -- 7. Commit Transaction
    -- TDD ANCHOR Test that the transaction is committed on successful completion of all steps.
    transaction.commit()
    LOG "Successfully processed batch " + batchId + " and triggered next job."

  CATCH error
    -- TDD ANCHOR Test that if _saveRelationships fails, the transaction is rolled back.
    -- TDD ANCHOR Test that if _triggerPartialGraphBuild fails, the transaction is rolled back.
    IF transaction IS NOT NULL THEN
      LOG "Rolling back transaction due to error: " + error.message
      transaction.rollback()
    END IF
    
    -- TDD ANCHOR Test that the original error is re-thrown after rollback.
    THROW error

  FINALLY
    -- TDD ANCHOR Test that the database connection is always released, even if an error occurs.
    IF dbConnection IS NOT NULL THEN
      dbConnection.release()
    END IF
  END TRY

END FUNCTION
```

## Input
- `job`: An object representing the job from the queue, containing a `data` property with a `batchId`.

## Output
- None. The method orchestrates database writes and enqueues another job.

## TDD Anchors
1.  **Invalid Job**: Test with a job missing the `batchId` to ensure it throws a validation error.
2.  **DB Connection Failure**: Mock the `getDatabaseConnection` to fail and ensure the error is handled.
3.  **Transaction Begin Failure**: Mock `beginTransaction` to fail and ensure the error is handled and the connection is released.
4.  **Happy Path**: Test a full, successful run where results are loaded, relationships are saved, the next job is triggered, and the transaction is committed.
5.  **No Results Found**: Test with a `batchId` that returns no analysis results, ensuring the function logs and exits cleanly after committing the empty transaction.
6.  **DB Save Failure**: Mock `_saveRelationships` to throw an error. Verify that the transaction is rolled back and the error is re-thrown.
7.  **Trigger Job Failure**: Mock `_triggerPartialGraphBuild` to throw an error. Verify that the transaction is rolled back and the error is re-thrown.
8.  **Connection Release**: In all scenarios (success, failure, empty results), verify that the database connection is released in the `FINALLY` block.