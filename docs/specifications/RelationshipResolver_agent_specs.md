# Specification Document-- `RelationshipResolver` Agent (Efficient and Hierarchical)

## 1. Introduction and Vision

This document specifies a fortified architecture for the `RelationshipResolver` agent, designed for efficiency, scalability, and resilience. The previous design, which produced redundant data and relied on vague summaries, has been overhauled to address the critical flaws identified in the architectural critique ([`docs/devil/critique_report_architecture_20250622_2048.md`](docs/devil/critique_report_architecture_20250622_2048.md)).

The new architecture is built on **mutually exclusive, hierarchical analysis passes**. This eliminates computational waste and the need for a final deduplication step.

1.  **Pass 1 (Intra-File)--** Discovers relationships where both source and target POIs are within the **same file**.
2.  **Pass 2 (Intra-Directory)--** Discovers relationships where source and target POIs are in **different files but within the same directory**.
3.  **Pass 3 (Global)--** Discovers relationships between "public" or "exported" POIs across **different directories**.

This refined, non-overlapping approach ensures that each LLM call has a distinct, well-defined purpose, leading to a more robust, efficient, and maintainable system.

## 2. Core Principles and Constraints

-   **LLM-Exclusive Semantic Analysis**-- The agent relies on LLM-based reasoning for discovering semantic relationships.
-   **Mutually Exclusive Passes**-- The agent MUST process the codebase in a structured, three-pass hierarchy where each pass is responsible for a distinct scope of relationships.
-   **Resilience by Design**-- Every LLM interaction MUST be subject to a self-correcting retry mechanism with targeted feedback.
-   **Database-Centric**-- All input data (POIs) MUST be read from the central SQLite database, not the filesystem.

## 3. Configuration

### Configuration Object (`RelationshipResolverConfig`)

-- Property -- Type -- Description -- Default Value --
-- --- -- --- -- --- -- --- --
-- `analysisModel` -- `string` -- The identifier for the primary LLM used for relationship analysis. -- `'claude-3-opus-20240229'` --
-- `relationshipTypes` -- `string[]` -- An array of relationship types the agent should identify. -- `['CALLS', 'IMPLEMENTS', 'INHERITS_FROM', 'DEPENDS_ON']` --
-- `maxRetries` -- `number` -- The maximum number of self-correction attempts for any LLM call. -- `2` --
-- `databasePath` -- `string` -- The path to the central SQLite database. -- `'./db.sqlite'` --

## 4. Data Structures

### Unique POI Identifier (UPID)

A unique identifier for a POI, consistent with `EntityScout`.
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `id` -- `string` -- A unique identifier, typically in the format-- `{fileChecksum}::{poiName}@{startLine}-{endLine}`. --

### Relationship

Represents a directional link between two POIs.
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `sourcePoi` -- `UPID` -- The unique identifier of the source POI. --
-- `targetPoi` -- `UPID` -- The unique identifier of the target POI. --
-- `type` -- `string` -- The type of relationship (e.g., `CALLS`). --
-- `confidence` -- `number` -- A score from 0 to 1 representing the confidence in the relationship's validity. --
-- `explanation` -- `string` -- A brief, LLM-generated explanation. --

### Project Analysis Summary (Final Output)

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `relationships` -- `Relationship[]` -- A flat array of all unique `Relationship` objects from all passes. --
-- `metadata` -- `object` -- Metadata about the resolution process (models used, time taken, etc.). --

## 5. `LLMResponseSanitizer` Module

This specification is identical to the one used by `EntityScout`. It provides basic cleaning functions but **does not** attempt to fix truncated objects.

## 6. Class and Method Specifications

### `RelationshipResolver` Class

#### Properties
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `config` -- `RelationshipResolverConfig` -- The configuration object for the agent. --
-- `llmClient` -- `LLMClient` -- An instance of a client for the `analysisModel`. --
-- `dbConnection` -- `DatabaseConnection` -- A connection to the SQLite database. --

#### `constructor(config-- RelationshipResolverConfig)`
-   **AI Verifiable End Result**-- A `RelationshipResolver` object is created and a connection to the SQLite database is established.

#### `async run()-- Promise<ProjectAnalysisSummary>`
-   **Purpose**-- Orchestrates the entire three-pass hierarchical analysis.
-   **AI Verifiable End Result**-- A `ProjectAnalysisSummary` object is returned, containing a comprehensive and non-redundant map of all relationships.

#### `private async _loadAndGroupPois()-- Promise<Map<string, POI[]>>`
-   **Purpose**-- Loads all POIs from the SQLite database and groups them by their parent directory.
-   **AI Verifiable End Result**-- A `Map` is returned where keys are directory paths and values are arrays of `POI` objects belonging to that directory.

