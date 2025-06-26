# Component Architecture-- EntityScout (Producer - Revised)

**Parent Document:** [System Architecture](./system_overview.md)
**Status:** In Design

## 1. Component Purpose (C3)

`EntityScout` acts as the primary **producer** in the system. Its responsibility is to orchestrate the start of a new analysis run by creating a **hierarchical dependency graph of jobs**. It creates parent jobs for the entire run and for each directory, ensuring that the staged resolution workers (`DirectoryResolutionWorker`, `GlobalResolutionWorker`) execute in the correct order.

## 2. Key Responsibilities

-   **Run Orchestration:** Manages the lifecycle of a single analysis run.
-   **File Discovery:** Scans the project workspace to find all relevant files and group them by directory.
-   **Hierarchical Job Creation:** Creates the `analyze-file` child jobs, the intermediate `resolve-directory` parent jobs, and the single root `resolve-global` parent job.
-   **Dependency Management:** Establishes the multi-level parent-child relationships between the jobs.

## 3. Component Diagram & Interactions

```mermaid
graph TD
    subgraph "Producers"
        EntityScout
    end

    subgraph "Queues"
        AnalysisQueue(analysis-queue)
        DirectoryQueue(directory-resolution-queue)
        GlobalQueue(global-resolution-queue)
    end

    EntityScout -- "1. Gets queue instances" --> QueueManager
    EntityScout -- "2. Adds root job" --> GlobalQueue
    EntityScout -- "3. Adds directory parent jobs" --> DirectoryQueue
    EntityScout -- "4. Adds file child jobs" --> AnalysisQueue
    EntityScout -- "5. Sets up all dependencies"
```

## 4. Key Functions (from Pseudocode)

### `constructor(queueManager)`
-   **Pseudocode Logic:**
    -   Calls `queueManager.getQueue()` three times to get instances for `'analysis-queue'`, `'directory-resolution-queue'`, and `'global-resolution-queue'`.
-   **Architectural Significance:** Relies on the `QueueManager` for all queue access.

### `run()`
-   **Pseudocode Logic:**
    1.  Generates a unique `runId`.
    2.  Calls `_createGlobalParentJob()` to create the root `resolve-global` job.
    3.  Discovers all file paths and groups them by their parent directory.
    4.  **For each directory:**
        a. Calls `_createDirectoryParentJob()` to create the `resolve-directory` job.
        b. Creates all `analyze-file` jobs for that directory.
        c. Links the `analyze-file` jobs as dependencies of the directory job.
        d. Links the directory job as a dependency of the global job.
    5.  Resumes all created jobs so they can be processed.
-   **Architectural Significance:** This is the new core orchestration logic. It meticulously builds the multi-level dependency tree required for the hierarchical analysis, completely replacing the old fan-out/fan-in model with a more scalable, staged approach.

### `_createGlobalParentJob(runId)`
-   **Pseudocode Logic:** Adds a single job named `resolve-global` to the `global-resolution-queue`.
-   **Architectural Significance:** Creates the final gate for the entire process.

### `_createDirectoryParentJob(directoryPath)`
-   **Pseudocode Logic:** Adds a job named `resolve-directory` to the `directory-resolution-queue`.
-   **Architectural Significance:** Creates the intermediate fan-in point for each directory, enabling the Stage 1 analysis.

---

## 5. Navigation

-   [Back to System Overview](./system_overview.md)