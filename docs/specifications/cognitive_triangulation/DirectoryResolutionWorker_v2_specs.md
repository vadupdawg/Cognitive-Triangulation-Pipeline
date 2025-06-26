# Specification-- DirectoryResolutionWorker (v2)

This document provides the detailed specification for the modified `DirectoryResolutionWorker` as part of the Cognitive Triangulation v2 architecture.

## 1. Purpose and Role

The `DirectoryResolutionWorker` performs the second pass of analysis. It is triggered after all `FileAnalysisWorker` jobs for a given directory are complete. Its primary role is to analyze relationships *between* the files within its assigned directory, providing a crucial cross-validation context for the findings of the individual file analyses.

In v2, this worker no longer assumes it is part of a simple sequential pipeline. It now consumes data from the initial file pass, performs its own independent analysis, and publishes its findings as an event for the `ValidationCoordinator` to reconcile.

## 2. Dependencies

-- **Module/Service** -- **Purpose**
-- --- -- ---
-- `bullmq` -- To process jobs from the `directory-resolution-queue` and publish completion events.
-- `sqliteDb` -- To read the POIs for all files within its target directory.
-- `deepseekClient` (or `LlmClient` abstraction) -- To communicate with the LLM.
-- `ConfidenceScoringService` -- To get an initial confidence score for each relationship it identifies.
-- `logger` -- For structured logging.

## 3. Class Definition-- `DirectoryResolutionWorker`

### 3.1. Overview

The `DirectoryResolutionWorker` class processes jobs from the `directory-resolution-queue`.

### 3.2. Existing Methods (Modified)

#### `processJob(job)`

-   **Purpose**: The main job processing logic for a single directory.
-   **Parameters**:
    -   `job` (Object)-- The BullMQ job object. The `job.data` payload will contain--
        -   `runId` (String)
        -   `directoryPath` (String)
-   **Modified Logic**:
    1.  Query `sqliteDb` to retrieve all POIs associated with the `runId` that are within the `directoryPath`.
    2.  Construct a context for the LLM containing the list of all POIs in the directory.
    3.  Call the LLM to identify relationships *between* these POIs.
    4.  **New**: For each relationship found by the LLM in this pass--
        a. Calculate its `initialScore` using `ConfidenceScoringService.getInitialScoreFromLlm()`.
        b. This worker also re-evaluates relationships found in the file-pass. For relationships it *doesn't* find, it will create a finding with `foundRelationship: false`.
    5.  **New**: Construct an `AnalysisCompletedEvent` payload. This payload will contain findings for all relationships involving the directory's POIs.
    6.  **New**: Publish a `directory-analysis-completed` event for the `ValidationCoordinator`.
-   **Returns**: `Promise<void>`

## 4. TDD Anchors / Pseudocode Stubs

```
// TEST-- 'DirectoryResolutionWorker should fetch all POIs for its directory from the database'
// TEST-- 'DirectoryResolutionWorker should call the LLM with a context of all directory POIs'
// TEST-- 'DirectoryResolutionWorker should call ConfidenceScoringService for each relationship it evaluates'
// TEST-- 'DirectoryResolutionWorker should publish a "directory-analysis-completed" event'
// TEST-- 'The event payload should include findings for relationships the worker confirmed AND relationships it did not find'

class DirectoryResolutionWorker {
  constructor(queueName) {
    this.worker = new Worker(queueName, this.processJob.bind(this));
  }

  async processJob(job) {
    const { runId, directoryPath } = job.data;
    const poisInDirectory = await sqliteDb.getPoisForDirectory(runId, directoryPath);

    // This includes relationships found by the file-pass for this directory
    const relationshipsToEvaluate = await sqliteDb.getRelationshipsForDirectory(runId, directoryPath);

    const llmContext = buildContextFromPois(poisInDirectory);
    const llmResponse = await LlmClient.analyzeDirectory(llmContext);

    const findings = [];
    // A real implementation needs to map LLM responses back to the relationships from the DB
    const relationshipsFoundByLlm = llmResponse.relationships;

    for (const rel of relationshipsToEvaluate) {
        const wasFoundInThisPass = checkIfExists(rel, relationshipsFoundByLlm);
        const score = wasFoundInThisPass ? ConfidenceScoringService.getInitialScoreFromLlm(rel.raw) : 0.1;

        findings.push({
            relationshipHash: createRelationshipHash(rel),
            foundRelationship: wasFoundInThisPass,
            initialScore: score,
            rawLlmOutput: rel.raw // The raw output from THIS worker's LLM call
        });
    }

    const eventPayload = {
      runId: runId,
      jobId: job.id,
      sourceWorker: 'DirectoryResolutionWorker',
      findings: findings
    };

    await eventQueue.add('directory-analysis-completed', eventPayload);
  }
}