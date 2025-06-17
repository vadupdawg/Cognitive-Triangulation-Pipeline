# Pseudocode-- GraphIngestorAgent

## 1. Constants and Configuration

```pseudocode
CONSTANT SQLITE_DB_PATH = GET_ENVIRONMENT_VARIABLE("SQLITE_DB_PATH")
CONSTANT NEO4J_URI = GET_ENVIRONMENT_VARIABLE("NEO4J_URI")
CONSTANT NEO4J_USER = GET_ENVIRONMENT_VARIABLE("NEO4J_USER")
CONSTANT NEO4J_PASSWORD = GET_ENVIRONMENT_VARIABLE("NEO4J_PASSWORD")
CONSTANT NEO4J_DATABASE = GET_ENVIRONMENT_VARIABLE("NEO4J_DATABASE")
CONSTANT INGESTOR_BATCH_SIZE = GET_ENVIRONMENT_VARIABLE("INGESTOR_BATCH_SIZE", default=100)
CONSTANT INGESTOR_INTERVAL_MS = GET_ENVIRONMENT_VARIABLE("INGESTOR_INTERVAL_MS", default=10000)
CONSTANT MAX_RETRIES = 3
CONSTANT RETRY_BACKOFF_MS = 1000
```

## 2. Main Execution Block

```pseudocode
FUNCTION main()
    -- TEST-- Agent starts without errors if environment variables are set.
    -- TEST-- Agent fails to start if required environment variables are missing.
    LOG("GraphIngestorAgent starting...")

    db_connection = connectToDatabaseWithRetry(SQLITE_DB_PATH)
    neo4j_driver = connectToNeo4jWithRetry(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)

    IF db_connection IS NULL OR neo4j_driver IS NULL THEN
        LOG_ERROR("Failed to connect to required services after multiple retries. Exiting.")
        RETURN
    END IF

    LOOP forever
        TRY
            analysisBatch = fetchPendingAnalysisResults(db_connection, INGESTOR_BATCH_SIZE)
            refactoringBatch = fetchPendingRefactoringTasks(db_connection)

            IF analysisBatch IS NOT EMPTY OR refactoringBatch IS NOT EMPTY THEN
                LOG("Processing batch-- " + COUNT(analysisBatch) + " analysis results, " + COUNT(refactoringBatch) + " refactoring tasks.")
                processBatch(neo4j_driver, db_connection, analysisBatch, refactoringBatch)
            ELSE
                LOG("No pending tasks found. Waiting for next cycle.")
            END IF
        CATCH DatabaseError as e
            LOG_ERROR("Database error during main loop-- " + e.message + ". Attempting to reconnect.")
            db_connection = connectToDatabaseWithRetry(SQLITE_DB_PATH)
            IF db_connection IS NULL THEN
                LOG_ERROR("Could not re-establish database connection. Exiting.")
                BREAK
            END IF
        END TRY

        sleep(INGESTOR_INTERVAL_MS)
    END LOOP

    db_connection.close()
    neo4j_driver.close()
    LOG("GraphIngestorAgent shut down.")
END FUNCTION
```

## 3. Core Batch Processing

```pseudocode
FUNCTION processBatch(neo4j_driver, db_connection, analysisBatch, refactoringBatch)
    -- This function orchestrates the entire ingestion process for a single batch.
    -- It uses a single Neo4j transaction to ensure atomicity.
    session = neo4j_driver.session(database=NEO4J_DATABASE)
    transaction = NULL
    TRY
        transaction = session.beginTransaction()
        
        -- Step A-- Handle structural changes first
        handleRefactoring(transaction, refactoringBatch)
        
        -- Step B-- Create all nodes in bulk
        createNodes(transaction, analysisBatch)
        
        -- Step C-- Create all relationships in bulk
        createRelationships(transaction, analysisBatch)
        
        transaction.commit()
        LOG("Neo4j transaction committed successfully.")

        -- Update SQLite status only after successful commit
        markTasksAsCompleted(db_connection, analysisBatch, refactoringBatch)
        LOG("SQLite records updated to completed status.")

    CATCH Neo4jError as e
        LOG_ERROR("Neo4j transaction failed-- " + e.message)
        IF transaction IS NOT NULL THEN
            transaction.rollback()
            LOG("Neo4j transaction rolled back. Batch will be retried in the next cycle.")
        END IF
        -- TEST-- A failure during any Cypher query execution results in a full rollback.
        -- TEST-- SQLite records remain in a pending state after a failed Neo4j transaction.
    FINALLY
        IF session IS NOT NULL THEN
            session.close()
        END IF
    END TRY
END FUNCTION
```

