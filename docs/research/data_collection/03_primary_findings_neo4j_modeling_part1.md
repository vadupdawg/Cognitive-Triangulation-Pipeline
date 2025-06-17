# Primary Findings-- Neo4j Data Modeling for Code Graphs (Part 1)

This document outlines the initial findings on best practices for modeling a source code knowledge graph in Neo4j, focusing on schema design and data ingestion strategies as required by the Universal Code Graph V3 project.

## Core Data Modeling Principles

The effectiveness of a graph database is highly dependent on its data model. The model should be designed around the types of queries that will be performed, such as dependency analysis, impact analysis, and code discovery.

### 1. Use Specific Node Labels
Instead of using a generic `:CodeEntity` node with a `type` property, it is a best practice to use specific labels for each type of code construct. This improves query performance and semantic clarity.

*   **Recommended Labels**:
    *   `:File`: Represents a source code file.
    *   `:Function`: Represents a function or method.
    *   `:Class`: Represents a class or interface.
    *   `:Variable`: Represents a variable, constant, or class member.
    *   Other potential labels-- `:Interface`, `:Enum`, `:Module`.

*   **Rationale**: Specific labels allow Neo4j's query planner to quickly isolate the relevant subset of the graph, avoiding scans across all nodes.

### 2. Use Specific and Directed Relationship Types
Relationships should be treated as "verbs" that connect the "nouns" (nodes). The relationship type should be descriptive and the direction should be meaningful.

*   **Recommended Relationship Types**:
    *   `(:File)-[:CONTAINS]->(:Function)`: A file contains a function.
    *   `(:Function)-[:CALLS]->(:Function)`: A function calls another function.
    *   `(:File)-[:IMPORTS]->(:File)`: A file imports another file.
    *   `(:Function)-[:USES]->(:Variable)`: A function uses a variable.
    *   `(:Class)-[:EXTENDS]->(:Class)`: A class extends another.
    *   `(:Class)-[:IMPLEMENTS]->(:Interface)`: A class implements an interface.

*   **Rationale**: This rich, semantic model allows for powerful and intuitive queries that traverse the graph in a way that mirrors the actual code structure and execution flow.

### 3. Strategic Use of Properties
Node and relationship properties should store essential metadata but should not be overused for filtering in performance-critical queries.

*   **Node Properties**:
    *   `qualifiedName`: The unique identifier for the node (e.g., `src/api/users.js--createUser`). This should be indexed and have a uniqueness constraint.
    *   `name`: The simple name of the entity (e.g., `createUser`).
    *   `filePath`: Denormalized path for easy access.
    *   Other metadata-- `signature`, `startLine`, `endLine`, `isExported`.
*   **Relationship Properties**:
    *   Properties on relationships can add context. For example, a `:CALLS` relationship could have a `line_number` property.

## Efficient Data Ingestion Strategies

The project plan specifies that the `GraphIngestorAgent` will read analysis results from SQLite and load them into Neo4j in batches.

### 1. Use `UNWIND` for Batching
The `UNWIND` clause is the standard and most performant way to process a list of data (a batch) in a single query. This significantly reduces the number of round trips to the database.

### 2. Use `MERGE` for Idempotent Writes
`MERGE` is an "UPSERT" operation. It will match an existing node or relationship based on the properties provided, and if it doesn't exist, it will create it. This is crucial for building a deterministic pipeline, as the ingestion process can be run multiple times without creating duplicate data.

### 3. Two-Pass Ingestion
A two-pass approach is recommended for ingesting a batch of data that contains both nodes and relationships.

*   **Pass 1-- Ingest Nodes**: First, `UNWIND` the list of entities and `MERGE` all the nodes. This ensures that all nodes exist before attempting to create relationships between them.
    ```cypher
    // $batch is a parameter containing a list of entity objects
    UNWIND $batch.entities AS entity
    MERGE (n[--entity.type] {qualifiedName: entity.qualifiedName})
    ON CREATE SET n += entity.properties
    ```
*   **Pass 2-- Ingest Relationships**: Second, `UNWIND` the list of relationships and `MATCH` the source and target nodes (which are guaranteed to exist after Pass 1) and then `MERGE` the relationship between them.
    ```cypher
    // $batch is a parameter containing a list of relationship objects
    UNWIND $batch.relationships AS rel
    MATCH (source {qualifiedName: rel.source_qualifiedName})
    MATCH (target {qualifiedName: rel.target_qualifiedName})
    MERGE (source)-[r[--rel.type]]->(target)
    ```

### 4. Create Indexes and Constraints First
Before starting any large data ingestion, all necessary indexes and uniqueness constraints should be created. Writing to an indexed field is slightly slower, but this is far outweighed by the performance gains during the `MATCH` and `MERGE` operations of the ingestion itself.

*   **Example Constraint**:
    ```cypher
    CREATE CONSTRAINT ON (n:Function) ASSERT n.qualifiedName IS UNIQUE;
    CREATE CONSTRAINT ON (n:Class) ASSERT n.qualifiedName IS UNIQUE;
    -- etc. for all entity types
    ```

These initial findings provide a clear path forward for designing the Neo4j schema and the ingestion logic for the `GraphIngestorAgent`.