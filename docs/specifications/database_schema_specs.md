# Database Schema Specifications (Fortified)

This document defines the schema for the SQLite and Neo4j databases. It is the single source of truth for all data persistence, reflecting the revised, database-centric architecture.

## 1. SQLite Database Schema

The SQLite database manages the analysis pipeline's state, tracking files and storing all intermediate analysis results. It is the exclusive medium for data handoff between agents.

### Table-- `files`

Stores information about each discovered file.

**Schema Definition--**
```sql
CREATE TABLE files (
    file_path TEXT PRIMARY KEY NOT NULL,
    checksum TEXT,
    language TEXT,
    special_file_type TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    last_processed DATETIME
);
```

### Table-- `points_of_interest`

Stores all POIs discovered by the `EntityScout` agent.

**Schema Definition--**
```sql
CREATE TABLE points_of_interest (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    confidence REAL,
    FOREIGN KEY (file_path) REFERENCES files(file_path) ON DELETE CASCADE
);
```

### Table-- `resolved_relationships`

Stores the final, validated relationships discovered by the `RelationshipResolver` agent. This is the source data for the `GraphBuilder`.

**Schema Definition--**
```sql
CREATE TABLE resolved_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_poi_id TEXT NOT NULL,
    target_poi_id TEXT NOT NULL,
    type TEXT NOT NULL,
    confidence REAL,
    explanation TEXT,
    pass_type TEXT,
    FOREIGN KEY (source_poi_id) REFERENCES points_of_interest(id) ON DELETE CASCADE,
    FOREIGN KEY (target_poi_id) REFERENCES points_of_interest(id) ON DELETE CASCADE
);
```

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
-- `DELETED_ON_DISK` -- The file was deleted from the disk and is awaiting cleanup. --

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