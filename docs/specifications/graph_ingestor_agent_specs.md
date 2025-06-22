# Graph Ingestor Agent Specifications

This document provides the detailed specifications for the `GraphIngestorAgent`, revised to handle the structured output from the language-specific parsers.

## 1. Overview

The `GraphIngestorAgent` is responsible for processing the structured analysis results from the SQLite database and ingesting them into the Neo4j graph. It reads the `entities` and `relationships` arrays produced by the `WorkerAgent` and uses them to build a comprehensive and accurate graph representation of the codebase, ensuring idempotency by using `MERGE` for all database operations.

## 2. Class-- `GraphIngestorAgent`

### Properties

-   `db` -- Object -- An instance of the SQLite database connection client.
-   `neo4jDriver` -- Object -- An instance of the Neo4j driver.

### Constructor

-   **`constructor(db, neo4jDriver)`**
    -   **Parameters**
        -   `db` -- Object -- The SQLite database client instance.
        -   `neo4jDriver` -- Object -- The Neo4j driver instance.
    -   **Purpose** -- Initializes the agent with database connections.

### Methods

#### `run()`

-   **Signature** -- `async run()`
-   **Purpose** -- The main execution loop. It fetches unprocessed analysis results and ingests them into the graph.
-   **TDD Anchor/Pseudocode**
    ```
    async function run() --
        while (true) --
            result = await this.getNextResult()
            if (!result) then break
            await this.processResult(result)
        end while
    end function
    ```

#### `getNextResult()`

-   **Signature** -- `async getNextResult()`
-   **Return Type** -- `Promise<Object | null>`
-   **Purpose** -- Fetches a single, unprocessed analysis result and marks it as processed to prevent duplicate ingestion.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'getNextResult should return an unprocessed result and mark it as processed'
    TEST 'getNextResult should return null if no results are available'

    async function getNextResult() --
        // Begin transaction
        result = this.db.get(`
            SELECT ar.*, f.file_path FROM analysis_results ar
            JOIN files f ON ar.file_id = f.id
            WHERE ar.processed = 0 LIMIT 1
        `)
        if result --
            this.db.run("UPDATE analysis_results SET processed = 1 WHERE id = ?", result.id)
        end if
        // End transaction
        return result
    end function
    ```

#### `processResult(result)`

-   **Signature** -- `async processResult(result)`
-   **Purpose** -- Parses the JSON result and orchestrates the creation of all nodes and relationships in Neo4j.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'processResult should create all entities as nodes'
    TEST 'processResult should create all relationships'

    async function processResult(result) --
        const data = JSON.parse(result.result)
        const session = this.neo4jDriver.session()
        try --
            // Step 1-- Create all entity nodes first to ensure they exist for relationships.
            for each entity in data.entities --
                await this.createNode(session, entity)
            end for

            // Step 2-- Create all relationships between the existing nodes.
            for each relationship in data.relationships --
                await this.createRelationship(session, relationship)
            end for
        catch error --
            // Log error and potentially mark the result as failed
        finally --
            await session.close()
        end try
    end function
    ```

#### `createNode(session, entity)`

-   **Signature** -- `async createNode(session, entity)`
-   **Purpose** -- Creates a single node in Neo4j using `MERGE` to ensure idempotency. It uses the entity's `type` to determine the node label.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'createNode should create a node with the correct label and properties'

    async function createNode(session, entity) --
        // The properties for the MERGE will depend on the entity type
        // For example, a File is uniquely identified by its path.
        // A Function might be identified by its name and file path.
        const query = `MERGE (n:${entity.type} {name: $name, filePath: $filePath}) SET n += $props`
        const params = {
            name-- entity.name,
            filePath-- entity.filePath, // Assuming most entities have these
            props-- entity // Pass all properties to be set
        }
        await session.run(query, params)
    end function
    ```

#### `createRelationship(session, relationship)`

-   **Signature** -- `async createRelationship(session, relationship)`
-   **Purpose** -- Creates a single relationship in Neo4j using `MERGE`. It dynamically builds the query based on the relationship's definition.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'createRelationship should create a relationship between two existing nodes'

    async function createRelationship(session, relationship) --
        // This requires a mapping from the relationship definition to a Cypher query.
        // The `from` and `to` properties in the relationship object must contain
        // enough information to uniquely identify the start and end nodes.
        // Example for a CALLS relationship--
        // from-- { type-- 'Function', name-- 'funcA', filePath-- '/a.js' }
        // to-- { type-- 'Function', name-- 'funcB', filePath-- '/b.js' }
        // type-- 'CALLS'

        const from = relationship.from
        const to = relationship.to
        const type = relationship.type

        const query = `
            MATCH (a:${from.type} {name: $fromName, filePath: $fromFilePath})
            MATCH (b:${to.type} {name: $toName, filePath: $toFilePath})
            MERGE (a)-[r:${type}]->(b)
        `
        const params = {
            fromName-- from.name,
            fromFilePath-- from.filePath,
            toName-- to.name,
            toFilePath-- to.filePath
        }
        await session.run(query, params)
    end function