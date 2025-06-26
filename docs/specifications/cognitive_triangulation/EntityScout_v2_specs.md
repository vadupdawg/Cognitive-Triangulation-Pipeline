# Specification-- EntityScout Agent (v2)

This document provides the detailed specification for the revised `EntityScout` agent, which plays a critical role in orchestrating the Cognitive Triangulation v2 architecture.

## 1. Purpose and Role

The primary purpose of the `EntityScout` agent is to initialize an analysis run by scanning the target directory, identifying all relevant files, and creating the hierarchical job structure for the analysis workers.

The key revision in v2 is the **generation of a `runManifest`**. This manifest is a critical data structure that explicitly defines the full job dependency graph and serves as the contract for the `ValidationCoordinator`, telling it exactly what evidence to expect for every potential relationship, thereby solving the reconciliation trigger ambiguity.

## 2. Dependencies

-- **Module/Service** -- **Purpose**
-- --- -- ---
-- `bullmq` -- To enqueue jobs for the various analysis workers.
-- `glob` / `fs` -- To scan the file system for target files.
-- `logger` -- For structured logging.

## 3. Class Definition-- `EntityScout`

### 3.1. Methods

#### `run(rootPath, runId)`

-   **Purpose**: The main entry point to start a new analysis run.
-   **Parameters**:
    -   `rootPath` (String)-- The absolute path to the root of the codebase to be analyzed.
    -   `runId` (String)-- The unique identifier for this analysis run.
-   **Logic**:
    1.  Recursively scan `rootPath` to identify all files to be analyzed.
    2.  Group files by their parent directory.
    3.  **Generate the `runManifest`**: This is the core new responsibility. The agent constructs a detailed JSON object that maps out the entire run.
    4.  Save the `runManifest` to a well-known key in a persistent cache (e.g., Redis) that is accessible to the `ValidationCoordinator`. The key should be `manifest:{runId}`.
    5.  Based on the manifest, create and enqueue all the necessary jobs (`analyze-file`, `resolve-directory`, `resolve-global`) in BullMQ.
-   **Returns**: `Promise<void>`

## 4. The `runManifest` Data Structure

The `runManifest` is the source of truth for the `ValidationCoordinator`. It defines which jobs are expected to provide an opinion on which relationships.

### 4.1. Structure

```json
{
  "runId": "...",
  "jobGraph": {
    "file-analysis": ["jobId1", "jobId2", ...],
    "directory-resolution": ["jobId3", "jobId4", ...],
    "global-resolution": ["jobId5"]
  },
  "relationshipEvidenceMap": {
    "<relationshipHash1>": ["jobId1", "jobId3", "jobId5"],
    "<relationshipHash2>": ["jobId2", "jobId3", "jobId5"],
    "<relationshipHash3>": ["jobId1", "jobId4", "jobId5"]
  }
}
```

### 4.2. Field Definitions

-   **`runId`**: The unique ID for the run.
-   **`jobGraph`**: A simple map listing all job IDs categorized by the queue they belong to. This allows for easy tracking of overall progress.
-   **`relationshipEvidenceMap`**: The most critical part of the manifest.
    -   **Key**: The unique hash for a potential relationship. This hash is pre-calculated by the `EntityScout` based on all possible file pairings within the scope of analysis. See [`hashing_contracts.md`](./hashing_contracts.md) for the hashing algorithm.
    -   **Value**: An array of `jobId` strings. This array explicitly lists every job that is expected to analyze the files involved in this relationship and therefore *must* provide evidence for it.
        -   For an intra-file relationship-- the list might contain the file's analysis job, its directory's resolution job, and the global resolution job.
        -   For a cross-file relationship-- the list would contain both files' analysis jobs, their common directory's job (if applicable), and the global job.

## 5. TDD Anchors / Pseudocode Stubs

```
// TEST-- 'EntityScout v2 should generate a manifest with a complete job graph'
// TEST-- 'EntityScout v2 should pre-calculate relationship hashes for all valid file pairs'
// TEST-- 'The relationshipEvidenceMap should correctly map relationship hashes to expected job IDs'
// TEST-- 'EntityScout v2 should save the manifest to the persistent cache'
// TEST-- 'EntityScout v2 should enqueue all jobs defined in the manifest'

class EntityScout_v2 {
  constructor(cacheClient, queueManager) {
    this.cache = cacheClient; // e.g., Redis client
    this.queues = queueManager;
  }

  async run(rootPath, runId) {
    const filePaths = await findFiles(rootPath);
    const manifest = this.generateManifest(runId, filePaths);

    await this.cache.set(`manifest:${runId}`, JSON.stringify(manifest));

    // Enqueue jobs based on the generated manifest
    await this.queues.enqueueJobs(manifest.jobGraph);

    logger.info(`EntityScout run ${runId} initiated. Manifest generated and jobs enqueued.`);
  }

  generateManifest(runId, filePaths) {
    // ... complex logic to ...
    // 1. Assign unique job IDs for each file, directory, and the global scope.
    // 2. Pre-calculate all potential relationship hashes between POIs within these files.
    //    This is an estimation based on file proximity. The actual POIs aren't known yet,
    //    so this maps relationships between *files*. The `ValidationCoordinator` will
    //    resolve the specific POI-level hashes later.
    // 3. Build the relationshipEvidenceMap.
    // 4. Return the complete manifest object.

    // This is a simplified placeholder for the map generation
    const relationshipEvidenceMap = {};
    const jobGraph = { /* ... */ };
    // For every pair of files that could have a relationship...
    for (const fileA of filePaths) {
        for (const fileB of filePaths) {
            // This is a simplification. The actual hash would be more specific.
            const potentialRelHash = createPotentialRelationshipHash(fileA, fileB);
            const jobs = findRelevantJobs(fileA, fileB, jobGraph);
            relationshipEvidenceMap[potentialRelHash] = jobs;
        }
    }

    return { runId, jobGraph, relationshipEvidenceMap };
  }
}