# Cognitive Triangulation v2 -- Proposed Directory Structure (Revised)

This document outlines the revised directory structure for the new and modified components of the Cognitive Triangulation v2 feature. The structure is updated to reflect the refactoring of agents into scalable workers and the introduction of new services for resilience.

## 1. Top-Level `src/` Directory Structure (Revised)

The structure emphasizes a clear separation between stateful agents, stateless workers, and reusable services.

```
src/
|-- agents/
|   |-- EntityScout_v2.js
|   |-- (Other existing agents...)
|
|-- workers/
|   |-- FileAnalysisWorker_v2.js
|   |-- DirectoryResolutionWorker_v2.js
|   |-- GlobalResolutionWorker_v2.js
|   |-- ValidationWorker.js
|   |-- GraphBuilderWorker.js
|   |-- (Other existing workers...)
|
|-- services/
|   |-- ConfidenceScoringService.js
|   |-- HashingService.js
|   |-- OutboxPublisher.js
|   |-- LlmClient.js
|
|-- utils/
|   |-- queueManager.js
|   |-- sqliteDb.js
|   |-- neo4jDriver.js
|   |-- logger.js
|   |-- (Other utilities...)
|
|-- config.js
|-- main.js
```

## 2. Rationale for Key Directories (Revised)

### `src/agents/`

-   **Purpose--** Contains stateful, long-running processes that orchestrate major parts of the workflow. This directory is now smaller, as orchestration logic has been shifted to scalable workers where possible.
-   **Contents--**
    -   `EntityScout_v2.js`: The primary agent responsible for initiating a run, creating the manifest, and setting up the job dependency graph.

### `src/workers/`

-   **Purpose--** Contains stateless, ephemeral workers that process individual, discrete jobs from the BullMQ queues. This is now the primary location for the system's business logic.
-   **Contents--**
    -   `FileAnalysisWorker_v2.js`, `DirectoryResolutionWorker_v2.js`, `GlobalResolutionWorker_v2.js`: The core analysis workers.
    -   `ValidationWorker.js`: The new, scalable worker that replaces the `ValidationCoordinator` agent and manages evidence tracking and reconciliation.
    -   `GraphBuilderWorker.js`: The new worker that replaces the `GraphBuilder` agent and is triggered by job dependencies to build the final graph.

### `src/services/`

-   **Purpose--** Houses shared, stateless, and reusable business logic and background processes.
-   **Contents--**
    -   `ConfidenceScoringService.js` & `HashingService.js`: Unchanged.
    -   `OutboxPublisher.js`: The new, critical service that implements the transactional outbox pattern, ensuring reliable event delivery from the database to the message queue.
    -   `LlmClient.js`: An abstraction for communicating with the LLM.

### `src/utils/`

-   **Purpose--** Unchanged. Contains common, application-agnostic utilities and infrastructure clients.

## 3. Naming Conventions

-   **Worker-centric--** The new structure reflects a shift towards a worker-centric model. Components that were previously stateful agents (`ValidationCoordinator`, `GraphBuilder`) are now stateless `workers` to enhance scalability.
-   **Clear Roles--** The directory names clearly delineate roles-- `agents` start processes, `workers` execute them, `services` provide shared logic and support, and `utils` connect to infrastructure.