# Specification-- GraphIngestorAgent

## 1. Overview

The `GraphIngestorAgent` is the final and most critical stage in the pipeline. Its purpose is to deterministically build and update the Neo4j knowledge graph. It operates as a periodic batch processor, reading validated LLM analysis results and refactoring tasks from the central SQLite database and translating them into a series of Cypher queries. All graph modifications for a single batch are executed within a single, atomic Neo4j transaction to ensure data integrity.

## 2. Core Logic

The agent runs in a continuous loop, processing batches of data at a set interval.

1.  **Acquire Batch**-- At the start of each cycle, the agent queries the SQLite database to fetch two sets of tasks--
    *   All records from the `analysis_results` table with `status = 'pending_ingestion'`.
    *   All records from the `refactoring_tasks` table with `status = 'pending'`.

2.  **Initiate Neo4j Transaction**-- The agent connects to the Neo4j database and starts a single, large transaction. All subsequent Cypher queries for the current batch will be executed within this transaction.

3.  **Step A-- Handle Refactoring (Deletes and Renames)**-- The first pass handles structural changes to the graph based on file system modifications. This step *must* run before node creation to prevent conflicts.
    *   For each `DELETE` task, it executes a `MATCH (n {filePath-- $old_path}) DETACH DELETE n` query. This removes all nodes and relationships associated with the deleted file.
    *   For each `RENAME` task, it executes a `MATCH (n {filePath-- $old_path}) SET n.filePath = $new_path, n.qualifiedName = replace(n.qualifiedName, $old_path, $new_path)` query. This updates the core identifiers of all nodes associated with the renamed file without altering their relationships.

4.  **Step B-- Pass 1-- Node Creation (UPSERT)**-- The second pass ensures all entities from the LLM analysis exist as nodes in the graph.
    *   The agent iterates through every `llm_output` JSON from the batch of analysis results.
    *   For each record, it first creates or updates the `:File` node using a `MERGE` query on its `qualifiedName`.
    *   It then iterates through the `entities` array within the JSON. For each entity, it executes a `MERGE (n:{entity.type} {qualifiedName-- $entity.qualifiedName}) ON CREATE SET ...` query. This atomically creates the node if it doesn't exist or does nothing if it does. It sets properties like `name`, `filePath`, and `signature` on creation.

5.  **Step C-- Pass 2-- Relationship Creation**-- The final pass connects the nodes created in the previous pass. This pass can only run after all nodes are guaranteed to exist.
    *   The agent iterates through the `relationships` array of every `llm_output` in the batch.
    *   For each relationship object, it executes a three-part `MATCH-MATCH-MERGE` query--
        1.  `MATCH (source {qualifiedName-- $rel.source_qualifiedName})`
        2.  `MATCH (target {qualifiedName-- $rel.target_qualifiedName})`
        3.  `MERGE (source)-[r--{rel.type}]->(target)`
    *   This query efficiently finds the already-existing source and target nodes and creates the specified relationship between them if it doesn't already exist.

6.  **Finalize Batch**--
    *   **Commit Transaction**-- If all Cypher queries execute without error, the agent commits the Neo4j transaction, making all changes permanent.
    *   **Update SQLite State**-- Upon successful commit, the agent updates the status of the processed records in the SQLite `analysis_results` and `refactoring_tasks` tables to `'ingested'` and `'completed'`, respectively. This prevents them from being picked up in the next batch.
    *   **Rollback on Failure**-- If any Cypher query within the transaction fails, the entire transaction is automatically rolled back. The SQLite records remain in their `'pending_ingestion'` or `'pending'` state and will be retried in the next batch cycle.

## 3. Inputs

*   **Database Records (SQLite)**--
    *   A batch of records from the `analysis_results` table.
    *   A batch of records from the `refactoring_tasks` table.
