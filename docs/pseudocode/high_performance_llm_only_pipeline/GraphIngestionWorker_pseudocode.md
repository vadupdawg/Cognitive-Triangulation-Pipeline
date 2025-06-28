# Pseudocode-- `GraphIngestionWorker`

**Version--** 1.0
**Date--** 2025-06-27
**Corresponding Spec--** [`03_GraphIngestionWorker_spec.md`](../../specifications/high_performance_llm_only_pipeline/03_GraphIngestionWorker_spec.md:1)

## 1. Purpose

This document provides detailed, language-agnostic pseudocode for the `GraphIngestionWorker`. This worker is responsible for consuming structured graph data from a queue and efficiently ingesting it into a Neo4j database using a scalable, bulk-loading approach.

## 2. Class-- `GraphIngestionWorker`

### 2.1. Description

Encapsulates the connection to the Neo4j database and the logic for processing graph ingestion jobs.

### 2.2. Properties

- `neo4jDriver`-- An instance of a Neo4j driver used to execute queries against the database.

---

### 2.3. `constructor(options)`

#### **Description**

Initializes the worker and establishes the database driver.

#### **Inputs**

- `options`-- OBJECT-- Configuration object containing--
  - `neo4jUri`-- STRING-- The connection URI for the Neo4j instance.
  - `neo4jUser`-- STRING-- The username for database authentication.
  - `neo4jPassword`-- STRING-- The password for database authentication.

#### **Processing**

1.  `TEST 'constructor' should successfully create a Neo4j driver instance.`
2.  `this.neo4jDriver = CREATE_NEO4J_DRIVER(options.neo4jUri, options.neo4jUser, options.neo4jPassword)`
3.  `TEST 'constructor' should throw an error if connection details are invalid or missing.`
4.  IF driver creation fails THEN
5.      THROW New Error("Failed to initialize Neo4j driver. Check connection details.")
6.  END IF

#### **Outputs**

- A new instance of `GraphIngestionWorker`.

---

## 3. Method-- `processJob(job)`

### 3.1. Description

The primary method for handling a single `GraphData` job. It validates the job payload and executes a highly optimized, two-phase Cypher query to ingest nodes and relationships in bulk.

### 3.2. Inputs

- `job`-- OBJECT-- The job object from the message queue.
  - `job.data`-- OBJECT-- The data payload of the job.
    - `job.data.graphJson`-- OBJECT-- The graph data containing--
      - `pois`-- ARRAY-- An array of Point-of-Interest objects (nodes).
      - `relationships`-- ARRAY-- An array of relationship objects.

### 3.3. Outputs

- `VOID`-- The function does not return a value but has side effects (database writes, job status changes).

### 3.4. Pseudocode

```pseudocode
FUNCTION processJob(job)
    // TDD Anchor-- Test setup for job processing
    // TEST 'processJob()' should handle malformed job data where 'graphJson' is missing.
    // TEST 'processJob()' should handle malformed job data where 'pois' or 'relationships' are not arrays.

    DEFINE graphData = job.data.graphJson

    IF graphData IS NULL OR graphData.pois IS NOT AN ARRAY OR graphData.relationships IS NOT AN ARRAY THEN
        LOG_ERROR("Malformed job data. Payload must contain 'pois' and 'relationships' arrays.", job.id)
        CALL job.moveToFailed("Malformed job data")
        RETURN
    END IF

    DEFINE pois = graphData.pois
    DEFINE relationships = graphData.relationships
    DEFINE session = NULL

    TRY
        // TDD Anchor-- Test for successful database interaction
        // TEST 'processJob()' should execute the `apoc.periodic.iterate` query with correct parameters.
        
        session = this.neo4jDriver.getSession()
        LOG_INFO("Database session opened for job-- ", job.id)

        // The query is defined as a constant string as per the specification.
        // It uses a two-phase approach-- first nodes, then relationships.
        DEFINE MASTER_INGESTION_QUERY = "
            -- Phase 1-- Bulk-load all POIs (Nodes)
            CALL apoc.periodic.iterate(
              'UNWIND $pois AS poi RETURN poi',
              'MERGE (p:POI {id: poi.id}) SET p += {type: poi.type, name: poi.name, filePath: poi.filePath, startLine: poi.startLine, endLine: poi.endLine}',
              {batchSize: 1000, parallel: true, params: {pois: $pois}}
            )
            YIELD batches, total, timeTaken, committedOperations
            
            -- Phase 2-- Bulk-load all Relationships
            CALL apoc.periodic.iterate(
              'UNWIND $relationships AS rel RETURN rel',
              'MATCH (source:POI {id: rel.source}) MATCH (target:POI {id: rel.target}) MERGE (source)-[r:RELATIONSHIP {type: rel.type, filePath: rel.filePath}]->(target)',
              {batchSize: 1000, parallel: true, params: {relationships: $relationships}}
            )
            YIELD batches AS rel_batches, total AS rel_total, timeTaken AS rel_timeTaken, committedOperations AS rel_committedOperations
            
            RETURN total, timeTaken, committedOperations, rel_total, rel_timeTaken, rel_committedOperations
        "

        DEFINE parameters = { pois: pois, relationships: relationships }

        LOG_INFO("Executing master ingestion query for job-- ", job.id)
        
        // The `run` method is asynchronous.
        AWAIT session.run(MASTER_INGESTION_QUERY, parameters)
        
        LOG_INFO("Successfully completed ingestion for job-- ", job.id)

    CATCH databaseError
        // TDD Anchor-- Test for database failure handling
        // TEST 'processJob()' should handle a database error gracefully.
        
        LOG_ERROR("Database error during ingestion for job-- ", job.id, databaseError)
        CALL job.moveToFailed(databaseError.message)
    
    FINALLY
        IF session IS NOT NULL THEN
            CALL session.close()
            LOG_INFO("Database session closed for job-- ", job.id)
        END IF
    END TRY
END FUNCTION