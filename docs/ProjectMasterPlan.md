# Project Plan: Universal Code Graph V4 (LLM-Only Architecture)

## 1. Project Overview & Mission

**Mission:** To create a scalable and deterministic pipeline that analyzes any software codebase and transforms it into a rich, queryable knowledge graph in Neo4j.

**Core Philosophy:** The entire analysis of code structure, entities, and relationships will be performed **exclusively by a Large Language Model (LLM)**. This system will not use any traditional Abstract Syntax Tree (AST) parsers or language-specific code parsers. The project's goal is to fully leverage the advanced semantic understanding of LLMs to build a comprehensive and accurate model of the code, treating the LLM as the single source of truth for all code intelligence.

This unwavering commitment to an LLM-only approach is the foundational principle of the project. We will address the challenges of model consistency through sophisticated prompt engineering, response validation, and a robust data contract, rather than diluting the architecture with non-LLM tools.

**Key Principles:**
- **LLM-Centric:** The LLM is the sole engine for code analysis.
- **Decoupling:** File discovery, code analysis, and graph ingestion are architecturally separate phases, communicating only through a central SQLite database.
- **Scalability:** The architecture is designed for parallel processing to handle large and complex codebases efficiently.
- **Resilience:** A dead-letter queue mechanism ensures that pipeline-blocking failures are isolated and handled gracefully.

## 2. System Architecture

The pipeline consists of three primary services (Agents) that coordinate their work through a central SQLite database. This database acts as a transactional message bus and a staging area for the structured data produced by the LLM.

**High-Level Data Flow:**
File System -> ScoutAgent -> [SQLite Database] -> WorkerAgent Pool -> [SQLite Database] -> GraphIngestorAgent -> Neo4j Graph

**Components:**

- **Database Layer:**
    - **SQLite:** A single file-based database (`code_graph_pipeline.db`) serves as the lightweight, transactional backbone. It manages the work queue and stores the structured LLM analysis results before their ingestion into the graph.
    - **Neo4j:** The final, persistent knowledge graph database, chosen for its power in storing and querying complex, interconnected data.

- **Pipeline Agents (Services):**
    - **ScoutAgent:** An intelligent file discovery agent that scans the target repository, filters files, identifies changes (new, modified, deleted, renamed), and populates the work queue.
    - **WorkerAgent:** A pool of concurrent workers that fetch tasks from the SQLite queue. The agent's sole responsibility is to manage the interaction with the LLM, sending it file content and storing the resulting structured JSON analysis back into SQLite. **The LLM performs all code analysis.**
    - **GraphIngestorAgent:** A dedicated service that reads the analysis results from SQLite in batches and deterministically builds or updates the final knowledge graph in Neo4j.

## 3. Detailed SQLite Database Schema

The SQLite database operates in Write-Ahead Logging (WAL) mode to allow for concurrent reads and writes.

**Tables:**

**1. `work_queue`**
-- Tracks all source code files that require analysis.
-- Column -- Data Type -- Constraints -- Description --
-- id -- TEXT -- PRIMARY KEY -- A UUIDv4 stored as text. --
-- file_path -- TEXT -- UNIQUE, NOT NULL -- The absolute, repository-relative path to the file. --
-- content_hash -- TEXT -- NOT NULL -- SHA-256 hash of the file's content. --
-- status -- TEXT -- NOT NULL -- Task status-- pending, processing, completed, failed. --
-- worker_id -- TEXT -- -- Identifier of the worker processing this task. --
-- last_updated -- TEXT -- NOT NULL -- ISO 8601 timestamp string. --

**2. `analysis_results`**
-- Stores the structured, self-contained JSON output from the WorkerAgent's LLM analysis.
-- Column -- Data Type -- Constraints -- Description --
-- id -- TEXT -- PRIMARY KEY -- A UUIDv4 stored as text. --
-- work_item_id -- TEXT -- FOREIGN KEY(work_queue.id) -- Links back to the original file task. --
-- file_path -- TEXT -- NOT NULL -- Denormalized file path for easy querying. --
-- llm_output -- TEXT -- NOT NULL -- The complete, structured JSON result from the LLM, stored as a string. --
-- status -- TEXT -- NOT NULL -- Ingestion status-- pending_ingestion, ingested, ingestion_failed. --
-- created_at -- TEXT -- NOT NULL -- ISO 8601 timestamp string. --

**3. `refactoring_tasks`**
-- Tracks file renames and deletions detected by the ScoutAgent.
-- Column -- Data Type -- Constraints -- Description --
-- id -- TEXT -- PRIMARY KEY -- A UUIDv4 stored as text. --
-- task_type -- TEXT -- NOT NULL -- RENAME or DELETE. --
-- old_path -- TEXT -- -- The original file path. Required for RENAME and DELETE. --
-- new_path -- TEXT -- -- The new file path. Required for RENAME. --
-- status -- TEXT -- NOT NULL -- pending, completed. --

