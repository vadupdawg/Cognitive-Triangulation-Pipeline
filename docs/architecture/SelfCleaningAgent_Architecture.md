# Architecture-- SelfCleaningAgent

## 1. Introduction

This document outlines the high-level architecture for the `SelfCleaningAgent`, a standalone service responsible for maintaining data integrity within the system's databases. The agent periodically scans for and removes records corresponding to files that have been deleted from the file system, ensuring that the SQLite and Neo4j databases remain synchronized with the project's state.

This revised architecture incorporates critical feedback from the Devil's Advocate report ([`docs/devil/critique_report_sprint_5_architecture.md`](docs/devil/critique_report_sprint_5_architecture.md)) to improve scalability and transactional integrity. It moves from a single-pass model to a more robust **two-phase, "mark and sweep"** process. This design is based on the specifications in [`docs/specifications/SelfCleaningAgent_specs.md`](docs/specifications/SelfCleaningAgent_specs.md) and the detailed logic defined in the [`docs/pseudocode/self_cleaning_agent/`](docs/pseudocode/self_cleaning_agent/) directory.

## 2. Architectural Approach

The `SelfCleaningAgent` is designed as a **scheduled, batch-processing service** that operates independently of the main application's real-time processing pipeline. The core of its new design is a two-phase transactional model that separates discovery from deletion.

-   **Standalone Operation**-- The agent is not part of a real-time request-response cycle. It runs as a separate, scheduled process.
-   **Two-Phase Transactional Model**-- To ensure data consistency and recoverability, the agent uses a "mark and sweep" approach--
    1.  **Mark Phase**-- A highly efficient reconciliation process identifies orphaned database records and atomically updates their status to `'PENDING_DELETION'`. This phase is designed to be fast and low-risk.
    2.  **Sweep Phase**-- A separate execution process retrieves all records marked for deletion and removes them from both Neo4j and SQLite in batches. This is the only phase that performs destructive operations.
-   **Scalable Reconciliation**-- The "Mark" phase uses a "file-system-first" approach. It performs a fast scan of the entire file system, retrieves all known paths from the database, and calculates the difference in memory. This avoids the massive I/O bottleneck of checking for each file's existence individually.
-   **Exclusive Batch Processing**-- All database operations (updates and deletions) are performed on batches of records to minimize transactions and improve performance. Single-record processing methods are explicitly excluded from this architecture.

## 3. Component Design

The agent's logic is encapsulated within the `SelfCleaningAgent` class.

### `SelfCleaningAgent` Class

-   **Description**-- A class that orchestrates the two-phase identification and deletion of stale file records from the databases.
-   **Properties**--
    -   `sqliteDb`-- An active connection client for the SQLite database.
    -   `neo4jDriver`-- An active driver instance for the Neo4j graph database.
    -   `projectRoot`-- The absolute path to the root directory of the project being scanned, used for file system traversal.
-   **Methods**--
    -   `constructor(sqliteDb, neo4jDriver, projectRoot)`-- Initializes the agent with database clients and the project's root path.
    -   `reconcile()`-- The main entry point for the **"Mark"** phase. It orchestrates the scalable, file-system-first check and updates the status of orphaned records to `'PENDING_DELETION'`.
    -   `run()`-- The main entry point for the **"Sweep"** phase. It queries for all files marked `'PENDING_DELETION'` and executes the batch cleanup operations against Neo4j and SQLite.
    -   `_findOrphanedDbRecords()`-- A private helper method that implements the core reconciliation logic-- it gets all paths from the disk and the database, performs a set difference, and returns the list of orphaned paths.
    -   `_cleanNeo4jBatch(filePaths)`-- A private method that executes a single, transactional query to delete a batch of `:File` nodes from Neo4j using `UNWIND`.
    -   `_cleanSqliteBatch(filePaths)`-- A private method that executes a single transaction to delete a batch of file records from SQLite.

## 4. Data Flow and Logic

The agent's logic is split into two distinct, independently executable phases to ensure safety and scalability.

### Phase 1-- Reconciliation (The "Mark" Phase)

1.  **Initiation**-- An external scheduler triggers the `reconcile()` method.
2.  **File System Scan**-- The method calls `_findOrphanedDbRecords()`, which first gets a complete list of all file paths currently on the file system using a fast traversal method (e.g., `glob`).
3.  **Database Scan**-- It then queries the SQLite database for a complete list of all file paths it currently tracks.
4.  **In-Memory Difference**-- The agent performs a set difference in memory to create a list of "orphans"—paths that exist in the database but not on the file system.
5.  **Mark for Deletion**-- The agent executes a single batch `UPDATE` query against the SQLite database, changing the `status` of all orphaned files to `'PENDING_DELETION'`. This is an atomic operation that concludes the "Mark" phase. No records are deleted at this stage.

