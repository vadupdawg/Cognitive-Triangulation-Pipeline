# Architecture-- Specialized File Identification in `EntityScout`

## 1. Overview

This document outlines the architecture for enhancing the `EntityScout` agent with specialized file identification capabilities, as detailed in the [`docs/specifications/SpecializedFileAgent_specs.md`](docs/specifications/SpecializedFileAgent_specs.md). This feature will allow the system to recognize and tag important file types (e.g., manifests, configurations) during the initial discovery phase, providing valuable context for downstream processing agents.

## 2. Architectural Approach

In line with the project's **Simplicity-First** principle, this feature will be implemented as an **enhancement to the existing `EntityScout` agent**, not as a new, separate agent. This approach minimizes architectural complexity, reduces redundant file system traversal, and leverages the existing data pipeline.

The core idea is to integrate a pattern-matching mechanism directly into `EntityScout`'s file processing workflow.

## 3. Component Modification-- `EntityScout` Agent

The [`src/agents/EntityScout.js`](src/agents/EntityScout.js) component will be the sole focus of modification.

### 3.1. Configuration-- Externalized Patterns via `special_files.json`

To improve maintainability and decouple configuration from code, the special file patterns will be externalized to a dedicated JSON file located at `config/special_files.json`. The `EntityScout` agent will be responsible for loading and parsing this file during its initialization.

This approach allows for dynamic updates to the file patterns without requiring a code deployment. The order of patterns in the JSON array is significant, as it dictates matching priority (from highest to lowest).

**Example `config/special_files.json` Structure--**

```json
{
  "patterns"-- [
    { "type"-- "manifest", "pattern"-- "^package\\.json$" },
    { "type"-- "manifest", "pattern"-- "^requirements\\.txt$" },
    { "type"-- "entrypoint", "pattern"-- "^(server--main--index--app)\\.js$" },
    { "type"-- "config", "pattern"-- "\\.config\\.js$" },
    { "type"-- "config", "pattern"-- "\\.ya?ml$" },
    { "type"-- "config", "pattern"-- "\\.json$" }
  ]
}
```

### 3.2. New Method-- `_getSpecialFileType(filePath)`

A new private helper method, `_getSpecialFileType`, will be implemented within the `EntityScout` class. This method encapsulates the identification logic as defined in the [`docs/pseudocode/specialized_file_agent/_getSpecialFileType_pseudocode.md`](docs/pseudocode/specialized_file_agent/_getSpecialFileType_pseudocode.md).

-   **Responsibility**-- To take a file path, extract its filename, and iterate through the loaded patterns to find the first matching pattern. The filename extraction will be standardized by using the Node.js `path.basename(filePath)` function to ensure consistent behavior across all environments.
-   **Input**-- `filePath` (String).
-   **Output**-- The corresponding `type` (String) if a match is found; otherwise, `null`.

## 4. Data Flow

The data flow for identifying a special file is integrated into the existing `discoverFiles` (or equivalent) process within `EntityScout`.

```mermaid
sequenceDiagram
    participant ES as EntityScout.run()
    participant FS as File System
    participant GST as _getSpecialFileType()
    participant DB as SQLite Database

    ES->>FS-- Traverse directories
    FS-->>ES-- Found file_path
    ES->>GST-- _getSpecialFileType(file_path)
    GST-->>ES-- Return 'manifest' or null
    ES->>DB-- INSERT OR IGNORE INTO files (..., special_file_type) VALUES (..., 'manifest')
```

**Flow Steps--**

1.  `EntityScout` traverses the file system and discovers a file.
2.  For each file path, it calls `this._getSpecialFileType(filePath)`.
3.  The `_getSpecialFileType` method compares the file's name against the patterns loaded from `config/special_files.json`.
4.  If a pattern matches, the corresponding type (e.g., `'manifest'`) is returned. If not, `null` is returned.
5.  `EntityScout` proceeds to insert a new record into the `files` table, populating the `special_file_type` column with the result from the previous step.

## 5. Database Interaction

To support this feature, the database schema requires a minor modification.

### 5.1. `files` Table Schema Modification

A new, nullable column will be added to the `files` table.

-   **Table**-- `files`
-   **Column to Add**-- `special_file_type`
-   **Type**-- `TEXT`
-   **Default**-- `NULL`

**Migration SQL--**

```sql
ALTER TABLE files
ADD COLUMN special_file_type TEXT;
```

### 5.2. Modified `INSERT` Statement

The database insertion query within `EntityScout` will be updated to include the new column.

**Updated SQL Query--**

```sql
INSERT OR IGNORE INTO files 
  (file_path, checksum, language, special_file_type, status) 
VALUES (?, ?, ?, ?, ?);
```

## 6. Dependencies

The implementation of this feature relies on the following external components--

-   **Node.js `path` module**-- Specifically, `path.basename()` will be used to reliably extract the filename from a file path, as noted in Section 3.2.
-   **File System (`fs`)**-- For the core file discovery process (no changes to this interaction).
-   **SQLite Database (`sqlite3` module)**-- For persisting file metadata, including the new `special_file_type` tag.

## 7. Architectural Risks and Future Considerations

### 7.1. Risk-- "God Agent" Anti-Pattern

The decision to integrate this functionality directly into `EntityScout` aligns with the **Simplicity-First** principle for the current project scope. However, this approach carries the risk of `EntityScout` evolving into a "god agent"—a single component with a growing and overly broad set of responsibilities (file discovery, checksumming, language detection, and now classification).

### 7.2. Mitigation Path

As the system's complexity grows, this concentration of responsibility may become a bottleneck and a maintenance burden. A potential future refactoring path is to adhere more strictly to the Single Responsibility Principle. This would involve introducing a new, dedicated `ClassificationAgent`.

-   `EntityScout` would revert to its core purpose-- discovering files and recording basic metadata (path, checksum) in the database.
-   The new `ClassificationAgent` would then run as a subsequent step in the pipeline, reading file records from the database and enriching them with `language` and `special_file_type` classifications.

This future state is not required now, but the architecture is designed to make such a refactoring feasible if the agent's responsibilities continue to expand.