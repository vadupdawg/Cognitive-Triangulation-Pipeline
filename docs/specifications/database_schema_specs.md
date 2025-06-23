# Database Schema Specifications (Fortified)

This document defines the schema for the SQLite and Neo4j databases. It is the single source of truth for all data persistence, reflecting the revised, database-centric architecture.

## 1. SQLite Database Schema

The SQLite database manages the analysis pipeline's state, tracking files and storing all intermediate analysis results. It is the exclusive medium for data handoff between agents.

### Table-- `files`

Stores information about each discovered file.

-   **Columns**
    -   `file_path` -- TEXT -- NOT NULL -- UNIQUE -- The relative path to the file.
    -   `checksum` -- TEXT -- The SHA-256 checksum of the file content.
    -   `language` -- TEXT -- The detected programming language.
    -   `status` -- TEXT -- NOT NULL -- The processing status of the file. See Status Codes.
    -   `error_message` -- TEXT -- Stores any error message associated with a FAILED status.
    -   `last_processed` -- DATETIME -- Timestamp of the last processing attempt.

### Table-- `points_of_interest`

Stores all POIs discovered by the `EntityScout` agent.

-   **Columns**
    -   `id` -- TEXT -- PRIMARY KEY -- The Unique POI Identifier (UPID).
    -   `file_path` -- TEXT -- NOT NULL -- Foreign key to `files.file_path`.
    -   `name` -- TEXT -- NOT NULL -- The name of the POI.
    -   `type` -- TEXT -- NOT NULL -- The type string from the LLM (e.g., `FunctionDefinition`).
    -   `start_line` -- INTEGER -- The starting line number.
    -   `end_line` -- INTEGER -- The ending line number.
    -   `confidence` -- REAL -- The LLM's confidence score.

### Table-- `resolved_relationships`

Stores the final, validated relationships discovered by the `RelationshipResolver` agent. This is the source data for the `GraphBuilder`.

-   **Columns**
    -   `id` -- INTEGER -- PRIMARY KEY AUTOINCREMENT
    -   `source_poi_id` -- TEXT -- NOT NULL -- Foreign key to `points_of_interest.id`.
    -   `target_poi_id` -- TEXT -- NOT NULL -- Foreign key to `points_of_interest.id`.
    -   `type` -- TEXT -- NOT NULL -- The relationship type (e.g., `CALLS`).
    -   `confidence` -- REAL -- The confidence score.
    -   `explanation` -- TEXT -- The LLM-generated explanation.
    -   `pass_type` -- TEXT -- The analysis pass that discovered it (`Intra-File`, `Intra-Directory`, `Global`).

### Status Codes for `files.status`

-- Code -- Description --
-- --- -- --- --
-- `PENDING` -- The file is discovered and waiting for analysis. --
-- `PROCESSING` -- The file is currently being analyzed by an agent. --
-- `COMPLETED_SUCCESS` -- The file was analyzed successfully by all stages. --
-- `SKIPPED_FILE_TOO_LARGE` -- The file was skipped by `EntityScout`. --
-- `FAILED_FILE_NOT_FOUND` -- The file could not be read from the filesystem. --
-- `FAILED_LLM_API_ERROR` -- An agent encountered a non-recoverable LLM API error. --
-- `FAILED_VALIDATION_ERROR` -- An agent's LLM response was invalid after all retries. --

## 2. Neo4j Graph Schema

The Neo4j graph stores the codebase's semantic structure. The `GraphBuilder` agent is responsible for mapping data from SQLite to this schema.

### Node Labels

-   **`File`** -- Represents a source code file.
    -   **Properties** -- `{ path: String, language: String, checksum: String }`
-   **`Function`** -- Represents a function or method.
    -   **Properties** -- `{ id: String, name: String, startLine: Integer, endLine: Integer }`
-   **`Class`** -- Represents a class definition.
    -   **Properties** -- `{ id: String, name: String, startLine: Integer, endLine: Integer }`
-   **`Variable`** -- Represents a significant variable (e.g., constant, export).
    -   **Properties** -- `{ id: String, name: String, startLine: Integer, endLine: Integer }`

### Relationship Types

These are the only valid relationship types. The `GraphBuilder` must use these exact type strings.

-   `CONTAINS`
-   `CALLS`
-   `IMPORTS`
-   `EXPORTS`
-   `EXTENDS`
-   `IMPLEMENTS`
-   `DEPENDS_ON`
-   `USES_DATA_FROM`
-   `USES`