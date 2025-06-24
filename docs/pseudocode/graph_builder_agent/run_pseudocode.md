# Pseudocode for GraphBuilderAgent - run Method

This document outlines the pseudocode for the `run` method of the `GraphBuilderAgent`.

## Method-- `async run()`

**Purpose**-- The main entry point for the agent. It orchestrates the entire process of loading processed data (Points of Interest and Relationships) and persisting them into the Neo4j graph database.

---

### **Structure**

```plaintext
FUNCTION run()
  -- This function is the main orchestrator and is designed to be resilient,
  -- ensuring resources are properly managed via a TRY...CATCH...FINALLY block.

  TRY
    LOG "GraphBuilder agent run process started."
    -- TDD ANCHOR-- TEST that the run process logs its start.

    -- Step 1-- Load all Point of Interest (POI) reports from the SQLite database.
    -- These reports are the results from EntityScout.
    LOG "Loading all POI reports from the database."
    poiReports = CALL this._loadAllPoiReports()
    -- TDD ANCHOR-- TEST that `_loadAllPoiReports` is called.
    -- TDD ANCHOR-- TEST behavior when `_loadAllPoiReports` returns an empty list.
    -- TDD ANCHOR-- TEST behavior when `_loadAllPoiReports` returns a list of valid POI reports.

    -- Step 2-- Create nodes in the Neo4j database based on the loaded POI reports.
    -- This is done in a batch to optimize database performance.
    IF poiReports IS NOT EMPTY THEN
      LOG "Creating graph nodes for " + length(poiReports) + " POIs."
      CALL this._createNodesInBatch(poiReports)
      -- TDD ANCHOR-- TEST that `_createNodesInBatch` is called with the loaded POI reports.
      -- TDD ANCHOR-- TEST that the correct number of nodes are created successfully.
    ELSE
      LOG "No POI reports found to create nodes."
    END IF

    -- Step 3-- Load all relationship reports from the SQLite database.
    -- These reports are the results from the RelationshipResolverAgent.
    LOG "Loading all relationship reports from the database."
    relationshipReports = CALL this._loadAllRelationshipReports()
    -- TDD ANCHOR-- TEST that `_loadAllRelationshipReports` is called.
    -- TDD ANCHOR-- TEST behavior when `_loadAllRelationshipReports` returns an empty list.
    -- TDD ANCHOR-- TEST behavior when `_loadAllRelationshipReports` returns a list of valid relationship reports.

    -- Step 4-- Create relationships (edges) in the Neo4j database.
    -- This connects the nodes created in the previous step.
    IF relationshipReports IS NOT EMPTY THEN
      LOG "Creating graph relationships for " + length(relationshipReports) + " reports."
      CALL this._createRelationshipsInBatch(relationshipReports)
      -- TDD ANCHOR-- TEST that `_createRelationshipsInBatch` is called with the loaded relationship reports.
      -- TDD ANCHOR-- TEST that the correct number of relationships are created successfully.
    ELSE
      LOG "No relationship reports found to create relationships."
    END IF

    LOG "GraphBuilder agent run process finished successfully."
    -- TDD ANCHOR-- TEST that the process logs a success message upon completion.

  CATCH error
    -- Error handling block. Catches any exceptions from the TRY block.
    LOG_ERROR "An error occurred in the GraphBuilder agent-- " + error.message
    -- TDD ANCHOR-- TEST that any error during the process is caught and logged.
    THROW error -- Re-throw the error to allow for higher-level handling or process termination.

  FINALLY
    -- The finally block ensures that the connection to the database is always closed,
    -- regardless of whether the process succeeded or failed.
    LOG "Closing Neo4j driver connection."
    CALL this.neo4jDriver.close()
    -- TDD ANCHOR-- TEST that `neo4jDriver.close()` is called on successful completion.
    -- TDD ANCHOR-- TEST that `neo4jDriver.close()` is called even when an error occurs.
    LOG "Neo4j driver connection closed."
  END TRY

END FUNCTION
```

### **Helper Methods (Conceptual)**

-   **`_loadAllPoiReports()`**-- Queries the SQLite database to fetch all records from the `entity_scout_results` table. Returns a list of POI objects.
-   **`_createNodesInBatch(reports)`**-- Takes a list of POI reports, transforms them into Cypher `MERGE` queries for nodes, and executes them as a single batch transaction in Neo4j.
-   **`_loadAllRelationshipReports()`**-- Queries the SQLite database to fetch all records from the `relationship_resolver_results` table. Returns a list of relationship objects.
-   **`_createRelationshipsInBatch(reports)`**-- Takes a list of relationship reports, constructs Cypher queries to `MATCH` the source and target nodes and `MERGE` the relationship between them, and executes them as a single batch transaction.