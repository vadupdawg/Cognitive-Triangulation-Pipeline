# Specification Document-- `GraphBuilder` Agent (Robust and Performant)

## 1. Introduction and Vision

The `GraphBuilder` agent is the final, crucial stage in the analysis pipeline. Its function is to persist the knowledge discovered by the `EntityScout` and `RelationshipResolver` agents into a concrete, queryable Neo4j graph database.

This specification has been fundamentally revised to address critical architectural flaws identified in the critique report ([`docs/devil/critique_report_architecture_20250622_2048.md`](docs/devil/critique_report_architecture_20250622_2048.md)). The two primary corrections are--

1.  **Database-Centric Data Pipeline--** All brittle, file-based data handoffs have been **eliminated**. The agent now sources all its data directly from the central SQLite database, ensuring a transactional, robust, and observable workflow.
2.  **Performant Graph Persistence--** The previous, flawed Cypher query for relationship creation has been replaced. The agent now uses dynamic, typed relationships, avoiding a critical Neo4j anti-pattern and ensuring high-performance queries on the resulting graph.

This agent is the bridge between ephemeral analysis and permanent, structured insight, now built on a foundation of performance and reliability.

## 2. Core Principles and Constraints

-   **Idempotency is Paramount**-- All database operations MUST be idempotent to prevent data duplication.
-   **Transactional Integrity**-- Database operations MUST be performed within transactions.
-   **Database-Centric**-- The agent MUST source all POI and Relationship data exclusively from the central SQLite database. File system I/O for data ingestion is strictly prohibited.
-   **Schema-Compliant Persistence**-- All created relationships MUST use dynamic, typed labels (e.g., `:CALLS`, `:IMPORTS`) as defined in the graph schema, not a generic `:RELATES` type.

## 3. Configuration

### Configuration Object (`GraphBuilderConfig`)

-- Property -- Type -- Description -- Default Value --
-- --- -- --- -- --- -- --- --
-- `neo4jUri` -- `string` -- The connection URI for the Neo4j database instance. -- `'neo4j://localhost:7687'` --
-- `neo4jUser` -- `string` -- The username for Neo4j authentication. -- `'neo4j'` --
-- `neo4jPassword` -- `string` -- The password for Neo4j authentication. -- `'password'` --
-- `databasePath` -- `string` -- The file system path to the central SQLite database. -- `'./db.sqlite'` --
-- `batchSize` -- `number` -- The number of Cypher queries to batch together in a single transaction. -- `100` --
-- `allowedRelationshipTypes` -- `string[]` -- A security allowlist of valid relationship types to prevent Cypher injection. -- `['CALLS', 'IMPLEMENTS', 'INHERITS_FROM', 'DEPENDS_ON', 'USES_DATA_FROM', 'CONTAINS', 'IMPORTS', 'EXPORTS', 'EXTENDS', 'USES']` --

## 4. Input Data Structures (from SQLite)

The agent consumes data by querying the SQLite database.

## 5. Class and Method Specifications

### `GraphBuilder` Class

#### Properties

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `config` -- `GraphBuilderConfig` -- The configuration object for the agent. --
-- `neo4jDriver` -- `neo4j.Driver` -- An instance of the official Neo4j driver. --
-- `dbConnection` -- `DatabaseConnection` -- A connection to the SQLite database. --

#### `constructor(config-- GraphBuilderConfig)`

-   **AI Verifiable End Result**-- A `GraphBuilder` object is created. The `neo4jDriver` has verified connectivity, and a connection to the SQLite database at `config.databasePath` is established.

#### `async run()`

-   **Purpose**-- Orchestrates the entire process of loading data from SQLite and persisting it to Neo4j.
-   **AI Verifiable End Result**-- The promise resolves successfully after all POIs and relationships from the SQLite database have been persisted to Neo4j.

#### `private async _loadAllPoisFromDb()-- Promise<Map<string, POI>>`

-   **Purpose**-- Loads all POIs from the `analysis_results` table in the SQLite database and stores them in a map for quick lookup.
-   **AI Verifiable End Result**-- A Map is returned where keys are UPIDs and values are the full `POI` objects.

#### `private async _loadRelationshipsFromDb()-- Promise<Relationship[]>`

-   **Purpose**-- Loads the final, aggregated list of relationships from the SQLite database.
-   **AI Verifiable End Result**-- An array of `Relationship` objects is returned.

#### `private async _persistNodes(poiMap-- Map<string, POI>)-- Promise<void>`

-   **Purpose**-- Persists all POIs as nodes in Neo4j using idempotent `MERGE` queries.
-   **AI Verifiable End Result**-- All nodes have been successfully created or updated in the database.

#### `private async _persistRelationships(relationships-- Relationship[])-- Promise<void>`

-   **Purpose**-- Persists all relationships as dynamically typed edges in Neo4j using idempotent `MERGE` queries.
-   **AI Verifiable End Result**-- All relationships have been successfully created or updated in the database using correct, performant typings.

## 6. TDD Anchors and Cypher Queries (Corrected)

### `GraphBuilder._persistNodes` (Idempotent Cypher)

```
TEST "persistNodes should create nodes for new POIs and update existing ones"
// This query is correct and remains unchanged.
UNWIND $batch as poi
MERGE (p:POI {id: poi.id})
ON CREATE SET p += poi
ON MATCH SET p += poi
```

### `GraphBuilder._persistRelationships` (Corrected Performant Cypher)

```
TEST "persistRelationships should create dynamically typed relationships"
TEST "persistRelationships should reject a relationship type not in the allowlist"

// CRITICAL-- This query is corrected to avoid the Neo4j anti-pattern.
// It uses dynamic relationship types, which is essential for performance.
// The application logic MUST validate `rel.type` against the `allowedRelationshipTypes`
// config array BEFORE executing this query to prevent Cypher injection.

UNWIND $batch as rel
MATCH (source:POI {id: rel.sourcePoi})
MATCH (target:POI {id: rel.targetPoi})
// The following line is conceptual. The actual implementation will use a library
// function that safely builds the query with the dynamic type.
// e.g., CALL apoc.create.relationship(source, rel.type, { ...props }, target)
MERGE (source)-[r:DYNAMIC_TYPE {type: rel.type}]->(target)
// In a real implementation, the query would be constructed like:
// `MERGE (source)-[r:${validated_rel_type}]->(target)`
ON CREATE SET
    r.confidence = rel.confidence,
    r.explanation = rel.explanation
ON MATCH SET
    r.confidence = rel.confidence,
    r.explanation = rel.explanation
```

### `GraphBuilder.run` (Revised Pseudocode Stub)

```
TEST "run should execute the full ingestion pipeline from the database successfully"
ASYNC FUNCTION run()
  // Load all data from the database first
  poiMap = AWAIT this._loadAllPoisFromDb()
  relationships = AWAIT this._loadRelationshipsFromDb()

  IF poiMap.size == 0 THEN
    LOG "No POIs found in the database to process."
    AWAIT this._closeConnection()
    RETURN
  END IF

  // Persist all nodes first, then relationships
  AWAIT this._persistNodes(poiMap)

  // Filter relationships to ensure type safety
  validRelationships = relationships.filter(rel =>
    this.config.allowedRelationshipTypes.includes(rel.type)
  )
  AWAIT this._persistRelationships(validRelationships)

  // Gracefully close connections
  AWAIT this._closeConnection() // For Neo4j
  // Close SQLite connection as well
  LOG "Graph building complete."
END FUNCTION