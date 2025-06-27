# Cognitive Triangulation v2 - Component Breakdown (Revised)

This document provides a detailed description of each service and worker within the revised Cognitive Triangulation v2 system.

---

## 1. EntityScout

-   **Purpose--** To initialize an analysis run by scanning the target directory, creating all necessary jobs, and generating the initial, decomposed manifest in Redis.

### Key Responsibilities (Revised)--

-   **Filesystem Scan--** Recursively scans a root path to identify all files and directories.
-   **Job & Manifest Creation--**
    -   Assigns a unique `jobId` to each file and directory.
    -   Populates Redis `Set`s with these job IDs (e.g., `run:<runId>:jobs:files`).
    -   **Crucially, it creates the `file_to_job_map` Redis Hash**, mapping every discovered file path to its corresponding `jobId`. This map is essential for downstream workers.
-   **Initial Enqueue--** Adds the first set of jobs to the message queue to start the pipeline.

---

## 2. Analysis Workers

These stateless workers form the core of the parallel analysis engine.

### 2.1. FileAnalysisWorker

-   **Purpose--** To analyze a single file for entities and their potential relationships.

#### Key Responsibilities (Revised)--

-   **LLM-based Analysis--** Uses an LLM to identify POIs and potential relationships.
-   **Job ID Resolution--** When a relationship to an entity in another file is found, it queries the `run:<runId>:file_to_job_map` in Redis to get the `jobId` for the target file.
-   **Dynamic Manifest Update--** It calculates a `relationshipHash` and uses `HSETNX` on the `run:<runId>:rel_map` Redis Hash to set the `expectedEvidenceCount`.
-   **Event Emission--** Writes a full `analysis-finding` event into its **local `outbox` table** in a node-specific SQLite database.

### 2.2. DirectoryResolutionWorker

-   **Purpose--** To analyze a directory's contents and enqueue child jobs.
-   **Responsibilities--** Similar to the `FileAnalysisWorker`, it can find directory-level relationships, update the manifest, and write to the local outbox.

---

## 3. TransactionalOutboxPublisher (Sidecar Model)

-   **Purpose--** To ensure reliable event delivery from workers to the message queue.

### Key Responsibilities (Revised)--

-   **Sidecar Deployment--** This service runs as a **sidecar process** on each compute node that hosts workers.
-   **Local Polling--** It periodically queries the `outbox` table in the **local SQLite database file** on its node. It does not communicate across the network to other databases.
-   **Publishing & Atomic Update--** Publishes events to BullMQ and updates the local event status to `PUBLISHED` only upon success.

---

## 4. Validation & Reconciliation Workers (New)

The stateful `ValidationCoordinator` is replaced by two distinct, stateless worker types.

### 4.1. ValidationWorker

-   **Purpose--** A stateless, horizontally scalable worker that acts as the first receiver for analysis findings.

#### Key Responsibilities--

-   **Event Consumption--** Consumes `analysis-finding` events from the queue.
-   **Evidence Persistence--** Saves the entire `finding` payload into the central `relationship_evidence` table in the primary SQLite database.
-   **Atomic Counting--** Performs an atomic `INCR` on the corresponding Redis key (`evidence_count:<runId>:<relationshipHash>`).
-   **Reconciliation Trigger--** After incrementing, it fetches the `expectedEvidenceCount` from the `run:<runId>:rel_map` Redis Hash. If the count matches, it enqueues a new, idempotent `reconcile-relationship` job.

### 4.2. ReconciliationWorker

-   **Purpose--** A stateless worker that performs the final validation logic when all evidence is ready.

#### Key Responsibilities--

-   **Job Consumption--** Processes `reconcile-relationship` jobs.
-   **Evidence Aggregation--** Queries the primary SQLite `relationship_evidence` table to fetch all persisted evidence payloads for the given `relationshipHash`.
-   **Confidence Scoring--** Uses the `ConfidenceScoringService` to calculate a final score based on all aggregated evidence.
-   **Persistent Storage--** If the score is sufficient, it writes the final `VALIDATED` record to the `relationships` table in the primary SQLite database.

---

## 5. ConfidenceScoringService

-   **Purpose--** A stateless utility service used by the `ReconciliationWorker`.
-   **Responsibilities--** (Unchanged from original design)

---

## 6. GraphBuilderWorker

-   **Purpose--** The final worker, responsible for constructing the Neo4j knowledge graph.
-   **Responsibilities--** (Unchanged from original design)