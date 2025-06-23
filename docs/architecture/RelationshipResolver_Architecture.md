# Architecture Document-- `RelationshipResolver` Agent

## 1. Overview

The `RelationshipResolver` agent is a sophisticated component responsible for deep semantic analysis of the codebase. It builds upon the initial POI data from the `EntityScout` to discover the complex web of relationships between them. Its architecture is fundamentally redesigned for scalability and resilience, moving away from a monolithic "global context" approach to a scalable, multi-pass hierarchical analysis.

## 2. Architectural Style

The agent employs a **Pipes and Filters** and **Component-Based** architecture. The three analysis passes (`Intra-File`, `Intra-Directory`, `Global`) act as filters, progressively refining and aggregating relationship data. The agent itself is a component that orchestrates this pipeline.

## 3. Component Breakdown

### 3.1. `RelationshipResolver` Class

The central orchestrator for the hierarchical relationship discovery process.

#### Class Diagram (Conceptual)

```
+------------------------------------+
--      RelationshipResolver          --
+------------------------------------+
-- - config-- RelationshipResolverConfig --
-- - llmClient-- LLMClient              --
+------------------------------------+
-- + constructor(config)                --
-- + async run()                      --
-- - async _loadAndGroupReports()     --
-- - async _runIntraFilePass()        --
-- - async _runIntraDirectoryPass()   --
-- - async _runGlobalPass()           --
-- - async _queryLlmWithRetry()       --
+------------------------------------+
```

#### Properties

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `config` -- `RelationshipResolverConfig` -- Configuration object, including the LLM model, relationship types to find, and input paths. --
-- `llmClient` -- `LLMClient` -- An abstraction for the LLM API used for all analysis passes. --

#### Methods

##### `constructor(config-- RelationshipResolverConfig)`
- **Visibility:** `public`
- **Description:** Initializes the agent, setting the configuration and instantiating the `llmClient`.

##### `async run()-- Promise<ProjectAnalysisSummary>`
- **Visibility:** `public`
- **Description:** The main entry point. It orchestrates the three-pass pipeline-- loading data, running intra-file, intra-directory, and global analyses, and returning the aggregated `ProjectAnalysisSummary`.

##### `private async _loadAndGroupReports()-- Promise<Map<string, FileAnalysisReport[]>>`
- **Visibility:** `private`
- **Description:** Reads all `FileAnalysisReport` objects from the specified input directory and groups them into a Map based on their parent directory path.

##### `private async _runIntraFilePass(report-- FileAnalysisReport)-- Promise<Relationship[]>`
- **Visibility:** `private`
- **Description:** **Pass 1.** Analyzes the POIs within a single file to find relationships entirely contained within that file.

##### `private async _runIntraDirectoryPass(directoryPath-- string, reports-- FileAnalysisReport[])-- Promise<DirectoryAnalysisSummary>`
- **Visibility:** `private`
- **Description:** **Pass 2.** Analyzes all POIs within a single directory to find relationships *between* files in that directory. It also generates a semantic summary of the directory's purpose.

##### `private async _runGlobalPass(dirSummaries-- DirectoryAnalysisSummary[])-- Promise<Relationship[]>`
- **Visibility:** `private`
- **Description:** **Pass 3.** The final pass. It analyzes the high-level summaries from each directory to find relationships that span across different directories.

##### `private async _queryLlmWithRetry(prompt-- string, schema-- object)-- Promise<any>`
- **Visibility:** `private`
- **Description:** A generic, resilient wrapper for all LLM queries. It incorporates the same sanitization, validation, and self-correction logic as `EntityScout` to ensure robust communication with the LLM.

### 3.2. `LLMResponseSanitizer` Utility
This is the same static utility module used by `EntityScout`, ensuring a consistent, resilient approach to handling LLM responses across the system.

## 4. Data Models

### 4.1. `Relationship`
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `sourcePoi` -- `UPID` -- The unique identifier of the source POI. --
-- `targetPoi` -- `UPID` -- The unique identifier of the target POI. --
-- `type` -- `string` -- The type of relationship (e.g., `CALLS`). --
-- `confidence` -- `number` -- LLM confidence score (0-1). --
-- `explanation` -- `string` -- LLM-generated rationale for the relationship. --

### 4.2. `DirectoryAnalysisSummary`
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `directoryPath` -- `string` -- The path to the analyzed directory. --
-- `relationships` -- `Relationship[]` -- Relationships found within this directory. --
-- `summary` -- `string` -- An LLM-generated summary of the directory's purpose. --

### 4.3. `ProjectAnalysisSummary`
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `relationships` -- `Relationship[]` -- A final, deduplicated array of all relationships found. --
-- `metadata` -- `object` -- Metadata about the analysis process. --

## 5. Interaction Diagram (Sequence for `run`)

```
[User] -> [RelationshipResolver.run()]
    |
    |-- 1. _loadAndGroupReports()
    |   <- Map<dir, reports>
    |
    |-- 2. Loop through each directory
    |   |
    |   |-- 2a. _runIntraFilePass(report) for each file
    |   |   <- intraFileRelationships
    |   |
    |   |-- 2b. _runIntraDirectoryPass(dir, reports)
    |   |   |
    |   |   |-- Uses _queryLlmWithRetry()
    |   |
    |   |   <- directorySummary
    |
    |-- 3. _runGlobalPass(all_directorySummaries)
    |   |
    |   |-- Uses _queryLlmWithRetry()
    |
    |   <- globalRelationships
    |
    |-- 4. Aggregate & Deduplicate all relationships
    |
    |-- 5. Create ProjectAnalysisSummary
    |
    <- return ProjectAnalysisSummary
```

## 6. Key Architectural Decisions

- **Hierarchical Analysis:** The move to a three-pass system is the most critical architectural decision. It solves the scalability problem of the original design by ensuring that the context for any single LLM call is kept to a manageable size.
- **Resilience as a Core Service:** Encapsulating the LLM interaction logic within a generic `_queryLlmWithRetry` method makes the entire agent robust. This pattern is shared with other agents, promoting code reuse and a consistent resilience strategy.
- **Stateful Aggregation:** The agent is stateful during its `run` execution, incrementally building the complete relationship map. The output of each pass (filter) serves as the input for the next, allowing for a progressive deepening of the analysis.