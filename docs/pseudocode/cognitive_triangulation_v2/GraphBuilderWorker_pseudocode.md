# Pseudocode-- GraphBuilderWorker

**Module--** [`src/workers/GraphBuilderWorker.js`](src/workers/GraphBuilderWorker.js)

## 1. Overview

The `GraphBuilderWorker` is the final step in the Cognitive Triangulation v2 pipeline. It is triggered as a "finalizer" job by the queueing system (BullMQ) only after all preceding analysis and validation jobs for a specific run have completed successfully.

Its sole responsibility is to take all the validated relationship data from the central SQLite database and construct the definitive knowledge graph in the Neo4j database. This process involves creating nodes for each Point of Interest (POI) and creating edges to represent the relationships between them. All operations on the graph are designed to be idempotent to ensure consistency and allow for safe retries.

## 2. TDD Anchors

-   **[TDD-GBW-01]**-- Test that the worker correctly extracts the `runId` from the input job.
-   **[TDD-GBW-02]**-- Test that the worker constructs the correct query to fetch only `VALIDATED` relationships for the given `runId` from SQLite.
-   **[TDD-GBW-03]**-- Test the worker's behavior when no `VALIDATED` relationships are found-- it should log and complete without error.
-   **[TDD-GBW-04]**-- Test that a Neo4j database transaction is initiated when validated relationships are found.
-   **[TDD-GBW-05]**-- Test that source POI nodes are created idempotently in Neo4j using a `MERGE` operation.
-   **[TDD-GBW-06]**-- Test that target POI nodes are created idempotently in Neo4j using a `MERGE` operation.
-   **[TDD-GBW-07]**-- Test that relationship edges are created idempotently between the correct source and target nodes.
-   **[TDD-GBW-08]**-- Test that the properties of the Neo4j edge are correctly populated from the validated relationship data.
-   **[TDD-GBW-09]**-- Test that the Neo4j transaction is successfully committed after processing all relationships.
-   **[TDD-GBW-10]**-- Test that the Neo4j transaction is rolled back if an error occurs during graph construction.
-   **[TDD-GBW-11]**-- Test that the job is marked as failed if any database operation (read or write) fails.
-   **[TDD-GBW-12]**-- Test that database connections (SQLite, Neo4j) are properly closed in both success and failure scenarios.

## 3. `GraphBuilderWorker` Pseudocode

### FUNCTION `process(job)`

**INPUT--**
-   `job`-- A job object from the queue system containing run-specific data.
    -   `job.data.runId`-- The unique identifier for the analysis run.

**OUTPUT--**
-   A promise that resolves on successful completion or rejects on failure.

**LOGIC--**

1.  **BEGIN** `process`
2.      `runId` = `job.data.runId`
3.      LOG "Starting GraphBuilderWorker for runId-- " + `runId`
4.      -- TDD-GBW-01-- Test that runId is correctly extracted.

5.      `sqliteConnection` = `connectToSQLiteDatabase()`
6.      `neo4jDriver` = `connectToNeo4jDatabase()`
7.      `validatedRelationships` = `EMPTY_LIST`