**4. `failed_work`**
-- A dead-letter queue for tasks that fail repeatedly, preventing them from blocking the pipeline.
-- Column -- Data Type -- Constraints -- Description --
-- id -- TEXT -- PRIMARY KEY -- A UUIDv4 stored as text. --
-- work_item_id -- TEXT -- FOREIGN KEY(work_queue.id) -- The ID of the corresponding item in the work_queue. --
-- error_message -- TEXT -- NOT NULL -- The error message captured from the last failed attempt. --
-- last_attempted -- TEXT -- NOT NULL -- The ISO 8601 timestamp of the last attempt. --

## 4. The LLM Data Contract: `llm_output` JSON Structure

This JSON structure is the strict contract that enables deterministic ingestion. Every WorkerAgent's LLM call must produce output in this exact format.

**Core Concept: The Qualified Name (`qualifiedName`)**
A `qualifiedName` is a globally unique, human-readable identifier for any code entity (file, function, class, etc.).
- **Format:** `{file_path}--{entity_name}`
- **Example:** A function `createUser` in `src/api/users.js` has a `qualifiedName` of `src/api/users.js--createUser`.

**Example JSON Structure:**
```json
{
  "filePath": "src/services/auth.js",
  "entities": [
    {
      "type": "Function",
      "name": "loginUser",
      "qualifiedName": "src/services/auth.js--loginUser",
      "signature": "async function loginUser(email, password)",
      "isExported": true,
      "startLine": 15,
      "endLine": 30
    }
  ],
  "relationships": [
    {
      "source_qualifiedName": "src/services/auth.js",
      "target_qualifiedName": "src/utils/config.js--API_KEY",
      "type": "IMPORTS",
      "details": { "importedEntityName": "API_KEY" }
    }
  ]
}
```

## 5. Pipeline Phase Implementation

### Phase 1: ScoutAgent - File Discovery
The ScoutAgent scans the repository, compares file hashes against a saved state, and populates the `work_queue` with new/modified files and the `refactoring_tasks` table with deleted/renamed files.

### Phase 2: WorkerAgent - LLM Analysis
The WorkerAgent's logic is focused entirely on orchestrating the LLM interaction.
1.  **Atomically Claim Task:** Use an `UPDATE ... RETURNING` statement to claim a 'pending' job from the `work_queue`, preventing race conditions.
2.  **Read Source File:** Read the content of the file specified by the task's `file_path`.
3.  **Construct DeepSeek LLM Prompt:** Create a precise prompt instructing the LLM to act as an expert code analysis tool and return a single, valid JSON object matching the data contract. The prompt will include the full file content and its path.
4.  **Execute LLM Call:** Send the prompt to the LLM API. Implement robust error handling with exponential backoff for transient network issues.
5.  **Validate and Store Result:**
    - On success, parse the LLM response and validate that it is a valid JSON object matching the required structure.
    - Insert a new record into the `analysis_results` table, storing the stringified JSON in the `llm_output` column.
    - Update the original task's status in the `work_queue` to `completed`.
    - If validation fails after multiple retries, move the task to the `failed_work` table.

### Phase 3: GraphIngestorAgent - Neo4j Ingestion
This agent runs periodically as a batch job.
1.  **Acquire Batch:** Fetch all pending records from `analysis_results` and `refactoring_tasks`.
2.  **Run Neo4j Transaction:** Within a single transaction:
    - **Handle Refactoring:** Process all `DELETE` and `RENAME` tasks first.
    - **Pass 1 (Node UPSERT):** Iterate through all `llm_output` objects and `MERGE` all file and code entities based on their unique `qualifiedName`.
    - **Pass 2 (Relationship MERGE):** After all nodes are created, iterate through the `relationships` arrays and `MERGE` the connections between the nodes.
3.  **Finalize Batch:** If the Neo4j transaction succeeds, update the status of the processed records in the SQLite database. If it fails, the changes are rolled back, and the records will be re-processed in the next cycle.

## 6. Final Output: The Neo4j Knowledge Graph

The pipeline produces a graph with a clear, queryable schema:
- **Nodes:** `(:File)`, `(:Function)`, `(:Class)`, `(:Variable)` identified by `qualifiedName`.
- **Relationships:** `[:CONTAINS]`, `[:CALLS]`, `[:USES]`, `[:IMPORTS]`, `[:EXPORTS]`, `[:EXTENDS]`.