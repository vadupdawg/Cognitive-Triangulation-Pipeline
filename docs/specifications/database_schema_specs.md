# Database Schema Specifications

This document defines the schema for the SQLite and Neo4j databases used in the code analysis pipeline, revised to align with the ground truth analysis of the `polyglot-test` directory.

## 1. SQLite Database Schema

The SQLite database manages the analysis pipeline's state, tracking files and storing raw analysis results before their ingestion into the Neo4j graph.

### Tables

#### `files`

Stores information about each file discovered in the repository.

-   **Columns**
    -   `id` -- INTEGER -- PRIMARY KEY -- The unique identifier for the file.
    -   `file_path` -- TEXT -- NOT NULL -- UNIQUE -- The relative path to the file in the repository.
    -   `language` -- TEXT -- The programming language of the file (e.g., 'SQL', 'Java', 'JavaScript', 'Python').
    -   `last_modified` -- DATETIME -- The last modified timestamp of the file.
    -   `status` -- TEXT -- The processing status ('pending', 'processing', 'completed', 'error').
    -   `checksum` -- TEXT -- The SHA-256 checksum of the file content to detect changes.

#### `analysis_results`

Stores the raw JSON output from the Worker Agents.

-   **Columns**
    -   `id` -- INTEGER -- PRIMARY KEY -- The unique identifier for the analysis result.
    -   `file_id` -- INTEGER -- Foreign key referencing the `files` table.
    -   `worker_id` -- TEXT -- The identifier of the Worker Agent that performed the analysis.
    -   `analysis_type` -- TEXT -- The type of analysis performed (e.g., 'code_structure').
    -   `result` -- TEXT -- The JSON output from the analysis.
    -   `created_at` -- DATETIME -- DEFAULT CURRENT_TIMESTAMP -- The timestamp of creation.
    -   `processed` -- INTEGER -- DEFAULT 0 -- A flag to indicate if the result has been ingested into Neo4j (0 = no, 1 = yes).

## 2. Neo4j Graph Schema

The Neo4j graph stores the codebase as a structured graph, enabling complex queries about its architecture and dependencies.

### Node Labels

-   **`File`** -- Represents a source code file.
    -   **Properties** -- `{ path: String, language: String, checksum: String }`
-   **`Database`** -- Represents a database instance.
    -   **Properties** -- `{ name: String }`
-   **`Table`** -- Represents a database table.
    -   **Properties** -- `{ name: String, schema: String }`
-   **`Class`** -- Represents a class definition.
    -   **Properties** -- `{ name: String, filePath: String }`
-   **`Function`** -- Represents a function, method, or SQL trigger.
    -   **Properties** -- `{ name: String, signature: String, filePath: String }`
-   **`Variable`** -- Represents a structurally significant variable (e.g., module constant, class member).
    -   **Properties** -- `{ name: String, scope: String, filePath: String }`

### Relationship Types

-   **`CONTAINS`** -- A structural relationship indicating containment.
    -   `(File)-[:CONTAINS]->(Class)`
    -   `(File)-[:CONTAINS]->(Function)`
    -   `(File)-[:CONTAINS]->(Variable)`
    -   `(Class)-[:CONTAINS]->(Function)` -- (e.g., for methods)
    -   `(Database)-[:CONTAINS]->(Table)`

-   **`CALLS`** -- Represents a function or method call.
    -   `(Function)-[:CALLS]->(Function)`

-   **`IMPORTS`** -- Represents the importing of a module or library.
    -   `(File)-[:IMPORTS]->(File)`
    -   `(File)-[:IMPORTS]->(Variable)` -- (e.g., `const { x } = require('./utils')`)

-   **`EXPORTS`** -- Represents a module export.
    -   `(File)-[:EXPORTS]->(Function)`
    -   `(File)-[:EXPORTS]->(Class)`
    -   `(File)-[:EXPORTS]->(Variable)`

-   **`EXTENDS`** -- Represents class inheritance.
    -   `(Class)-[:EXTENDS]->(Class)`

-   **`USES`** -- A generic relationship for resource utilization.
    -   `(Function)-[:USES]->(Table)` -- (e.g., SQL queries in code)
    -   `(Function)-[:USES]->(Variable)` -- (e.g., using a config object)
    -   `(Table)-[:USES]->(Table)` -- (e.g., Foreign Key constraints)