8.      **TRY**
9.          -- -- Step 1-- Fetch validated data from SQLite
10.         LOG "Fetching validated relationships from SQLite for runId-- " + `runId`
11.         `query` = "SELECT * FROM relationships WHERE run_id = ? AND status = 'VALIDATED'"
12.         -- TDD-GBW-02-- Test that this exact query is used.
13.         `validatedRelationships` = `sqliteConnection.execute(query, [runId])`
14.
15.         -- -- Step 2-- Check if there's work to do
16.         IF `validatedRelationships` is EMPTY THEN
17.             LOG "No validated relationships found for runId-- " + `runId` + ". Nothing to build. Completing successfully."
18.             -- TDD-GBW-03-- Test this no-op success path.
19.             RETURN `SUCCESS`
20.         END IF
21.
22.         LOG "Found " + `validatedRelationships.length` + " relationships to build."
23.
24.         -- -- Step 3-- Build the graph in Neo4j within a single transaction
25.         `neo4jSession` = `neo4jDriver.session()`
26.         `transaction` = `neo4jSession.beginTransaction()`
27.         -- TDD-GBW-04-- Test that a transaction is initiated.
28.
29.         **TRY**
30.             FOR EACH `relationship` IN `validatedRelationships`
31.                 `sourcePoi` = `relationship.source_poi_data`
32.                 `targetPoi` = `relationship.target_poi_data`
33.
34.                 -- Idempotently create the source node
35.                 `transaction.run(`
36.                     `"MERGE (n:Poi {id-- $sourceId}) "`
37.                     `"ON CREATE SET n = $sourceProperties "`
38.                     `"ON MATCH SET n += $sourceProperties"`,
39.                     `{ sourceId-- sourcePoi.id, sourceProperties-- sourcePoi }`
40.                 `)`
41.                 -- TDD-GBW-05-- Test idempotent creation of source node.
42.
43.                 -- Idempotently create the target node
44.                 `transaction.run(`
45.                     `"MERGE (m:Poi {id-- $targetId}) "`
46.                     `"ON CREATE SET m = $targetProperties "`
47.                     `"ON MATCH SET m += $targetProperties"`,
48.                     `{ targetId-- targetPoi.id, targetProperties-- targetPoi }`
49.                 `)`
50.                 -- TDD-GBW-06-- Test idempotent creation of target node.
51.
52.                 -- Idempotently create the edge (relationship)
53.                 `relationshipProperties` = `extractEdgeProperties(relationship)`
54.                 `transaction.run(`
55.                     `"MATCH (n:Poi {id-- $sourceId}), (m:Poi {id-- $targetId}) "`
56.                     `"MERGE (n)-[r:RELATES_TO {id-- $relationshipId}]->(m) "`
57.                     `"ON CREATE SET r = $properties "`
58.                     `"ON MATCH SET r += $properties"`,
59.                     `{ sourceId-- sourcePoi.id, targetId-- targetPoi.id, relationshipId-- relationship.id, properties-- relationshipProperties }`
60.                 `)`
61.                 -- TDD-GBW-07-- Test idempotent creation of the edge.
62.                 -- TDD-GBW-08-- Test properties are correctly set on the edge.
63.             END FOR
64.
65.             `transaction.commit()`
66.             LOG "Successfully committed Neo4j transaction for runId-- " + `runId`
67.             -- TDD-GBW-09-- Test transaction is committed.
68.
69.         **CATCH** `neo4jError`
70.             LOG_ERROR "Error during Neo4j transaction for runId-- " + `runId` + " -- " + `neo4jError.message`
71.             `transaction.rollback()`
72.             LOG "Neo4j transaction rolled back."
73.             -- TDD-GBW-10-- Test transaction is rolled back.
74.             THROW `neo4jError` -- Propagate error to fail the job
75.         **FINALLY**
76.              `neo4jSession.close()`
77.         END TRY
78.
79.     **CATCH** `error`
80.         LOG_ERROR "GraphBuilderWorker failed for runId-- " + `runId` + " -- " + `error.message`
81.         -- TDD-GBW-11-- Test job fails on any error.
82.         THROW `error`
83.
84.     **FINALLY**
85.         IF `sqliteConnection` is OPEN THEN `sqliteConnection.close()`
86.         IF `neo4jDriver` is CONNECTED THEN `neo4jDriver.close()`
87.         LOG "Database connections closed for runId-- " + `runId`
88.         -- TDD-GBW-12-- Test connections are closed.
89.     END TRY
90.
91.     LOG "GraphBuilderWorker completed successfully for runId-- " + `runId`
92.     RETURN `SUCCESS`
93.
94. **END** `process`

### HELPER FUNCTION `extractEdgeProperties(relationship)`

**INPUT--**
- `relationship`-- The full relationship object from SQLite.

**OUTPUT--**
- An object containing only the properties relevant for the Neo4j edge.

**LOGIC--**
1.  **BEGIN**
2.      `properties` = {
3.          `type`-- `relationship.type`,
4.          `description`-- `relationship.description`,
5.          `confidence`-- `relationship.confidence_score`,
6.          `run_id`-- `relationship.run_id`,
7.          `validated_at`-- `NOW()`
8.      }
9.      RETURN `properties`
10. **END**