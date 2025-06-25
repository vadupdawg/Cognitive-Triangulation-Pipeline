# SelfCleaningAgent `_cleanNeo4jBatch` Method Pseudocode

## FUNCTION _cleanNeo4jBatch(filePaths)

### Description
This helper function performs a batch deletion of file nodes from the Neo4j database. It takes a list of file paths and deletes all corresponding `:File` nodes and their relationships in a single, atomic transaction. This ensures that either all specified nodes are deleted or none are, preventing partial updates.

### TDD Anchors
-   TEST should do nothing if the `filePaths` array is empty or null.
-   TEST should open a transaction with the Neo4j driver.
-   TEST should execute a single `DETACH DELETE` Cypher query.
-   TEST should use the `filePaths` array as a parameter in the query.
-   TEST should commit the transaction upon successful execution.
-   TEST should roll back the transaction if the query fails.
-   TEST should throw an error if the database operation fails.
-   TEST should log the successful deletion of nodes.
-   TEST should log an error and the rollback action on failure.

### Logic
```pseudocode
FUNCTION _cleanNeo4jBatch(filePaths)
  INPUT: filePaths -- An array of strings, where each string is a file path.
  OUTPUT: None -- Throws an error on failure.

  -- TEST--_cleanNeo4jBatch handles empty file path list gracefully
  IF filePaths IS NULL OR filePaths IS EMPTY
    LOG "No file paths provided for Neo4j batch cleanup. Skipping."
    RETURN
  END IF

  transaction = NULL

  TRY
    -- TEST--_cleanNeo4jBatch opens a transaction
    transaction = neo4j.beginTransaction()

    -- This single query finds all :File nodes whose file_path is in the list
    -- and deletes them along with any attached relationships (DETACH DELETE).
    -- TEST--_cleanNeo4jBatch executes a single batch delete query
    cypherQuery = "MATCH (f:File) WHERE f.file_path IN $paths DETACH DELETE f"
    parameters = { paths: filePaths }

    transaction.run(cypherQuery, parameters)

    -- TEST--_cleanNeo4jBatch commits the transaction on success
    transaction.commit()
    LOG `Successfully deleted Neo4j nodes for ${filePaths.length} files.`

  CATCH error
    -- TEST--_cleanNeo4jBatch rolls back the transaction on failure
    IF transaction IS NOT NULL
      transaction.rollback()
    END IF
    LOG_ERROR `Failed to clean Neo4j batch. Transaction rolled back. Reason: ${error.message}`
    -- TEST--_cleanNeo4jBatch throws an error on failure
    THROW new Error("Neo4j batch deletion failed.")
  END TRY
END FUNCTION