## 4. Refactoring Logic

```pseudocode
FUNCTION handleRefactoring(transaction, refactoringBatch)
    -- Processes file deletions and renames before any new data is added.
    FOR each task IN refactoringBatch
        IF task.type EQUALS 'DELETE' THEN
            -- TEST-- A 'DELETE' task removes nodes with the exact matching filePath.
            -- TEST-- A 'DELETE' task also removes all relationships connected to the deleted node.
            query = "MATCH (n {filePath-- $filePath}) DETACH DELETE n"
            parameters = { "filePath"-- task.old_path }
            transaction.run(query, parameters)
            LOG("Executed DELETE for filePath-- " + task.old_path)
        ELSE IF task.type EQUALS 'RENAME' THEN
            -- TEST-- A 'RENAME' task correctly updates the filePath on an existing node.
            -- TEST-- A 'RENAME' task also updates the qualifiedName to reflect the new file path.
            -- TEST-- A 'RENAME' task does not affect the node's relationships.
            query = """
                MATCH (n {filePath-- $old_path})
                SET n.filePath = $new_path,
                    n.qualifiedName = replace(n.qualifiedName, $old_path, $new_path)
            """
            parameters = { "old_path"-- task.old_path, "new_path"-- task.new_path }
            transaction.run(query, parameters)
            LOG("Executed RENAME from " + task.old_path + " to " + task.new_path)
        END IF
    END FOR
END FUNCTION
```

## 5. Node Creation Logic (Revised)

```pseudocode
FUNCTION createNodes(transaction, analysisBatch)
    -- Aggregates all nodes from the batch and creates/merges them using batched UNWIND queries for performance.
    -- This single process handles all entity types, including :File, removing special cases.
    -- TEST-- A batch containing multiple files with new entities creates all nodes in a single transaction.
    -- TEST-- Re-processing a file with changed entity properties (e.g., new signature) updates the node properties.
    -- TEST-- A batch query succeeds even if some entities lack optional properties.

    nodesByLabel = new Map()

    -- 1. Aggregate all nodes by their label (type) from the entire batch
    FOR each result IN analysisBatch
        llm_output = PARSE_JSON(result.llm_output)
        FOR each entity IN llm_output.entities
            label = entity.type
            IF NOT nodesByLabel.has(label) THEN
                nodesByLabel.set(label, new Array())
            END IF
            
            -- Create a properties map for the query. The query will set these on the node.
            -- A helper function should be used to strip out any keys with null/undefined values.
            properties = REMOVE_NULL_VALUES({
                "qualifiedName"-- entity.qualifiedName,
                "name"-- entity.name,
                "filePath"-- entity.filePath,
                "signature"-- entity.signature 
            })
            
            nodesByLabel.get(label).push(properties)
        END FOR
    END FOR

    -- 2. Execute one batched MERGE query per label
    FOR each label, batch IN nodesByLabel.entries()
        IF batch IS EMPTY THEN
            CONTINUE
        END IF
        
        -- TEST-- A single UNWIND query is sent for each entity type (e.g., 'File', 'Function') in the batch.
        query = "UNWIND $batch as properties MERGE (n--`" + label + "` {qualifiedName-- properties.qualifiedName}) SET n += properties"
        parameters = { "batch"-- batch }
        transaction.run(query, parameters)
        LOG("Executed MERGE for " + COUNT(batch) + " nodes with label --" + label)
    END FOR
END FUNCTION
```

## 6. Relationship Creation Logic (Revised)

