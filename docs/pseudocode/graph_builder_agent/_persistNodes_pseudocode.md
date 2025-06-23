# Pseudocode for `GraphBuilder._persistNodes`

This document outlines the pseudocode for the `_persistNodes` method, which is responsible for persisting Point of Interest (POI) nodes into the Neo4j database in batches.

## Method Signature

`PRIVATE ASYNC FUNCTION _persistNodes(poiMap)`

## **Inputs**

-   `poiMap`-- A Map where keys are POI IDs (strings) and values are POI objects. Each POI object contains properties to be stored on the node.

## **Output**

-   A Promise that resolves to `VOID` upon successful completion or rejects on error.

## **Constants**

-   `BATCH_SIZE`-- An integer defining the number of nodes to process in a single database transaction (e.g., 1000).

## Core Logic

```pseudocode
FUNCTION _persistNodes(poiMap)
    // TEST: Ensure the method handles an empty poiMap gracefully.
    IF poiMap is NULL or poiMap.size is 0 THEN
        PRINT "No POIs to persist. Exiting."
        RETURN
    END IF

    PRINT "Starting to persist " + poiMap.size + " POI nodes."

    // Convert map values to an array for easier batching
    let poiArray = convert map values of poiMap to an array

    let databaseDriver = get an instance of the Neo4j driver
    let session = NULL

    TRY
        session = databaseDriver.session()

        // Loop through the POIs in chunks of BATCH_SIZE
        FOR i FROM 0 to poiArray.length STEP BATCH_SIZE
            // TEST: Ensure correct batching for lists smaller than, equal to, and larger than BATCH_SIZE.
            let batch = poiArray.slice(i, i + BATCH_SIZE)
            
            // Prepare the data for the query. Each POI should have an 'id' and a 'properties' object.
            let params = { pois: batch }

            // This query idempotently creates or updates nodes.
            // It unwinds the list of POIs, merges a node based on its ID,
            // and then sets or updates its properties.
            // TEST: Verify the generated Cypher query is correct and uses MERGE for idempotency.
            let query = "UNWIND $pois AS poi MERGE (n:POI {id: poi.id}) SET n += poi.properties"

            // Execute the query for the current batch
            // TEST: Mock a successful database write for a single batch.
            await session.run(query, params)

            PRINT "Successfully persisted batch starting at index " + i
        END FOR

        PRINT "Finished persisting all POI nodes."
        // TDD ANCHOR (AI Verifiable End Result): After completion, a query for
        // `MATCH (n:POI) RETURN count(n)` should equal the original poiMap.size.

    CATCH error
        // TEST: Simulate a database connection error or a query failure.
        PRINT "An error occurred during node persistence: " + error.message
        // Re-throw the error to be handled by the calling function
        THROW error

    FINALLY
        // TEST: Ensure the session is always closed, even if an error occurs.
        IF session is NOT NULL THEN
            await session.close()
            PRINT "Database session closed."
        END IF
    END FINALLY
END FUNCTION
```

## TDD Anchors Summary

1.  **Empty Input**-- The function should handle a `null` or empty `poiMap` without errors.
2.  **Batching Logic**-- Test with a `poiMap` size that results in--
    -   A single, partial batch (e.g., 500 items).
    -   A single, full batch (e.g., 1000 items).
    -   Multiple batches (e.g., 2500 items).
3.  **Database Interaction**--
    -   Verify that the `MERGE` Cypher query is constructed correctly.
    -   Mock a successful database write and verify the function completes.
    -   Simulate a database error (e.g., connection failure, invalid query) and ensure the error is caught and propagated.
    -   Confirm the database session is closed in both success and failure scenarios.
4.  **Idempotency & Data Integrity (AI Verifiable)**-- After the function runs, the count of `:POI` nodes in the database must match the size of the input `poiMap`. Running the function again with the same input should not create duplicate nodes or change the final count.