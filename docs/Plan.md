Project Plan: Universal Code Graph V3 (SQLite Edition)
1. Project Overview & Mission
Mission: To create a scalable and deterministic pipeline that analyzes any software codebase and transforms it into a rich, queryable knowledge graph in Neo4j.
Core Philosophy: The entire analysis of code structure, entities, and relationships will be performed exclusively by a Large Language Model (LLM), specifically DeepSeek. This system will not use any traditional Abstract Syntax Tree (AST) parsers or language-specific code parsers. The goal is to leverage the semantic understanding of LLMs to build a model of the code.

This commitment to an LLM-only approach is a core tenet of the project. We acknowledge the inherent non-determinism of current LLMs as a known research challenge. This project aims to address and mitigate this challenge through advanced prompt engineering, response validation, and other innovative strategies, rather than circumventing it by introducing non-LLM tools like AST parsers.
Key Principles:
Determinism: The process from analysis-to-graph must be 100% repeatable and accurate, with no guesswork or fuzzy matching.
Decoupling: The file discovery, code analysis, and graph ingestion phases are architecturally separate, communicating only through a central SQLite database.
Scalability: The architecture must support parallel processing to handle large codebases efficiently.
2. System Architecture
The pipeline is composed of three primary services (Agents) that coordinate their work through a central SQLite database file, which acts as a transactional message bus and staging area.
High-Level Data Flow:
File System -> ScoutAgent -> [SQLite Database] -> WorkerAgent Pool -> [SQLite Database] -> GraphIngestorAgent -> Neo4j Graph
Components:
Database Layer:
SQLite: A single file-based database (code_graph_pipeline.db) serving as the lightweight, transactional backbone for the pipeline. It will manage the work queue and store structured LLM analysis results before they are ingested into the graph.
Neo4j: The final, persistent knowledge graph database, chosen for its power in storing and querying complex, interconnected data.
Pipeline Agents (Services):
ScoutAgent: An intelligent file discovery agent that scans the target repository, filters out irrelevant files, identifies new/modified/renamed/deleted files, and populates the work queue.
WorkerAgent: A pool of concurrent workers that fetch tasks from the SQLite queue, send file contents to the DeepSeek LLM for analysis, and store the structured JSON results back into SQLite.
GraphIngestorAgent: A dedicated service that reads the analysis results from SQLite in batches and deterministically builds (or updates) the final knowledge graph in Neo4j.
3. Pipeline Configuration (.env)
The system will be configured via environment variables.
Generated env
# Application Environment
NODE_ENV=development

# AI Service Configuration
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# SQLite Database Configuration
# Path to the single SQLite database file for the pipeline
SQLITE_DB_PATH="./db/code_graph_pipeline.db"

# Neo4j Configuration
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="your_password"
NEO4J_DATABASE="neo4j"

# ScoutAgent State File
# JSON file to track file hashes for incremental scans
SCOUT_STATE_FILE="./db/scout_state.json"
Use code with caution.
Env
4. Detailed SQLite Database Schema
The SQLite database is the key to the pipeline's deterministic and decoupled nature. It will operate in Write-Ahead Logging (WAL) mode to allow for concurrent reads and writes, which is essential for our worker pool.
The database will contain four tables:
Tracks all source code files that require analysis.
Column Name	Data Type	Constraints	Description
id	TEXT	PRIMARY KEY	A UUIDv4 stored as text.
file_path	TEXT	UNIQUE, NOT NULL	The absolute, repository-relative path to the file.
content_hash	TEXT	NOT NULL	SHA-256 hash of the file's content.
status	TEXT	NOT NULL	Task status: pending, processing, completed, failed.
worker_id	TEXT		Identifier of the worker processing this task.
last_updated	TEXT	NOT NULL	ISO 8601 timestamp string.
Stores the structured, self-contained JSON output from the WorkerAgent's LLM analysis. This is the single source of truth for the GraphIngestorAgent.
Column Name	Data Type	Constraints	Description
id	TEXT	PRIMARY KEY	A UUIDv4 stored as text.
work_item_id	TEXT	FOREIGN KEY(work_queue.id)	Links back to the original file task.
file_path	TEXT	NOT NULL	Denormalized file path for easy querying.
llm_output	TEXT	NOT NULL	The complete, structured JSON result from the LLM, stored as a string.
status	TEXT	NOT NULL	Ingestion status: pending_ingestion, ingested, ingestion_failed.
created_at	TEXT	NOT NULL	ISO 8601 timestamp string.
Tracks file renames and deletions detected by the ScoutAgent.
Column Name	Data Type	Constraints	Description
id	TEXT	PRIMARY KEY	A UUIDv4 stored as text.
task_type	TEXT	NOT NULL	RENAME or DELETE.
old_path	TEXT		The original file path. Required for RENAME and DELETE.
new_path	TEXT		The new file path. Required for RENAME.
status	TEXT	NOT NULL	pending, completed.

