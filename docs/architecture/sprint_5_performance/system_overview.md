# System Architecture-- Revised Job-Queue Analysis Engine

**Sprint:** 5 - Performance (Revision 1)
**Status:** In Design

## 1. System Context (C1)

This document outlines the revised architecture for the high-performance code analysis engine, updated based on architectural critique. The system uses a hierarchical, multi-stage analysis process to enhance scalability and resilience, moving away from a single "fan-in" bottleneck.

The primary components are--
-   **EntityScout (Producer):** Discovers files and creates analysis jobs, now with a hierarchical dependency structure.
-   **File Analysis Worker:** Performs intra-file analysis. **Designed for horizontal, process-based scaling.**
-   **Directory Resolution Worker:** (New) A stage-1 worker that finds relationships *within* a single directory.
-   **Global Resolution Worker:** (New) A stage-2 worker that finds relationships *between* directory-level summaries.
-   **Queue Manager:** A central utility for managing queues, workers, and a robust Dead-Letter Queue (DLQ) strategy.
-   **Redis (BullMQ Backend):** The message broker and queue backing store.
-   **Database (SQLite/Neo4j):** The persistence layer for analysis results.

---

## 2. Container Diagram (C2)

```mermaid
graph TD
    subgraph "Analysis System"
        EntityScout(EntityScout Producer)
        FileAnalysisWorker(File Analysis Worker)
        DirectoryResolutionWorker(Directory Resolution Worker)
        GlobalResolutionWorker(Global Resolution Worker)
    end

    subgraph "Infrastructure"
        Redis(Redis -- BullMQ)
        Database[(Database -- SQLite/Neo4j)]
        DLQ_Monitoring(DLQ Monitoring & Alerting)
    end

    EntityScout -- "1. Creates 'analyze-file' & parent jobs" --> Redis
    FileAnalysisWorker -- "2. Consumes 'analyze-file' jobs" --> Redis
    FileAnalysisWorker -- "3. Saves POIs" --> Database
    
    DirectoryResolutionWorker -- "4. Consumes 'resolve-directory' jobs" --> Redis
    DirectoryResolutionWorker -- "5. Saves intra-directory relationships" --> Database

    GlobalResolutionWorker -- "6. Consumes 'resolve-global' job" --> Redis
    GlobalResolutionWorker -- "7. Saves inter-directory relationships" --> Database
    
    QueueManager -- "Manages queues & workers"
    QueueManager -- "Handles failed jobs" --> DLQ_Monitoring
```

## 3. High-Level Data Flow (Revised)

1.  **Initiation:** The `EntityScout` agent is triggered. It scans the target directory.
2.  **Hierarchical Job Creation:**
    -   `EntityScout` creates a single `resolve-global-relationships` parent job for the entire run.
    -   For each subdirectory, it creates a `resolve-directory-relationships` parent job.
    -   For each file, it creates an `analyze-file` child job.
    -   Dependencies are set-- `analyze-file` jobs are children of their directory's job, and all directory jobs are children of the global job.
3.  **File Analysis (Fan-out):** `FileAnalysisWorker` instances process `analyze-file` jobs.
4.  **Intra-Directory Resolution (Stage 1 Fan-in):** Once all files in a directory are processed, the corresponding `resolve-directory-relationships` job is released. A `DirectoryResolutionWorker` consumes it, loads only the POIs for that directory, finds internal relationships, and saves a summary.
5.  **Global Resolution (Stage 2 Fan-in):** Once all directory-level jobs are complete, the final `resolve-global-relationships` job is released. A `GlobalResolutionWorker` consumes it, loads the *summaries* from the previous stage, and identifies the final cross-directory relationships.
6.  **Final Persistence:** The final relationships are saved, completing the analysis.

## 4. Key Architectural Changes

-   **Hierarchical Resolution:** Replaced the single `RelationshipResolutionWorker` with a two-stage process (`DirectoryResolutionWorker`, `GlobalResolutionWorker`) to eliminate the central bottleneck.
-   **Process-Based Scaling:** Workers are designed to be scaled horizontally by adding more processes/containers, not by adjusting internal concurrency settings.
-   **Robust DLQ:** The `QueueManager` now includes a defined strategy for structured logging, alerting, and reprocessing of failed jobs.
-   **Context Budgeting:** All LLM-facing workers incorporate a "context budget" to chunk large analysis tasks, managing cost and avoiding API limits.

## 5. Navigation

-   [Component-- Queue Manager](./queue_manager.md)
-   [Component-- EntityScout Producer](./entity_scout_producer.md)
-   [Component-- File Analysis Worker](./file_analysis_worker.md)
-   [Component-- Directory Resolution Worker](./directory_resolution_worker.md)
-   [Component-- Global Resolution Worker](./global_resolution_worker.md)
-   [Data Flow and Job Lifecycle](./data_flow_and_job_lifecycle.md)
-   [Architectural Decision Record](./adr.md)