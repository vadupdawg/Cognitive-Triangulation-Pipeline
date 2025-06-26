# Specification-- ValidationCoordinator Agent (Revised)

This document provides the revised, detailed specification for the `ValidationCoordinator` agent, a central component in the Cognitive Triangulation v2 architecture. This revision addresses critical ambiguities identified in the Devil's Advocate review.

## 1. Purpose and Role

The `ValidationCoordinator` is a persistent, event-driven agent responsible for orchestrating the multi-pass analysis and validation process. Its primary function is to listen for analysis completion events, gather evidence against a **pre-defined manifest**, calculate a final, reliable confidence score for each relationship, and manage the final data persistence workflow. It is the single point of truth for reconciling findings from all analysis workers.

## 2. Dependencies

-- **Module/Service** -- **Purpose**
-- --- -- ---
-- `bullmq` -- To listen for events/messages from the various worker queues.
-- `Redis` / `CacheClient` -- **(New)** To read the `runManifest` and to use as a persistent, disk-based cache for the `evidenceStore`.
-- `sqliteDb` -- To write/update final, validated relationship data and evidence trails.
-- `ConfidenceScoringService` -- To calculate initial and final confidence scores based on evidence.
-- `GraphBuilder` -- To trigger the final persistence of validated data into Neo4j.
-- `logger` -- For structured logging of discrepancies and process milestones.

## 3. Class Definition-- `ValidationCoordinator`

### 3.1. Overview

The `ValidationCoordinator` class will manage the lifecycle of the validation process for a given analysis run. It is designed to be stateless and scalable, relying on a persistent cache for state management.

### 3.2. Constructor

#### `constructor(runId)`

-   **Purpose**: Initializes the coordinator for a specific analysis run.
-   **Parameters**:
    -   `runId` (String)-- The unique identifier for the overall analysis run.
-   **Initializes**:
    -   `this.runId` with the provided `runId`.
    -   `this.cache` a client to connect to the persistent cache (e.g., Redis).
    -   `this.manifest` as `null`. It will be loaded in the `start()` method.

### 3.3. Methods

#### `start()`

-   **Purpose**: Starts the agent's listening process. It loads the manifest for the run and subscribes to the relevant BullMQ events.
-   **Logic**:
    1.  Load the `runManifest` from the persistent cache (e.g., `await this.cache.get('manifest:' + this.runId)`).
    2.  If the manifest is not found, log a critical error and stop.
    3.  Parse the manifest and store it in `this.manifest`.
    4.  Subscribe to the worker completion queues.
-   **Returns**: `Promise<void>`

#### `handleAnalysisEvent(event)`

-   **Purpose**: The core event handler. It receives analysis results, records the evidence, and checks if reconciliation for a given relationship can be triggered.
-   **Parameters**:
    -   `event` (Object)-- The event payload from a worker. See [Data Models](./job_data_models_v2_specs.md). It must contain `runId`, `jobId`, and `findings`.
-   **Logic**:
    1.  For each `finding` in the event, retrieve its `relationshipHash`.
    2.  Atomically append the new evidence to the evidence list for that hash in the persistent cache (e.g., `redis.rpush('evidence:' + relationshipHash, finding)`).
    3.  Check the `runManifest` to see if all expected evidence for this `relationshipHash` has now been received.
    4.  If it has, enqueue a new `reconcile-relationship` job, passing the `relationshipHash`.
-   **Returns**: `Promise<void>`

#### `reconcileRelationship(relationshipHash)`

-   **Purpose**: Triggered **by its own queue** when all expected evidence for a relationship is ready. It calculates the final score and persists the result.
-   **Parameters**:
    -   `relationshipHash` (String)-- The unique hash of the relationship to process.
-   **Logic**:
    1.  Retrieve all gathered evidence for the hash from the persistent cache.
    2.  Call `ConfidenceScoringService.calculateFinalScore(evidence)` to get the final score and conflict status.
    3.  If a conflict is detected, log a structured warning.
    4.  Save the final, validated relationship to the `relationships` table in SQLite (`status: 'VALIDATED'`).
    5.  Save the complete evidence trail to the `relationship_evidence` table.
-   **Returns**: `Promise<void>`

#### `checkForCompletion()` and `finalizeRun()`
These methods are deprecated in favor of a more robust, event-driven finalization trigger based on the completion of all jobs listed in the manifest's `jobGraph`.

## 4. TDD Anchors / Pseudocode Stubs

```
// TEST-- 'ValidationCoordinator should load the manifest on start'
// TEST-- 'ValidationCoordinator should log an error if the manifest is not found'
// TEST-- 'ValidationCoordinator should store evidence in a persistent cache'
// TEST-- 'ValidationCoordinator should trigger reconciliation only when all expected evidence is received'
// TEST-- 'ValidationCoordinator should correctly call ConfidenceScoringService during reconciliation'
// TEST-- 'ValidationCoordinator should save validated data and evidence to SQLite'

class ValidationCoordinator {
  constructor(runId, cacheClient) {
    this.runId = runId;
    this.cache = cacheClient; // e.g., Redis client
    this.manifest = null;
  }

  async start() {
    const manifestJson = await this.cache.get(`manifest:${this.runId}`);
    if (!manifestJson) {
      throw new Error(`CRITICAL-- Manifest not found for runId ${this.runId}`);
    }
    this.manifest = JSON.parse(manifestJson);
    // ... subscribe to worker queues ...
  }

  async handleAnalysisEvent(event) {
    if (event.runId !== this.runId) return;

    for (const finding of event.findings) {
      const { relationshipHash } = finding;
      const evidenceKey = `evidence:${this.runId}:${relationshipHash}`;
      
      // Store evidence
      await this.cache.rpush(evidenceKey, JSON.stringify(finding));
      
      // Check if reconciliation is ready
      const expectedJobs = this.manifest.relationshipEvidenceMap[relationshipHash];
      const currentEvidenceCount = await this.cache.llen(evidenceKey);

      if (currentEvidenceCount >= expectedJobs.length) {
        // All evidence is in. Time to reconcile.
        await reconciliationQueue.add('reconcile', { relationshipHash, runId: this.runId });
      }
    }
  }
}

// Separate worker/process for reconciliation
class ReconciliationWorker {
    async process(job) {
        const { relationshipHash, runId } = job.data;
        const cache = getCacheClient();
        const evidenceKey = `evidence:${runId}:${relationshipHash}`;
        
        const evidenceJson = await cache.lrange(evidenceKey, 0, -1);
        const allEvidence = evidenceJson.map(e => JSON.parse(e));

        const { finalScore, hasConflict } = ConfidenceScoringService.calculateFinalScore(allEvidence);

        if (hasConflict) {
            logger.warn({ msg: 'Relationship discrepancy found', runId, relationshipHash });
        }

        await sqliteDb.updateRelationship(relationshipHash, {
            status: 'VALIDATED',
            confidenceScore: finalScore
        });
        await sqliteDb.saveEvidence(relationshipHash, allEvidence);
    }
}