```pseudocode
FUNCTION createRelationships(transaction, analysisBatch)
    -- Aggregates all relationships and creates them using batched UNWIND queries for performance.
    -- TEST-- A batch containing multiple relationship types creates all relationships correctly.
    -- TEST-- Processing the same batch again does not create duplicate relationships (idempotency).

    relsByType = new Map()

    -- 1. Aggregate all relationships by their type from the entire batch
    FOR each result IN analysisBatch
        llm_output = PARSE_JSON(result.llm_output)
        FOR each rel IN llm_output.relationships
            type = rel.type
            IF NOT relsByType.has(type) THEN
                relsByType.set(type, new Array())
            END IF
            
            relationship_data = {
                "source_qualifiedName"-- rel.source_qualifiedName,
                "target_qualifiedName"-- rel.target_qualifiedName
            }
            relsByType.get(type).push(relationship_data)
        END FOR
    END FOR

    -- 2. Execute one batched MERGE query per relationship type
    FOR each type, batch IN relsByType.entries()
        IF batch IS EMPTY THEN
            CONTINUE
        END IF

        -- TEST-- A single UNWIND query is sent for each relationship type (e.g., 'CALLS', 'IMPORTS').
        -- TEST-- The query correctly connects nodes that were created in the previous step.
        query = """
            UNWIND $batch as rel
            MATCH (source {qualifiedName-- rel.source_qualifiedName})
            MATCH (target {qualifiedName-- rel.target_qualifiedName})
            MERGE (source)-[r--`" + type + "`]->(target)
        """
        parameters = { "batch"-- batch }
        transaction.run(query, parameters)
        LOG("Executed MERGE for " + COUNT(batch) + " relationships of type --" + type)
    END FOR
END FUNCTION
```

## 7. Database Interaction Helpers

```pseudocode
FUNCTION fetchPendingAnalysisResults(db, batch_size)
    -- Fetches a batch of analysis results ready for ingestion.
    -- TEST-- Correctly fetches records with 'pending_ingestion' status.
    -- TEST-- Obeys the specified batch size limit.
    query = "SELECT id, llm_output FROM analysis_results WHERE status = 'pending_ingestion' LIMIT ?"
    RETURN db.execute(query, batch_size).fetchAll()
END FUNCTION

FUNCTION fetchPendingRefactoringTasks(db)
    -- Fetches all pending refactoring tasks.
    -- TEST-- Correctly fetches all records with 'pending' status.
    query = "SELECT id, type, old_path, new_path FROM refactoring_tasks WHERE status = 'pending'"
    RETURN db.execute(query).fetchAll()
END FUNCTION

FUNCTION markTasksAsCompleted(db, analysisBatch, refactoringBatch)
    -- Updates the status of processed tasks in SQLite.
    -- TEST-- Analysis results are updated to 'ingested'.
    -- TEST-- Refactoring tasks are updated to 'completed'.
    analysis_ids = [r.id for r in analysisBatch]
    IF analysis_ids IS NOT EMPTY THEN
        db.execute("UPDATE analysis_results SET status = 'ingested' WHERE id IN (?)", analysis_ids)
    END IF

    refactoring_ids = [t.id for t in refactoringBatch]
    IF refactoring_ids IS NOT EMPTY THEN
        db.execute("UPDATE refactoring_tasks SET status = 'completed' WHERE id IN (?)", refactoring_ids)
    END IF
    db.commit()
END FUNCTION
```

## 8. Connection Helpers with Retry Logic

```pseudocode
FUNCTION connectToDatabaseWithRetry(path)
    retries = 0
    WHILE retries < MAX_RETRIES
        TRY
            connection = connectToDatabase(path)
            LOG("Successfully connected to SQLite database.")
            RETURN connection
        CATCH ConnectionError as e
            retries = retries + 1
            LOG_ERROR("SQLite connection failed (attempt " + retries + ")-- " + e.message)
            sleep(RETRY_BACKOFF_MS * retries)
        END TRY
    END WHILE
    RETURN NULL
END FUNCTION

FUNCTION connectToNeo4jWithRetry(uri, user, password)
    retries = 0
    WHILE retries < MAX_RETRIES
        TRY
            driver = connectToNeo4j(uri, user, password)
            driver.verify_connectivity()
            LOG("Successfully connected to Neo4j database.")
            RETURN driver
        CATCH ConnectionError as e
            retries = retries + 1
            LOG_ERROR("Neo4j connection failed (attempt " + retries + ")-- " + e.message)
            sleep(RETRY_BACKOFF_MS * retries)
        END TRY
    END WHILE
    RETURN NULL
END FUNCTION