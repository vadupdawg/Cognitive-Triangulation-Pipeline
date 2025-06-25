# Pseudocode for `SelfCleaningAgent._cleanNeo4jNode`

## Description

This document outlines the pseudocode for the `_cleanNeo4jNode` method of the `SelfCleaningAgent` class. The method's purpose is to remove a `:File` node from the Neo4j database, identified by its file path. This is a crucial step in ensuring the knowledge graph remains synchronized with the state of the file system, removing nodes that correspond to deleted files.

---

## SPARC Pseudocode Design Principles

-   **Specification:** The pseudocode is based on the specifications for the `SelfCleaningAgent`, detailing the inputs, outputs, and core logic for deleting a Neo4j node.
-   **Architecture:** The logic assumes interaction with a Neo4j driver instance for database communication, emphasizing resource management through session handling.
-   **Refinement:** The steps are broken down into acquiring a session, defining the query, and executing it within a `TRY...FINALLY` block for robustness.
-   **Completion:** TDD anchors are included to guide the creation of unit tests for verification of the method's behavior.

---

## Pseudocode

```pseudocode
FUNCTION _cleanNeo4jNode(filePath)
  -- Method-- _cleanNeo4jNode
  -- Class-- SelfCleaningAgent

  -- **Purpose**-- Deletes the corresponding `:File` node from Neo4j to keep the graph synchronized with the file system.

  -- **Inputs**--
  -- filePath (String)-- The unique path of the file whose corresponding node should be deleted from the graph.

  -- **Outputs**--
  -- A Promise that resolves when the operation is complete or rejects if an error occurs.

  -- **TDD Anchors**--
  -- TEST_HAPPY_PATH-- Verify that when given a valid filePath that exists in the database, the corresponding `:File` node is successfully deleted.
  -- TEST_EDGE_CASE_NODE_NOT_FOUND-- Verify that the function executes without error if the provided filePath does not correspond to any node in the database.
  -- TEST_ERROR_HANDLING_DB_UNAVAILABLE-- Verify that the function properly throws or rejects an error if it cannot establish a session with the Neo4j database.
  -- TEST_CLEANUP-- Verify that the Neo4j session is closed regardless of whether the query succeeds or fails.

  -- **Logic**--

  -- 1. Log the start of the operation for traceability.
  LOG "Initiating deletion of Neo4j node for file-- " + filePath

  -- 2. Obtain a session from the Neo4j driver connection pool.
  -- This is a lightweight object to execute queries.
  session = neo4jDriver.session()

  -- 3. Define the Cypher query for deletion.
  -- The query finds a node with the label `:File` that has a `path` property matching the input `filePath`.
  -- `DETACH DELETE` is used to remove the node and all of its relationships in a single, atomic operation.
  query = "MATCH (f--File {path-- $filePath}) DETACH DELETE f"

  -- 4. Use a TRY...FINALLY block to ensure resources are released.
  -- This pattern guarantees that `session.close()` is called, preventing resource leaks,
  -- even if the query execution fails.
  TRY
    -- Execute the deletion query.
    -- The `filePath` is passed as a parameter to prevent Cypher injection vulnerabilities.
    LOG "Executing Cypher query-- " + query
    session.run(query, { filePath-- filePath })
    LOG "Successfully executed deletion query for file-- " + filePath
  CATCH error
    -- If an error occurs during query execution, log it and propagate the error.
    LOG_ERROR "Error deleting Neo4j node for file '" + filePath + "'-- " + error.message
    THROW error
  FINALLY
    -- Close the session to release the connection back to the pool.
    -- This is a critical cleanup step.
    LOG "Closing Neo4j session."
    session.close()
  END TRY

  -- The function implicitly returns a resolved promise on success.
  RETURN
END FUNCTION