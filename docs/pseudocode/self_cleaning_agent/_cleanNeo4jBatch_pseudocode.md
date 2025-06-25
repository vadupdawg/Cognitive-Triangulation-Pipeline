# Pseudocode for `_cleanNeo4jBatch` Method

**Class:** `SelfCleaningAgent`
**Method:** `_cleanNeo4jBatch(filePaths: Array<string>): Promise<void>`

## 1. Purpose

This method efficiently deletes a batch of `:File` nodes from the Neo4j database using a single, parameterized query. It is designed for performance and atomicity, ensuring that the cleanup process is robust.

## 2. SPARC Pseudocode

```pseudocode
-- BEGIN _cleanNeo4jBatch

FUNCTION _cleanNeo4jBatch(filePaths)
  -- TDD ANCHOR: TEST behavior when filePaths is null
  -- TDD ANCHOR: TEST behavior when filePaths is an empty array
  IF filePaths IS NULL OR filePaths IS EMPTY THEN
    LOG_WARN "Attempted to clean Neo4j batch with no file paths provided. Aborting operation."
    RETURN
  END IF

  -- Obtain a database session
  session = neo4jDriver.session()

  TRY
    -- Construct a single Cypher query using UNWIND for batch processing.
    -- This is more performant than sending multiple delete queries.
    query = "UNWIND $paths AS filePath MATCH (f:File {path: filePath}) DETACH DELETE f"
    params = { paths: filePaths }

    -- TDD ANCHOR: TEST that the correct query and parameters are sent to the session
    -- Execute the query asynchronously
    result = AWAIT session.run(query, params)

    -- TDD ANCHOR: TEST successful deletion by verifying logs and node count
    LOG_INFO `Neo4j batch cleanup successful. Nodes deleted: ${result.summary.counters.nodesDeleted()}`

  CATCH error
    -- If the database query fails, log the error and re-throw it
    -- to be handled by the calling `run` method's main error handler.
    LOG_ERROR `Neo4j batch cleanup failed: ${error.message}`
    -- TDD ANCHOR: TEST that an error during the Neo4j query is properly thrown
    THROW error

  FINALLY
    -- TDD ANCHOR: TEST that the session is closed, both on success and failure
    -- Ensure the session is always closed to prevent resource leaks.
    AWAIT session.close()
  END TRY

END FUNCTION

-- END _cleanNeo4jBatch
```

## 3. TDD Anchors

-   **Test Case 1: Null or Empty Input**
    -   **Given:** The `_cleanNeo4jBatch` method is called with `null` or an empty array.
    -   **When:** The method executes.
    -   **Then:** A warning should be logged, and the function should return immediately without attempting a database connection.

-   **Test Case 2: Successful Batch Deletion**
    -   **Given:** A valid array of file paths corresponding to existing `:File` nodes in Neo4j.
    -   **When:** The `_cleanNeo4jBatch` method is called.
    -   **Then:** The `session.run` method should be called with the correct `UNWIND` query and parameters.
    -   **And:** A success message should be logged, including the count of deleted nodes.
    -   **And:** The specified nodes should no longer exist in the database.
    -   **And:** The session should be closed.

-   **Test Case 3: Neo4j Query Failure**
    -   **Given:** A valid array of file paths.
    -   **When:** The `session.run` method throws an error (e.g., due to a database connection issue).
    -   **Then:** An error should be logged.
    -   **And:** The original error should be re-thrown to the caller.
    -   **And:** The session should still be closed.