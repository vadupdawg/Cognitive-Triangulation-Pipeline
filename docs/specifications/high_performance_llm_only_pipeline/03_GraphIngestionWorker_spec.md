# Spec-- 03 - `GraphIngestionWorker`

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Initial Draft

## 1. Overview

The `GraphIngestionWorker` is the final stage in the analysis pipeline. Its sole responsibility is to consume `GraphData` jobs from the `graph-ingestion-queue` and persist the contained graph information into the Neo4j database.

This worker must be highly efficient and memory-safe, capable of handling very large JSON objects from the LLM. To achieve this, it will use the `apoc.periodic.iterate` procedure, as recommended by the "Industry Standard" database ingestion path in the [`LLM_Only_Pipeline_Research_Report.md`](../../research/LLM_Only_Pipeline_Research_Report.md:1).

## 2. Class Definition

### `GraphIngestionWorker`

This class encapsulates the logic for parsing graph data and executing bulk database writes.

#### **Properties**

*   `neo4jDriver`-- An instance of the official Neo4j driver, configured to connect to the database.

#### **Constructor**

*   `constructor(options)`--
    *   **`options`**-- `Object`. Configuration object.
        *   `neo4jUri`-- `string`. **Required**. The URI for the Neo4j instance.
        *   `neo4jUser`-- `string`. **Required**. The username for authentication.
        *   `neo4jPassword`-- `string`. **Required**. The password for authentication.

## 3. Core Functions and Logic

### `async processJob(job)`

*   **Description--** The main entry point for the worker. It receives a `GraphData` job, validates the payload, and executes the bulk ingestion Cypher query.
*   **Parameters--**
    *   `job`-- `Object`. A `GraphData` job object from BullMQ.
        *   `job.data.graphJson`-- The JSON payload from the LLM, as defined in [`02_LLMAnalysisWorker_spec.md`](./02_LLMAnalysisWorker_spec.md:1).
*   **Returns--** `Promise<void>`.
*   **Logic--**
    1.  Validate that `job.data.graphJson` exists and contains the `pois` and `relationships` arrays. If not, fail the job.
    2.  Extract the `pois` and `relationships` arrays from the payload.
    3.  Obtain a session from the `neo4jDriver`.
    4.  Execute the master `apoc.periodic.iterate` query, passing the two arrays as parameters.
    5.  Handle any potential database errors, logging them and failing the job to allow for retries.
    6.  Close the session.

## 4. Scalable Ingestion with `apoc.periodic.iterate`

To ensure memory safety and high performance, the worker will not loop through the data itself. Instead, it will pass the entire `pois` and `relationships` arrays to a single, powerful Cypher query that uses APOC procedures to handle the iteration and transaction batching internally.

### **Master Cypher Query**

This query is executed once per job. It runs two `apoc.periodic.iterate` calls sequentially. The first call creates all the nodes (POIs), and the second call creates all the relationships between them. This two-pass approach ensures that all nodes exist before relationship creation is attempted.

```cypher
// Ingestion Query for GraphIngestionWorker

// Phase 1-- Bulk-load all POIs (Nodes)
// The first apoc.periodic.iterate call takes the list of POIs from the parameters.
// It iterates through this list, and for each POI, it runs a MERGE command to create the node if it doesn't exist.
// MERGE is used to ensure idempotency-- running the same job twice will not create duplicate nodes.
// The {batchSize: 1000} tells APOC to commit the transaction every 1000 nodes, preventing memory overflows.
CALL apoc.periodic.iterate(
  "UNWIND $pois AS poi RETURN poi",
  "MERGE (p:POI {id: poi.id})
   ON CREATE SET p += {type: poi.type, name: poi.name, filePath: poi.filePath, startLine: poi.startLine, endLine: poi.endLine}
   ON MATCH SET p += {type: poi.type, name: poi.name, filePath: poi.filePath, startLine: poi.startLine, endLine: poi.endLine}",
  {batchSize: 1000, parallel: true, params: {pois: $pois}}
)
YIELD batches, total, timeTaken, committedOperations

// Phase 2-- Bulk-load all Relationships
// The second apoc.periodic.iterate call runs after the first one completes.
// It iterates through the list of relationships from the parameters.
// For each relationship, it finds the source and target nodes (which are guaranteed to exist from Phase 1)
// and creates the specified relationship between them.
// Again, MERGE is used to prevent duplicate relationships.
CALL apoc.periodic.iterate(
  "UNWIND $relationships AS rel RETURN rel",
  "MATCH (source:POI {id: rel.source})
   MATCH (target:POI {id: rel.target})
   MERGE (source)-[r:RELATIONSHIP {type: rel.type, filePath: rel.filePath}]->(target)",
  {batchSize: 1000, parallel: true, params: {relationships: $relationships}}
)
YIELD batches AS rel_batches, total AS rel_total, timeTaken AS rel_timeTaken, committedOperations AS rel_committedOperations

RETURN batches, total, timeTaken, committedOperations, rel_batches, rel_total, rel_timeTaken, rel_committedOperations
```

### **Query Parameters**

*   `$pois`-- `Array<Object>`. The array of POI objects from the job payload.
*   `$relationships`-- `Array<Object>`. The array of relationship objects from the job payload.

## 5. TDD Anchors / Pseudocode Stubs

```
TEST 'GraphIngestionWorker.processJob()' should execute the `apoc.periodic.iterate` query with correct parameters.
  - Mock the Neo4j driver's `session.run` method.
  - Provide a valid `GraphData` job payload.
  - Run `processJob()`.
  - Assert that `session.run` was called exactly once.
  - Assert that the Cypher query passed to `session.run` is the master ingestion query.
  - Assert that the parameters object passed to `session.run` contains the `pois` and `relationships` arrays from the job data.

TEST 'GraphIngestionWorker.processJob()' should handle a database error.
  - Mock the Neo4j driver's `session.run` method to throw an error.
  - Provide a valid `GraphData` job.
  - Run `processJob()`.
  - The function should catch the error.
  - Assert that the job is marked as failed (e.g., `job.moveToFailed` is called).

TEST 'GraphIngestionWorker.processJob()' should handle malformed job data.
  - Provide a job where `job.data.graphJson` is missing or does not have the `pois` array.
  - Run `processJob()`.
  - Assert that the function does NOT call the database driver.
  - Assert that the job is marked as failed with a relevant error message.