*   **Environment Variables**-- Neo4j connection details (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`).

## 4. Outputs

*   **Graph Data (Neo4j)**-- New or updated nodes and relationships in the Neo4j knowledge graph.
*   **Database Records (SQLite)**-- Updated status fields for the processed records in the `analysis_results` and `refactoring_tasks` tables.
*   **Log Messages**-- Logs detailing the size of the batch being processed, the success or failure of the Neo4j transaction, and any errors encountered.

## 5. Data Structures

*   **`AnalysisResultBatch`**-- A list of in-memory objects, where each object is the parsed JSON from the `llm_output` column.
*   **`RefactoringTaskBatch`**-- A list of in-memory objects representing the tasks from the `refactoring_tasks` table.

## 6. Error Handling & Resilience

*   **SQLite Connection Errors**-- The agent will retry connecting to the database with a backoff strategy before exiting.
*   **Neo4j Connection Errors**-- The agent will retry connecting to Neo4j with a backoff strategy. If it cannot connect, the current batch processing cycle is aborted and will be retried on the next interval.
*   **Cypher Query Errors**-- Handled by the transactional nature of the process. A single query failure causes a full rollback, ensuring the graph is never left in a partially-updated, inconsistent state. The problematic batch will be retried, and persistent errors will be logged for manual inspection.

## 7. Configuration

*   **`SQLITE_DB_PATH`**-- (Required) The file path to the central SQLite database.
*   **`NEO4J_URI`**-- (Required) The connection URI for the Neo4j instance.
*   **`NEO4J_USER`**-- (Required) The username for Neo4j authentication.
*   **`NEO4J_PASSWORD`**-- (Required) The password for Neo4j authentication.
*   **`NEO4J_DATABASE`**-- (Required) The name of the Neo4j database to use.
*   **`INGESTOR_BATCH_SIZE`**-- (Optional, Default-- 100) The maximum number of analysis results to process in a single batch.
*   **`INGESTOR_INTERVAL_MS`**-- (Optional, Default-- 10000) The time in milliseconds to wait between batch processing cycles.

## 8. Initial Pseudocode Stubs / TDD Anchors

```pseudocode
FUNCTION main()
    db = connectToDatabase(SQLITE_DB_PATH)
    neo4j = connectToNeo4j(NEO4J_URI, ...)

    LOOP forever
        // Fetch all pending tasks
        analysisBatch = fetchPendingAnalysisResults(db, INGESTOR_BATCH_SIZE)
        refactoringBatch = fetchPendingRefactoringTasks(db)

        IF analysisBatch OR refactoringBatch THEN
            processBatch(neo4j, db, analysisBatch, refactoringBatch)
        END IF

        sleep(INGESTOR_INTERVAL_MS)
    END LOOP
END FUNCTION

FUNCTION processBatch(neo4j, db, analysisBatch, refactoringBatch)
    transaction = neo4j.beginTransaction()
    TRY
        -- Step A
        handleRefactoring(transaction, refactoringBatch)
        -- Step B
        createNodes(transaction, analysisBatch)
        -- Step C
        createRelationships(transaction, analysisBatch)

        transaction.commit()

        -- Update SQLite only after successful commit
        markTasksAsCompleted(db, analysisBatch, refactoringBatch)

    CATCH Neo4jError
        -- Transaction is automatically rolled back
        log("Neo4j transaction failed. Batch will be retried.")
    END TRY
END FUNCTION

FUNCTION handleRefactoring(transaction, refactoringBatch)
    -- TDD Anchor-- Test that a 'DELETE' task removes nodes with the correct filePath.
    -- TDD Anchor-- Test that a 'RENAME' task updates filePath and qualifiedName on existing nodes.
END FUNCTION

FUNCTION createNodes(transaction, analysisBatch)
    -- TDD Anchor-- Test that a new file and its entities result in new nodes being created.
    -- TDD Anchor-- Test that processing the same file again does not create duplicate nodes (idempotency).
END FUNCTION

FUNCTION createRelationships(transaction, analysisBatch)
    -- TDD Anchor-- Test that an IMPORTS relationship connects two File nodes correctly.
    -- TDD Anchor-- Test that a CALLS relationship connects two Function nodes correctly.
    -- TDD Anchor-- Test that processing the same file again does not create duplicate relationships.
END FUNCTION