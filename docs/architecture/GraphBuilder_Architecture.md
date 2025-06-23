# Architecture Document-- `GraphBuilder` Agent

## 1. Overview

The `GraphBuilder` agent is the final component in the Cognitive Triangulation pipeline. Its sole responsibility is to persist the abstract findings of the `EntityScout` and `RelationshipResolver` into a permanent, queryable Neo4j graph database. It acts as the bridge between analysis and insight, materializing the discovered POIs as nodes and their connections as relationships. The architecture is centered around idempotency, transactional integrity, and batch processing for efficiency.

## 2. Architectural Style

The agent follows a **Repository Pattern**. It abstracts the data persistence logic, providing a clean interface (`run`) for writing the analysis results to the Neo4j database. It is a data-centric component responsible for all database write operations.

## 3. Component Breakdown

### 3.1. `GraphBuilder` Class

The primary class that orchestrates loading the final analysis data and persisting it to Neo4j.

#### Class Diagram (Conceptual)

```
+---------------------------------+
--      GraphBuilder               --
+---------------------------------+
-- - config-- GraphBuilderConfig      --
-- - neo4jDriver-- neo4j.Driver    --
+---------------------------------+
-- + constructor(config)           --
-- + async run()                   --
-- - async _loadAllPois()          --
-- - async _loadProjectSummary()   --
-- - async _persistNodes()         --
-- - async _persistRelationships() --
-- - async _closeConnection()      --
+---------------------------------+
```

#### Properties

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `config` -- `GraphBuilderConfig` -- Configuration object containing Neo4j connection details and paths to input data. --
-- `neo4jDriver` -- `neo4j.Driver` -- An instance of the official Neo4j driver, managing the database connection. --

#### Methods

##### `constructor(config-- GraphBuilderConfig)`
- **Visibility:** `public`
- **Description:** Initializes the agent. It establishes and verifies the connection to the Neo4j database using the provided configuration.

##### `async run()`
- **Visibility:** `public`
- **Description:** The main entry point. It orchestrates the entire persistence pipeline-- loading POIs, loading the project summary, persisting nodes, persisting relationships, and closing the connection.

##### `private async _loadAllPois()-- Promise<Map<string, POI>>`
- **Visibility:** `private`
- **Description:** Loads all `FileAnalysisReport` objects, extracts every POI, and places them into a Map keyed by their Unique POI Identifier (UPID) for efficient lookup.

##### `private async _loadProjectSummary()-- Promise<ProjectAnalysisSummary>`
- **Visibility:** `private`
- **Description:** Loads the single `ProjectAnalysisSummary.json` file which contains the complete list of relationships discovered by the `RelationshipResolver`.

##### `private async _persistNodes(poiMap-- Map<string, POI>)-- Promise<void>`
- **Visibility:** `private`
- **Description:** Writes all POIs to the Neo4j database as nodes. It uses idempotent `MERGE` queries and processes the nodes in batches to ensure efficiency and prevent duplicate data.

##### `private async _persistRelationships(relationships-- Relationship[])-- Promise<void>`
- **Visibility:** `private`
- **Description:** Writes all relationships to the Neo4j database as edges. It matches the source and target nodes and uses idempotent `MERGE` queries to create the relationships in batches.

##### `private async _closeConnection()`
- **Visibility:** `private`
- **Description:** Gracefully closes the connection to the Neo4j database driver, releasing all resources.

## 4. Data Models and Cypher Queries

### 4.1. Input Data Structures
The agent consumes the `FileAnalysisReport` and `ProjectAnalysisSummary` data structures as defined in the `EntityScout` and `RelationshipResolver` specifications.

### 4.2. Cypher Query for Nodes (`_persistNodes`)
This query ensures nodes are created or updated idempotently.
```cypher
UNWIND $batch as poi
MERGE (p:POI {id: poi.id})
ON CREATE SET
    p.name = poi.name,
    p.type = poi.type,
    p.startLine = poi.startLine,
    p.endLine = poi.endLine,
    p.codeSnippet = poi.codeSnippet,
    p.fileChecksum = split(poi.id, '::')[0]
ON MATCH SET
    p.name = poi.name,
    p.type = poi.type,
    p.startLine = poi.startLine,
    p.endLine = poi.endLine,
    p.codeSnippet = poi.codeSnippet,
    p.fileChecksum = split(poi.id, '::')[0]
```

### 4.3. Cypher Query for Relationships (`_persistRelationships`)
This query ensures relationships are created or updated idempotently between existing nodes.
```cypher
UNWIND $batch as rel
MATCH (source:POI {id: rel.sourcePoi})
MATCH (target:POI {id: rel.targetPoi})
MERGE (source)-[r:RELATES {type: rel.type}]->(target)
ON CREATE SET
    r.confidence = rel.confidence,
    r.explanation = rel.explanation
ON MATCH SET
    r.confidence = rel.confidence,
    r.explanation = rel.explanation
```

## 5. Interaction Diagram (Sequence)

```
[User] -> [GraphBuilder.run()]
    |
    |-- 1. _loadAllPois()
    |   <- poiMap
    |
    |-- 2. _loadProjectSummary()
    |   <- projectSummary
    |
    |-- 3. _persistNodes(poiMap)
    |   |
    |   |-- Loop in batches
    |   |   |-- session.run(Node Cypher Query, batch)
    |
    |-- 4. _persistRelationships(projectSummary.relationships)
    |   |
    |   |-- Loop in batches
    |   |   |-- session.run(Relationship Cypher Query, batch)
    |
    |-- 5. _closeConnection()
    |
    <- void
```

## 6. Key Architectural Decisions

- **Idempotency via `MERGE`:** The use of `MERGE` in all Cypher queries is the cornerstone of this agent's design. It guarantees that running the agent multiple times with the same input data will not corrupt the graph with duplicate entities, making the entire pipeline safely replayable.
- **Batch Processing:** All database writes are performed in batches within transactions. This dramatically improves performance over single-query writes and ensures that either a whole batch succeeds or fails, maintaining data integrity.
- **Decoupled Data Loading:** The agent first loads all necessary data from disk (`_loadAllPois`, `_loadProjectSummary`) and then begins the persistence process. This separation ensures that the agent has a complete picture of the work to be done before it starts writing to the database.