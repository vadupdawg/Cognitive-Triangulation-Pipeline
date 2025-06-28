# Spec-- 05 - Neo4j Graph Schema

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Initial Draft

## 1. Overview

This document defines the target graph schema for the Neo4j database. A well-defined schema, including nodes, properties, relationships, and indexes, is crucial for query performance and data consistency. The schema is designed to be simple yet expressive enough to capture the essential structure of a codebase.

All data ingested by the `GraphIngestionWorker` must conform to this schema.

## 2. Node Labels and Properties

There is one primary node label, `POI` (Point of Interest), which is augmented by a `type` property to differentiate its role. This approach simplifies queries, as most traversals will start from a `:POI` node.

### **`:POI`**

*   **Description--** Represents any single, identifiable entity within the codebase.
*   **Properties--**
    *   `id`-- `String` **(Unique, Indexed)**. The primary key for the node. This is a composite key, typically `filePath--name`.
    *   `type`-- `String`. The specific type of the POI. This allows for filtering and is a key part of the schema. See possible values below.
    *   `name`-- `String`. The human-readable name of the entity (e.g., "calculateTotal", "UserService").
    *   `filePath`-- `String`. The absolute path to the file where the POI is defined.
    *   `startLine`-- `Integer`. The starting line number of the POI's definition.
    *   `endLine`-- `Integer`. The ending line number of the POI's definition.

#### **Values for the `type` Property**

*   `File`-- Represents an entire source code file.
*   `Class`-- Represents a class definition.
*   `Function`-- Represents a standalone function.
*   `Method`-- Represents a method within a class.
*   `Variable`-- Represents a significant variable or constant declaration.

## 3. Relationship Types

There is one primary relationship type, `:RELATIONSHIP`, which is augmented by a `type` property to differentiate the nature of the connection.

### **`:RELATIONSHIP`**

*   **Description--** Represents a directed connection between two `:POI` nodes.
*   **Properties--**
    *   `type`-- `String`. The specific type of the relationship. See possible values below.
    *   `filePath`-- `String`. The file in which this relationship was observed. This is useful for context, as a relationship (like a function call) can be defined in a different file from the source or target POI.

#### **Values for the `type` Property**

*   `DEFINES`-- Connects a `File` to a `Function`, `Class`, or `Variable` defined within it. Also connects a `Class` to a `Method` it defines.
    *   **Example--** `(:File)-[:RELATIONSHIP {type:'DEFINES'}]->(:Function)`
*   `IMPORTS`-- Connects a `File` to another `File` it imports.
    *   **Example--** `(:File)-[:RELATIONSHIP {type:'IMPORTS'}]->(:File)`
*   `CALLS`-- Connects a `Function` or `Method` to another `Function` or `Method` that it invokes.
    *   **Example--** `(:Function)-[:RELATIONSHIP {type:'CALLS'}]->(:Function)`
*   `INSTANTIATES`-- Connects a `Function` or `Method` to a `Class` that it creates an instance of.
    *   **Example--** `(:Method)-[:RELATIONSHIP {type:'INSTANTIATES'}]->(:Class)`

## 4. Required Indexes and Constraints

These Cypher commands **must** be executed against the database *before* any data ingestion begins. Indexes are critical for the performance of the `MERGE` operations in the ingestion query, as they allow Neo4j to quickly look up nodes.

### **Index Creation Commands**

```cypher
// Create a unique constraint and index on the `id` property of all :POI nodes.
// This is the most important index, as it guarantees entity uniqueness and speeds up all lookups.
// A unique constraint implicitly creates an index.
CREATE CONSTRAINT poi_id_unique IF NOT EXISTS FOR (p:POI) REQUIRE p.id IS UNIQUE;
```

### **Optional (Recommended) Indexes**

For better query performance during analysis (post-ingestion), additional indexes are recommended.

```cypher
// Create an index on the `type` property of :POI nodes.
// This will speed up queries that filter by a specific POI type, e.g., finding all functions.
CREATE INDEX poi_type_idx IF NOT EXISTS FOR (p:POI) ON (p.type);

// Create an index on the `filePath` property of :POI nodes.
// This will be useful for quickly finding all POIs within a specific file.
CREATE INDEX poi_filePath_idx IF NOT EXISTS FOR (p:POI) ON (p.filePath);