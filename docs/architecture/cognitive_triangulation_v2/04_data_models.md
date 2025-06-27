# Cognitive Triangulation v2 - Data Models (Revised)

This document defines the structure of the key data objects and database schemas used within the revised, resilient system. The core change is the move away from a monolithic manifest object towards decomposed, native data structures and a data-driven validation flow.

---

## 1. Redis Data Structures

The monolithic run manifest is replaced by a set of targeted, high-performance Redis data structures, scoped by `runId`.

### 1.1. Run Configuration
-   **Key--** `run:<runId>:config`
-   **Type--** `String (JSON)`
-   **Description--** Stores run-level configuration, such as the target path and analysis parameters.
-   **Example--** `{"rootPath": "/app/src", "ignorePatterns": ["node_modules"]}`

### 1.2. Job Sets
-   **Keys--**
    -   `run:<runId>:jobs:files`
    -   `run:<runId>:jobs:dirs`
    -   `run:<runId>:jobs:global`
-   **Type--** `Set`
-   **Description--** Collections of unique `jobId`s for each job type. This allows for efficient tracking of job categories.
-   **Example Command--** `SADD run:run123:jobs:files "job-1" "job-2"`

### 1.3. Relationship Definition Map
-   **Key--** `run:<runId>:rel_map`
-   **Type--** `Hash`
-   **Description--** Maps a `relationshipHash` to the number of evidence sources expected for validation. This is the authoritative source for reconciliation logic.
-   **Fields--**
    -   **Key--** `relationshipHash` (e.g., `c4a1b2...e3f4`)
    -   **Value--** `expectedEvidenceCount` (e.g., `2`)
-   **Example Command--** `HSETNX run:run123:rel_map "c4a1b2...e3f4" 2`

### 1.4. File Path to Job ID Map
-   **Key--** `run:<runId>:file_to_job_map`
-   **Type--** `Hash`
-   **Description--** A lookup table created by the `EntityScout` that maps a full file path to its assigned `jobId`. This is critical for workers to identify the `jobId` of related files they discover.
-   **Fields--**
    -   **Key--** File path (e.g., `/app/src/utils/helpers.js`)
    -   **Value--** `jobId` (e.g., `job-17`)
-   **Example Command--** `HSET run:run123:file_to_job_map "/app/src/utils/helpers.js" "job-17"`

### 1.5. Evidence Counter
-   **Key--** `evidence_count:<runId>:<relationshipHash>`
-   **Type--** `String` (used as an atomic counter)
-   **Description--** A distributed, atomic counter for tracking the number of evidence payloads received for a given relationship.
-   **Example Command--** `INCR evidence_count:run123:c4a1b2...e3f4`

---

## 2. Job Payloads (BullMQ)

### 2.1. `directory-analysis` & `file-analysis` Jobs
(Unchanged from original design)

### 2.2. `reconcile-relationship` Job **(New)**
-   **Description--** An idempotent job enqueued by a `ValidationWorker` when the evidence counter matches the expected count.
-   **Payload--**
    ```json
    {
      "runId"-- "unique-run-identifier-123",
      "relationshipHash"-- "c4a1b2...e3f4"
    }
    ```

### 2.3. `graph-builder` (Finalizer) Job
(Unchanged from original design)

---

## 3. SQLite Database Schema

The primary database holds the transactional outbox, persisted evidence payloads, and the final validated results.

### 3.1. `outbox` Table
-   **Description--** Used by the Transactional Outbox pattern. Each compute node runs a sidecar publisher that polls its own local SQLite DB file.
-   **Schema--** (Unchanged from original design)

### 3.2. `relationship_evidence` Table **(New)**
-   **Description--** Persists the full evidence payload from each `analysis-finding` event. This replaces the in-memory `pendingEvidence` map.
-   **Schema--**
    -   **`id`**-- `INTEGER PRIMARY KEY AUTOINCREMENT`
    -   **`run_id`**-- `TEXT NOT NULL`
    -   **`relationship_hash`**-- `TEXT NOT NULL`
    -   **`job_id`**-- `TEXT NOT NULL`
    -   **`evidence_payload`**-- `TEXT NOT NULL` (The full JSON `finding` object from the original `analysis-finding` event)
    -   **`created_at`**-- `DATETIME DEFAULT CURRENT_TIMESTAMP`
-   **Indexes--** A compound index on `(run_id, relationship_hash)` is critical for fast lookups by the reconciliation job.

### 3.3. `relationships` Table
-   **Description--** Stores the final, validated relationships.
-   **Schema--** (Unchanged from original design)

---

## 4. Neo4j Graph Model
(Unchanged from original design)