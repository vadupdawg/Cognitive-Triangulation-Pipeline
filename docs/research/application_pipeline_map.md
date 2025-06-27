# Application Pipeline Map

## 1. Executive Summary

This document provides a detailed, step-by-step map of the application's cognitive triangulation pipeline. The system is an event-driven, agent-based architecture designed to analyze a codebase, identify key entities and their relationships, and build a knowledge graph representing the code's structure. The pipeline is initiated, runs through multiple stages of analysis and validation, and culminates in the persistence of the final graph to a Neo4j database. The entire process is managed via a job queue system (BullMQ) and is designed for scalability and resilience.

## 2. Pipeline Initiation

The application can be initiated in two ways:

1.  **Command-Line Interface (`src/main.js`):** The primary method for running the entire pipeline end-to-end. It instantiates the `CognitiveTriangulationPipeline` class, which orchestrates the entire process from database initialization to final reporting.
2.  **API and WebSocket Server (`src/utils/pipelineApi.js`):** An Express.js server provides RESTful endpoints to start, stop, and monitor pipeline runs remotely. A WebSocket server provides real-time progress updates to connected clients.

The initiation process, regardless of the entry point, triggers the first agent in the pipeline:

*   **`EntityScout` (`src/agents/EntityScout.js`):**
    *   Scans the target directory recursively.
    *   Creates two types of jobs and adds them to the BullMQ queues:
        *   `analyze-file` jobs for each discovered file.
        *   `analyze-directory` jobs for each discovered directory.
    *   Records a manifest of the run in Redis for tracking.

## 3. Core Analysis Pipeline (Job-Based)

Once jobs are enqueued, a series of workers, each running in its own process space (conceptually), consumes them.

### Stage 1: File-Level POI Analysis

*   **Worker:** `FileAnalysisWorker` (`src/workers/fileAnalysisWorker.js`)
*   **Input:** Consumes `analyze-file` jobs from the `file-analysis-queue`.
*   **Process:**
    1.  Reads the content of the specified file.
    2.  Constructs a prompt asking an LLM (Deepseek) to identify "Points of Interest" (POIs), such as class/function definitions, imports, and variables.
    3.  Parses the LLM's JSON response.
    4.  Writes the findings into the `outbox` table in the SQLite database as a `file-analysis-finding` event. This uses the transactional outbox pattern to ensure data is not lost.

### Stage 2: Directory-Level Summary

*   **Worker:** `DirectoryResolutionWorker` (`src/workers/directoryResolutionWorker.js`)
*   **Input:** Consumes `analyze-directory` jobs from the `directory-resolution-queue`.
*   **Process:**
    1.  Reads the content of all files within the specified directory.
    2.  Constructs a prompt asking the LLM to provide a summary of the directory's purpose based on its contents.
    3.  Writes the summary into the `outbox` table as a `directory-analysis-finding` event.

### Stage 3: Relationship Analysis (Intra-File)

*   **Publisher:** `TransactionalOutboxPublisher` (`src/services/TransactionalOutboxPublisher.js`) polls the `outbox` table. When it finds a `file-analysis-finding` event, it places a new job on the `relationship-resolution-queue`.
*   **Worker:** `RelationshipResolutionWorker` (`src/workers/relationshipResolutionWorker.js`)
*   **Input:** Consumes jobs from the `relationship-resolution-queue`.
*   **Process:**
    1.  Takes the POIs identified by the `FileAnalysisWorker`.
    2.  Constructs a new prompt asking the LLM to identify relationships *between* the POIs within that single file.
    3.  Writes the findings to the `outbox` table as a `relationship-analysis-finding` event.

## 4. Validation, Reconciliation, and Final Persistence

The final stages of the pipeline are focused on validating the LLM's findings and building the final, trusted knowledge graph.

### Stage 4: Evidence Aggregation and Validation

*   **Publisher:** `TransactionalOutboxPublisher` polls the `outbox` table. It routes different findings to the `analysis-findings-queue`.
*   **Worker:** `ValidationWorker` (`src/workers/ValidationWorker.js`)
*   **Input:** Consumes jobs from the `analysis-findings-queue`.
*   **Process:**
    1.  Persists the "evidence" (the findings from a specific worker) for a given relationship into the `relationship_evidence` table.
    2.  Atomically increments a counter for that relationship in Redis.
    3.  If the evidence count matches the expected number of analysis passes, it enqueues a `reconcile-relationship` job.

### Stage 5: Reconciliation and Scoring

*   **Worker:** `ReconciliationWorker` (`src/workers/ReconciliationWorker.js`)
*   **Input:** Consumes `reconcile-relationship` jobs from the `reconciliation-queue`.
*   **Process:**
    1.  Fetches all evidence for a given relationship from the database.
    2.  Uses the `ConfidenceScoringService` to calculate a final confidence score. The score is higher if multiple analysis passes agree.
    3.  If the score exceeds a threshold, it writes the final, `VALIDATED` relationship to the `relationships` table in SQLite.

### Stage 6: Graph Building

*   **Trigger:** After all other jobs for a run are complete, the main pipeline process (`src/main.js`) directly invokes the `GraphBuilder`.
*   **Agent:** `GraphBuilder` (`src/agents/GraphBuilder.js`)
*   **Input:** Reads all `VALIDATED` relationships from the SQLite `relationships` table.
*   **Process:**
    1.  Batches the relationships.
    2.  Executes a Cypher query (`MERGE`) against the Neo4j database to create nodes for each POI and the relationships between them. It uses `apoc.create.relationship` to handle dynamic relationship types.

## 5. External Dependencies

This list identifies all external systems, libraries, and services required for the application to run, supporting a "no mocking" E2E testing strategy.

### Infrastructure & Data Stores

*   **Node.js:** The core runtime environment.
*   **Redis:** Used as the backend for the BullMQ message queue and for caching run-specific data (e.g., job manifests, evidence counters).
    *   **Library:** `ioredis`
*   **SQLite:** The primary relational data store for persisting analysis results, evidence, and the transactional outbox.
    *   **Library:** `better-sqlite3`
*   **Neo4j:** The graph database used to store the final, traversable knowledge graph of the codebase. It requires the APOC (Awesome Procedures on Cypher) library for certain operations.
    *   **Library:** `neo4j-driver`

### External Services

*   **Deepseek AI:** The Large Language Model (LLM) provider used for all code analysis prompts. Requires a valid API key.
    *   **Library:** `axios` (used by the `deepseekClient`)

### Core NPM Libraries

*   **`bullmq`:** Manages all job queues and workers.
*   **`express`:** Powers the optional API and WebSocket server.
*   **`winston`:** Used for structured logging.
*   **`uuid`:** Generates unique IDs for runs, jobs, and entities.
*   **`ajv`:** Used for JSON schema validation (not explicitly seen in the core pipeline flow but present in `package.json`).
*   **`dotenv`:** Manages environment variables.