#### `private async _runIntraFilePass(poisInFile-- POI[])-- Promise<Relationship[]>`
-   **Purpose**-- **Pass 1**-- Analyzes a single file's POIs to find relationships contained entirely within that file.
-   **AI Verifiable End Result**-- An array of `Relationship` objects found exclusively between POIs within the given file.

#### `private async _runIntraDirectoryPass(directoryPath-- string, poisByFile-- Map<string, POI[]>)-- Promise<{ relationships-- Relationship[], exports-- POI[] }>`
-   **Purpose**-- **Pass 2**-- Analyzes all POIs within a single directory to find relationships **between different files** in that directory. It also identifies "exported" POIs for the next pass.
-   **AI Verifiable End Result**-- An object containing an array of inter-file `Relationship` objects and an array of `POI` objects considered to be the public interface of the directory.

#### `private async _runGlobalPass(allDirectoryExports-- Map<string, POI[]>)-- Promise<Relationship[]>`
-   **Purpose**-- **Pass 3**-- Analyzes the "exported" POIs from all directories to find the remaining cross-directory relationships.
-   **AI Verifiable End Result**-- An array of `Relationship` objects that connect POIs across different directories.

#### `private async _queryLlmWithRetry(prompt-- string, schema-- object)-- Promise<any>`
-   **Purpose**-- A generic, resilient method for querying the LLM, handling sanitization, validation, and self-correction retries with targeted feedback.
-   **AI Verifiable End Result**-- A validated JSON object that conforms to the provided schema is returned.

## 7. TDD Anchors (Revised Pseudocode)

### `RelationshipResolver.run`
```
TEST "run should orchestrate three mutually exclusive passes and return a final summary"
ASYNC FUNCTION run()
  poisByDir = AWAIT this._loadAndGroupPois()
  allRelationships = []
  allDirectoryExports = new Map()

  // Pass 1 & 2
  FOR EACH directory, poisInDir IN poisByDir
    // Group POIs by file for the next steps
    poisByFile = GROUP poisInDir by file path

    // Pass 1
    FOR EACH file, poisInFile IN poisByFile
      IF poisInFile.length < 2 THEN CONTINUE
      intraFileRelationships = AWAIT this._runIntraFilePass(poisInFile)
      allRelationships.push(...intraFileRelationships)
    END FOR

    // Pass 2
    IF poisByFile.size < 2 THEN CONTINUE
    dirResult = AWAIT this._runIntraDirectoryPass(directory, poisByFile)
    allRelationships.push(...dirResult.relationships)
    allDirectoryExports.set(directory, dirResult.exports)
  END FOR

  // Pass 3 (Global)
  globalRelationships = AWAIT this._runGlobalPass(allDirectoryExports)
  allRelationships.push(...globalRelationships)

  // No deduplication needed due to mutually exclusive passes
  RETURN { relationships-- allRelationships, metadata-- {...} }
END FUNCTION
```

### `RelationshipResolver._runIntraDirectoryPass`
```
TEST "_runIntraDirectoryPass should only return relationships BETWEEN files"
TEST "_runIntraDirectoryPass should identify exported POIs for the global pass"

ASYNC FUNCTION _runIntraDirectoryPass(directoryPath, poisByFile)
  // Generate a prompt with all POIs from the directory.
  // CRITICAL-- The prompt must explicitly ask for relationships where the source
  // and target POIs are in DIFFERENT files.
  interFilePrompt = GENERATE_INTER_FILE_PROMPT(poisByFile)
  interFileResponse = AWAIT this._queryLlmWithRetry(interFilePrompt, RelationshipListSchema)

  // Generate a second prompt to identify the "public API" of the directory
  exportsPrompt = GENERATE_EXPORTS_PROMPT(poisByFile)
  exportsResponse = AWAIT this._queryLlmWithRetry(exportsPrompt, PoiListSchema)

  RETURN {
    relationships-- interFileResponse.relationships,
    exports-- exportsResponse.pois
  }
END FUNCTION
```

### `RelationshipResolver._runGlobalPass`
```
TEST "_runGlobalPass should identify relationships between different directories using exported POIs"

ASYNC FUNCTION _runGlobalPass(allDirectoryExports)
  IF allDirectoryExports.size < 2 THEN
    RETURN []
  END IF

  // Generate a prompt using only the high-signal "exported" POIs from each directory.
  // This provides a grounded, concrete context for the LLM.
  globalPrompt = GENERATE_GLOBAL_PROMPT_FROM_EXPORTS(allDirectoryExports)

  response = AWAIT this._queryLlmWithRetry(globalPrompt, RelationshipListSchema)
  RETURN response.relationships
END FUNCTION