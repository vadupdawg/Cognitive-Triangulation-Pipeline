# Data Flow and Job Lifecycle (Revised)

**Parent Document:** [System Architecture](./system_overview.md)
**Status:** In Design

## 1. Overview

This document provides a detailed, step-by-step breakdown of the revised hierarchical data and control flow. It illustrates the multi-level parent-child job dependencies that prevent bottlenecks and enable greater scalability.

## 2. Sequence Diagram (Hierarchical)

```mermaid
sequenceDiagram
    participant User
    participant EntityScout
    participant AnalysisQueue
    participant DirectoryQueue
    participant GlobalQueue
    participant FileAnalysisWorker
    participant DirectoryResolutionWorker
    participant GlobalResolutionWorker
    participant Database

    User->>EntityScout: run()
    activate EntityScout

    EntityScout->>GlobalQueue: add("resolve-global", {runId})
    activate GlobalQueue
    GlobalQueue-->>EntityScout: globalParentJob
    deactivate GlobalQueue

    loop For each directory
        EntityScout->>DirectoryQueue: add("resolve-directory", {dirPath})
        activate DirectoryQueue
        DirectoryQueue-->>EntityScout: dirParentJob
        deactivate DirectoryQueue
        
        EntityScout->>AnalysisQueue: addBulk([{name: "analyze-file", data: {...}}, ...])
        activate AnalysisQueue
        AnalysisQueue-->>EntityScout: fileChildJobs
        deactivate AnalysisQueue

        EntityScout->>DirectoryQueue: dirParentJob.addDependencies(fileChildJobs)
        EntityScout->>GlobalQueue: globalParentJob.addDependencies(dirParentJob)
    end
    deactivate EntityScout
    
    par
        AnalysisQueue-->>FileAnalysisWorker: process(job1)
        activate FileAnalysisWorker
        FileAnalysisWorker->>Database: Save POIs
        deactivate FileAnalysisWorker
    and
        AnalysisQueue-->>FileAnalysisWorker: process(jobN)
        activate FileAnalysisWorker
        FileAnalysisWorker->>Database: Save POIs
        deactivate FileAnalysisWorker
    end

    Note over DirectoryQueue: All 'analyze-file' jobs for a directory complete. <br/>'resolve-directory' job is released.

    DirectoryQueue-->>DirectoryResolutionWorker: process(dirParentJob)
    activate DirectoryResolutionWorker
    DirectoryResolutionWorker->>Database: Load POIs for directory
    DirectoryResolutionWorker->>LLM_Service: Find intra-directory relationships
    DirectoryResolutionWorker->>Database: Save directory summary & relationships
    deactivate DirectoryResolutionWorker

    Note over GlobalQueue: All 'resolve-directory' jobs complete. <br/>'resolve-global' job is released.

    GlobalQueue-->>GlobalResolutionWorker: process(globalParentJob)
    activate GlobalResolutionWorker
    GlobalResolutionWorker->>Database: Load all directory summaries
    GlobalResolutionWorker->>LLM_Service: Find inter-directory relationships
    GlobalResolutionWorker->>Database: Save final relationships
    deactivate GlobalResolutionWorker
```

## 3. Job Lifecycle and State Transitions

The lifecycle of an individual job (`waiting`, `active`, `completed`, `failed`) remains the same as the original design. The key change is the introduction of a multi-level dependency chain.

-   **`analyze-file` (Child Job):** Dependent on nothing. Its completion releases a dependency on its parent.
-   **`resolve-directory` (Intermediate Parent Job):** State is `waiting-children` until all its dependent `analyze-file` jobs are `completed`. Its completion releases a dependency on the global parent job.
-   **`resolve-global` (Root Parent Job):** State is `waiting-children` until all its dependent `resolve-directory` jobs are `completed`. Its completion marks the end of the entire analysis run.

---

## 4. Navigation

-   [Back to System Overview](./system_overview.md)