### Phase 2-- Cleanup (The "Sweep" Phase)

1.  **Initiation**-- At a later time, an external scheduler triggers the `run()` method.
2.  **Discovery**-- The `run()` method queries the SQLite database for all files with the status `'PENDING_DELETION'`.
3.  **Batch Cleanup**--
    -   If files are found, the agent proceeds with the cleanup.
    -   It first calls `_cleanNeo4jBatch()`, passing the entire list of file paths. This removes all corresponding `:File` nodes and their relationships in a single transaction.
    -   **Only if the Neo4j cleanup is successful**, the agent calls `_cleanSqliteBatch()`, which removes the corresponding records from the `files` table in a single transaction.
4.  **Completion**-- If any part of the cleanup fails (e.g., the SQLite delete fails), the records remain in the `'PENDING_DELETION'` state. This provides a clear, recoverable state for the next run, preventing data loss or inconsistency.

### Mermaid Data Flow Diagram

```mermaid
graph TD
    subgraph Phase 1-- Mark (reconcile)
        A[Scheduler] -- Triggers --> B(reconcile)
        B -- 1. Scans filesystem --> C[File System (glob)]
        B -- 2. Scans database --> D[SQLite Database]
        B -- 3. Compares in-memory --> E{Find Orphans}
        E -- 4. List of Orphans --> F{Update Status}
        F -- 5. Batch UPDATE status to 'PENDING_DELETION' --> D
    end

    subgraph Phase 2-- Sweep (run)
        G[Scheduler] -- Triggers (later) --> H(run)
        H -- 6. SELECT files WHERE status = 'PENDING_DELETION' --> D
        H -- 7. If files exist --> I{_cleanNeo4jBatch}
        I -- 8. Deletes :File nodes --> J[Neo4j Database]
        I -- 9. On Success --> K{_cleanSqliteBatch}
        K -- 10. Deletes file records --> D
    end

    style B fill--#cce5ff,stroke--#333,stroke-width--2px
    style H fill--#f9f,stroke--#333,stroke-width--2px
```

## 5. Database Interaction

-   **Find Orphaned Records (`_findOrphanedDbRecords`)**--
    -   **File System**-- Uses a glob pattern (e.g., `**/*.*`) to get all file paths.
    -   **Database**-- `SELECT file_path FROM files`.
    -   **Marking**-- `UPDATE files SET status = 'PENDING_DELETION' WHERE file_path IN (?, ?, ...)`

-   **Find Files to Delete (`run`)**--
    -   **Query**-- `SELECT file_path FROM files WHERE status = 'PENDING_DELETION'`.

-   **Batch Delete (Neo4j)**--
    -   Uses a single, parameterized query with `UNWIND` for efficiency.
    -   **Query**-- `UNWIND $paths AS filePath MATCH (f:File {path: filePath}) DETACH DELETE f`

-   **Batch Delete (SQLite)**--
    -   The deletion occurs within a transaction for atomicity.
    -   **Query**-- `DELETE FROM files WHERE file_path IN (?, ?, ...)`
    -   Verification of `ON DELETE CASCADE` is deferred to dedicated integration tests rather than runtime checks to reduce overhead and simplify the agent's logic.

## 6. Scheduling Recommendations

The two phases, `reconcile()` and `run()`, should be scheduled independently to maximize safety and efficiency.

-   **`reconcile()` (Mark Phase)**-- This is a low-intensity, read-heavy operation. It can be run frequently (e.g., every 5-10 minutes) to ensure the system quickly identifies deleted files.
-   **`run()` (Sweep Phase)**-- This is a higher-intensity, write/delete operation. It should be run less frequently (e.g., once per hour or during off-peak hours) to perform the actual cleanup in a controlled manner.

## 7. Dependencies

-   **SQLite3 Driver**-- A Node.js client library to connect to the SQLite database.
-   **Neo4j Driver**-- A Node.js client library to connect to the Neo4j database.
-   **File System Traversal Library**-- A fast file-walking library like `glob` to implement the "file-system-first" scan.
-   **Scheduler**-- An external mechanism (e.g., cron, `setInterval`) to invoke the `reconcile()` and `run()` methods.