Acts as a dead-letter queue for tasks that fail repeatedly, preventing them from blocking the pipeline.
Column Name	Data Type	Constraints	Description
id	TEXT	PRIMARY KEY	A UUIDv4 stored as text.
work_item_id	TEXT	FOREIGN KEY(work_queue.id)	The ID of the corresponding item in the work_queue.
error_message	TEXT	NOT NULL	The error message captured from the last failed attempt.
last_attempted	TEXT	NOT NULL	The ISO 8601 timestamp of the last attempt.
5. The LLM Data Contract: llm_output JSON Structure
This JSON structure is the strict contract that enables deterministic ingestion. Every WorkerAgent must produce output in this exact format.
Core Concept: The Qualified Name (qualifiedName)
A qualifiedName is a globally unique, human-readable identifier for any code entity (file, function, class, etc.).
Format: {file_path}--{entity_name}
For Files: The qualifiedName is simply its file_path.
Example: A function createUser in src/api/users.js has a qualifiedName of src/api/users.js--createUser.
Example JSON Structure:
Generated json
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
    },
    {
      "source_qualifiedName": "src/services/auth.js",
      "target_qualifiedName": "src/services/auth.js--loginUser",
      "type": "EXPORTS"
    }
  ]
}
Use code with caution.
Json
6. Pipeline Phase Implementation Plan
Trigger: Manual execution on a target code repository.
Logic:
Load Previous State: Load the previous_file_state map (filePath -> contentHash) from the SCOUT_STATE_FILE.
Intelligent Scan:
Perform a recursive scan of the repository, using the provided code's comprehensive exclusion patterns to ignore node_modules, test directories/files, build artifacts, etc.
Prioritize scanning directories like src, lib, services, agents.
For each discovered file that is not excluded:
a. Calculate its SHA-256 content_hash.
b. Store it in a current_file_state map (filePath -> contentHash).
Analyze Changes:
New/Modified: Iterate through current_file_state. If a file path is not in previous_file_state or its hash has changed, add { path, hash } to a files_to_process list.
Deleted: Iterate through previous_file_state. If a file path is not in current_file_state, add its path to a deleted_files list.
Renamed (Advanced): Check for files in files_to_process (as new files) whose hash matches a file in deleted_files. This indicates a rename.
Note: This hash-based rename detection is limited to simple file renames and cannot handle more complex refactoring like moving functions between files. Advanced refactoring detection is a potential future enhancement.
For each rename, create a RENAME task in the refactoring_tasks table.
Remove the corresponding files from files_to_process and deleted_files.
Populate Queues:
For remaining files_to_process, insert them into the work_queue table with status = 'pending'.
For remaining deleted_files, create a DELETE task in the refactoring_tasks table.
Save Current State: Write the current_file_state map to the SCOUT_STATE_FILE, overwriting the old one.
Agent: WorkerAgent (deployed as a pool of concurrent instances).
Rethinking Worker Data Handling in SQLite:
Since SQLite doesn't have SKIP LOCKED, we will use an atomic UPDATE ... RETURNING statement to claim jobs. This prevents race conditions.
Logic (per worker):
Atomically Claim Task:
Execute a single, atomic query to claim a job:
Generated sql
UPDATE work_queue
SET status = 'processing', worker_id = ?, last_updated = ?
WHERE id = (
    SELECT id FROM work_queue WHERE status = 'pending' LIMIT 1
)
RETURNING id, file_path;
Use code with caution.
SQL
If this query returns a row, the worker has successfully claimed a job. If not, it sleeps for a short interval and retries.
Read Source File: Read the content of the single file specified by the file_path. Crucially, do not read the contents of any imported files. The analysis is confined to the text of one file at a time.
Construct DeepSeek LLM Prompt: Create a precise prompt instructing the LLM to return the JSON structure defined above.
System Prompt: "You are an expert code analysis tool. Your task is to analyze the provided source code file and produce a JSON object describing all its entities (functions, classes, variables) and their relationships (calls, uses, imports, exports). Follow these rules meticulously: 1. Use the provided filePath to construct a qualifiedName for every entity using the format {filePath}--{entityName}. 2. For IMPORTS, the target_qualifiedName must be constructed from the resolved path of the import and the name of the imported entity. 3. Your entire output must be a single, valid JSON object following the specified schema. Do not include any other text, explanations, or markdown fences."
User Prompt: Analyze the following code from the file "{file_path}". Produce the required JSON output. \n\n{file_content}
Execute LLM Call: Send the prompt to the DeepSeek API. Implement robust error handling with exponential backoff and retries.
Validate and Store Result:
Upon receiving the LLM response, parse it. Validate that it is a valid JSON object matching the required structure. If not, retry the LLM call.
**Canonicalize LLM Output:** Before storing the `llm_output` JSON, the `WorkerAgent` must perform a canonicalization step (e.g., sorting object keys alphabetically, sorting array elements) to ensure that structurally identical but differently formatted JSON outputs produce the same stored string. This helps mitigate issues arising from minor, non-semantic changes in the LLM's output format.
On success, INSERT a new record into the analysis_results table, storing the canonicalized, stringified JSON in the `llm_output` column and setting status = 'pending_ingestion'.
UPDATE the original task's status in the work_queue to completed.
Agent: GraphIngestorAgent.
Trigger: Runs as a periodic batch job (e.g., every 10 seconds).
Logic:
Acquire Batch:
Fetch a batch of records from analysis_results where status = 'pending_ingestion'.
Fetch all pending tasks from refactoring_tasks.
Run Neo4j Transaction: Execute the following steps within a single large Neo4j transaction for the entire batch.
Step A: Handle Refactoring (Deletes/Renames)
For each DELETE task, run: MATCH (n {filePath: $old_path}) DETACH DELETE n.
For each RENAME task, run: MATCH (n {filePath: $old_path}) SET n.filePath = $new_path, n.qualifiedName = replace(n.qualifiedName, $old_path, $new_path).
Step B: Pass 1 - Node Creation (UPSERT all entities)
Iterate through the llm_output (after parsing the JSON string) of every analysis record.
For each record, first MERGE the :File node: MERGE (f:File {qualifiedName: $filePath}) ON CREATE SET f.path = $filePath.
Next, iterate through the entities array. For each entity, execute a MERGE query based on its unique qualifiedName: MERGE (n:{entity.type} {qualifiedName: $entity.qualifiedName}) ON CREATE SET n.name = $entity.name, n.filePath = $filePath ....
Step C: Pass 2 - Relationship Creation
After Pass 1 is complete, iterate through the relationships array in each llm_output.
For each relationship, execute a MATCH-MATCH-MERGE query:
Generated cypher
MATCH (source {qualifiedName: $rel.source_qualifiedName})
MATCH (target {qualifiedName: $rel.target_qualifiedName})
MERGE (source)-[r:{rel.type}]->(target)
Use code with caution.
Cypher
Finalize Batch:
If the Neo4j transaction succeeds, update the status of the processed records in analysis_results and refactoring_tasks to ingested and completed respectively in the SQLite database.
If the transaction fails, the changes are rolled back, and the records will be picked up in the next batch.
7. Final Output: The Neo4j Knowledge Graph
The pipeline produces a graph with a clear, queryable schema:
Nodes: (:File), (:Function), (:Class), (:Variable) all identified by their qualifiedName.
Relationships: [:CONTAINS], [:CALLS], [:USES], [:IMPORTS], [:EXPORTS], [:EXTENDS].


NODE_ENV=test
REDIS_ENABLED=true


# AI Service Configuration
# Replace with your actual DeepSeek API key for local development
DEEPSEEK_API_KEY=sk-20ad1e6e201a4164866da80b330aef31

# Database Configuration
# Individual database parameters for test environment
DB_HOST=localhost
DB_PORT=5432
DB_NAME=testdb
DB_USER=testuser
DB_PASSWORD=testpassword

# Redis Configuration
# Default local Redis connection
REDIS_URL="redis://localhost:6379"

# Neo4j Configuration
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="test1234"
NEO4J_DATABASE="backend"