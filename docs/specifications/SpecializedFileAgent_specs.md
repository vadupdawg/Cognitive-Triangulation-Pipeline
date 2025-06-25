# Specification-- `SpecializedFileAgent` Logic (Revised)

## 1. Overview

This document specifies the implementation of specialized file identification logic within the existing `EntityScout` agent. This approach aligns with the **Simplicity-First** methodology recommended in the `docs/research/strategic_report_sprint_4_new_agents.md`, which prioritizes leveraging existing architecture for immediate value with minimal complexity.

Instead of creating a new agent, `EntityScout` will be enhanced to recognize a predefined set of "special" files (e.g., `package.json`, `config.js`) during its standard file discovery process. Upon identification, these files will be tagged with a specific type in the database, making them easily queryable for future specialized analysis agents.

This specification has been revised based on the critique in `critique_report_sprint_4_specs` to adopt a more robust, explicit, and maintainable pattern-matching approach.

## 2. Functional Requirements

-- **FR-1-- Special File Identification**-- The `EntityScout` agent MUST identify files that match a configurable, prioritized list of regular expression patterns.
-- **FR-2-- File Type Tagging**-- Upon identifying a special file, the `EntityScout` agent MUST assign a specific, predefined type to the file (e.g., 'manifest', 'config', 'entrypoint').
-- **FR-3-- Database Persistence**-- The assigned special file type MUST be persisted in the `files` table in the application's SQLite database.

## 3. Non-Functional Requirements

-- **NFR-1-- Performance**-- The file identification logic must introduce negligible performance overhead to the `EntityScout` agent's file discovery process.
-- **NFR-2-- Configurability & Maintainability**-- The list of special file patterns and their corresponding types must be defined in a single, easily modifiable and understandable data structure within the `EntityScout.js` file. The matching priority must be explicit.

## 4. Data Model Changes

### `files` Table Schema

To support this feature, the schema of the `files` table in the SQLite database must be altered.

**Action--** ADD COLUMN

-- **Table Name**-- `files`
-- **Column Name**-- `special_file_type`
-- **Data Type**-- `TEXT`
-- **Constraints**-- `NULLABLE`, `DEFAULT NULL`

**SQL Migration Script:**

```sql
ALTER TABLE files
ADD COLUMN special_file_type TEXT;
```

## 5. Core Logic & Function Modifications (`EntityScout`)

The core of this change involves modifying the `EntityScout` agent's logic.

### 5.1. Configuration (`EntityScout.js`)

A new configuration array will be added to the top of the `EntityScout.js` file to define the special file patterns. The order of objects in this array explicitly defines the matching priority.

**New Property-- `SPECIAL_FILE_PATTERNS`**

```javascript
// docs/src/agents/EntityScout.js

const SPECIAL_FILE_PATTERNS = [
  // Highest priority first
  { type-- 'manifest', pattern-- /^package\.json$/ },
  { type-- 'manifest', pattern-- /^requirements\.txt$/ },
  { type-- 'manifest', pattern-- /^pom\.xml$/ },
  { type-- 'entrypoint', pattern-- /^(server--main--index--app)\.js$/ },
  { type-- 'config', pattern-- /\.config\.js$/ },
  { type-- 'config', pattern-- /\.ya?ml$/ },
  { type-- 'config', pattern-- /\.json$/ }, // Lower priority than package.json
];
```
*Note-- This structure eliminates ambiguity. A file like `package.json` will match the first rule and be correctly typed as 'manifest' before the generic `.json` rule is ever tested.*

### 5.2. New Private Method-- `_getSpecialFileType`

A new helper method will be added to `EntityScout` to determine if a file is "special" based on the prioritized patterns.

**Class-- `EntityScout`**

**Method-- `_getSpecialFileType(filePath)`**
-- **Description**-- Checks a file path against the `SPECIAL_FILE_PATTERNS` array to determine its type. The first pattern that matches determines the type.
-- **Parameters**--
  -- `filePath` (String)-- The full path to the file being checked.
-- **Returns**-- `String` or `null`. The special file type if a match is found-- otherwise `null`.

**Pseudocode:**

```pseudocode
FUNCTION _getSpecialFileType(filePath):
  fileName = getBaseName(filePath)

  // Iterate through the patterns in their prioritized order
  FOR each rule in SPECIAL_FILE_PATTERNS:
    IF rule.pattern matches fileName:
      RETURN rule.type // First match wins
    END IF
  END FOR

  // No match found
  RETURN null
END FUNCTION
```

### 5.3. Modification to File Discovery & Insertion Logic

The existing logic in `EntityScout` that discovers files and inserts them into the database must be updated. The `discoverFiles` or equivalent method will be modified.

**Modified Logic within `discoverFiles` (or equivalent):**

```pseudocode
// Inside the loop that processes each discovered file
FOR each file in discovered_files:
  // ... existing logic to get file path, checksum, etc.

  // NEW-- Determine if the file is special
  specialType = this._getSpecialFileType(file.path)

  // MODIFIED-- Update database insertion call
  this.db.run(
    "INSERT OR IGNORE INTO files (file_path, checksum, language, special_file_type, status) VALUES (?, ?, ?, ?, ?)",
    [file.path, file.checksum, file.language, specialType, 'pending']
  )
END FOR
```

## 6. TDD Anchors

The following test cases should be created to validate the implementation.

-- **Unit Tests for `_getSpecialFileType`**
  -- `TEST('should return "manifest" for exact match "package.json" due to priority')`
  -- `TEST('should return "entrypoint" for an exact match on "server.js"')`
  -- `TEST('should return "config" for an extension match on "settings.yml"')`
  -- `TEST('should return "config" for a generic "data.json" file')`
  -- `TEST('should return "config" for a specific "prod.config.js" file')`
  -- `TEST('should return null for a non-special file like "my_component.js"')`
  -- `TEST('should return null for a file with no extension like "mytextfile"')`
  -- `TEST('should prioritize specific patterns over general ones, e.g., package.json is not "config"')`

-- **Integration Tests for `EntityScout.run`**
  -- `TEST('EntityScout should correctly identify and insert "package.json" with special_file_type="manifest"')`
  -- `TEST('EntityScout should correctly identify and insert "prod.config.yaml" with special_file_type="config"')`
  -- `TEST('EntityScout should insert "utils.js" with a null special_file_type')`
  -- `TEST('EntityScout should correctly update an existing file record to add a special_file_type if it was null')`