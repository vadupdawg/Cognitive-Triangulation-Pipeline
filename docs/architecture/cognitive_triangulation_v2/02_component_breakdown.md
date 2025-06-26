# Cognitive Triangulation v2 -- Component Breakdown (Revised)

This document provides a detailed description of each component in the revised Cognitive Triangulation v2 system, outlining their responsibilities, interactions, and how they fit into the overall module structure.

## 1. Orchestration & Coordination Layer

This layer is responsible for initiating, managing, and finalizing the analysis run.

### 1.1. `EntityScout` Agent

-   **Module--** `src/agents/EntityScout_v2.js`
-   **Responsibilities--**
    -   Acts as the primary entry point for a new analysis run.
    -   Performs a fast, shallow "first-pass" analysis (e.g., using regex) to generate a **candidate list of potential relationships**.
    -   Constructs the `runManifest`, which includes the `jobGraph` and the `relationshipEvidenceMap` populated with the candidate relationships. This makes the manifest a complete, upfront contract.
    -   Saves the complete `runManifest` to the Redis cache.
    -   Enqueues all analysis jobs in a **paused** state.
    -   Creates a final `GraphBuilderWorker` job that has a **job dependency** on all other analysis jobs.
    -   **Resumes** the queues only after the manifest is successfully saved and all jobs are created.
-   **Key Interactions--**
    -   Writes to **Redis** to store the `runManifest`.
    -   Writes to **BullMQ** to enqueue all analysis jobs and the finalizer job.

### 1.2. `ValidationWorker`

-   **Module--** `src/workers/ValidationWorker.js`
-   **Replaces--** `ValidationCoordinator` Agent
-   **Responsibilities--**
    -   A horizontally scalable, stateless worker that orchestrates the validation process.
    -   Consumes `*-analysis-completed` events from the BullMQ event stream.
    -   For each finding, it atomically increments a counter in Redis (`evidence_count:{runId}:{hash}`).
    -   It compares this counter against the expected count from the `runManifest`.
    -   If the count matches, it enqueues a `reconcile-relationship` job for itself.
    -   The `reconcile-relationship` job fetches the full evidence payloads from the **SQLite** `relationship_evidence` table.
    -   It calls the `ConfidenceScoringService` to compute the final score.
    -   Persists the final, validated relationship data (with status `VALIDATED` or `CONFLICT`) to the main `relationships` table in SQLite.
-   **Key Interactions--**
    -   Consumes events from **BullMQ**.
    -   Reads from and writes to **Redis** for manifest data and atomic counters.
    -   Reads from and writes to **SQLite** to get evidence and store validated data.
    -   Calls the **`ConfidenceScoringService`**.

## 2. Analysis Worker Layer

These are stateless, scalable workers that perform the core analysis tasks. They consume jobs from BullMQ and write their findings to the database, creating an outbox event within the same transaction.

### 2.1. `FileAnalysisWorker`

-   **Module--** `src/workers/FileAnalysisWorker_v2.js`
-   **Responsibilities--**
    -   Processes a single file.
    -   Calls an LLM to identify POIs and relationships.
    -   **Atomic Operation--** In a single database transaction, it--
        1.  Writes the full evidence payload to the `relationship_evidence` table in SQLite with a `PENDING` status.
        2.  Writes a corresponding `file-analysis-completed` event to the `outbox` table.
-   **Key Interactions--**
    -   Consumes jobs from **BullMQ**.
    -   Writes to the **SQLite** database (`relationship_evidence` and `outbox` tables).
    -   Calls the **`HashingService`** and **`ConfidenceScoringService`**.

### 2.2. `DirectoryResolutionWorker`

-   **Module--** `src/workers/DirectoryResolutionWorker_v2.js`
-   **Responsibilities--**
    -   Processes a single directory.
    -   Provides an opinion on all candidate relationships involving its constituent files.
    -   **Atomic Operation--** In a single database transaction, it writes its evidence and an `outbox` event.
-   **Key Interactions--**
    -   Consumes jobs from **BullMQ**.
    -   Reads POI data from **SQLite**.
    -   Writes to the **SQLite** database (`relationship_evidence` and `outbox` tables).
    -   Calls the **`ConfidenceScoringService`**.

### 2.3. `GlobalResolutionWorker`

-   **Module--** `src/workers/GlobalResolutionWorker_v2.js`
-   **Responsibilities--**
    -   Processes the entire codebase to find broad, architectural relationships.
    -   **Atomic Operation--** In a single database transaction, it writes its evidence and an `outbox` event.
-   **Key Interactions--**
    -   Consumes jobs from **BullMQ**.
    -   Reads from **SQLite**.
    -   Writes to the **SQLite** database (`relationship_evidence` and `outbox` tables).
    -   Calls the **`ConfidenceScoringService`**.

## 3. Core Services & Persistence

### 3.1. `TransactionalOutboxPublisher`

-   **Module--** `src/services/OutboxPublisher.js`
-   **Responsibilities--**
    -   A simple, highly reliable, standalone process.
    -   Polls the `outbox` table in SQLite for unprocessed events.
    -   Publishes the event to the appropriate BullMQ stream.
    -   Marks the event as processed in the `outbox` table.
-   **Key Interactions--**
    -   Reads from **SQLite**.
    -   Publishes events to **BullMQ**.

### 3.2. `GraphBuilderWorker`

-   **Module--** `src/workers/GraphBuilderWorker.js`
-   **Replaces--** `GraphBuilder` Agent
-   **Responsibilities--**
    -   Processes a single job that is triggered by BullMQ's dependency mechanism only after all analysis jobs for a run have succeeded.
    -   Reads all data with a `VALIDATED` status from the SQLite database.
    -   Connects to the **Neo4j** database and persists the final knowledge graph.
-   **Key Interactions--**
    -   Consumes its finalizer job from **BullMQ**.
    -   Reads from **SQLite**.
    -   Writes to **Neo4j**.

### 3.3. Other Services

-   **`ConfidenceScoringService`--** Unchanged. Provides stateless score calculation logic.
-   **`HashingService`--** Unchanged. Provides deterministic hash generation for relationships.