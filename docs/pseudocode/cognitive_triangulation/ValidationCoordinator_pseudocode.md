# Pseudocode-- ValidationCoordinator

This document outlines the detailed, language-agnostic pseudocode for the `ValidationCoordinator`.

## 1. Overview

The `ValidationCoordinator` is an event-driven component responsible for managing the multi-pass analysis and validation process. It listens for analysis results, collects evidence against a manifest, and triggers the final reconciliation and persistence of validated data.

## 2. Dependencies

-   **CacheClient**: An interface for a persistent key-value store (e.g., Redis) to manage the `runManifest` and `evidenceStore`. Must support an atomic `increment` operation.
-   **QueueService**: An interface for a message queue (e.g., BullMQ) to subscribe to worker events and enqueue reconciliation jobs.
-   **Logger**: A service for structured logging.

## 3. Class-- ValidationCoordinator

### 3.1. Attributes

-   `runId` (String)-- The unique identifier for the analysis run.
-   `cache` (CacheClient)-- A client instance for the persistent cache.
-   `queueService` (QueueService)-- A client instance for the message queue.
-   `logger` (Logger)-- A logging utility.
-   `manifest` (Object)-- A representation of the `runManifest`, loaded during initialization.

### 3.2. `constructor`

**Purpose**: Initializes a new instance of the `ValidationCoordinator`.

**Inputs**:
-   `runId` (String)-- The ID of the analysis run.
-   `cacheClient` (CacheClient)-- An initialized cache client.
-   `queueService` (QueueService)-- An initialized queue service.
-   `logger` (Logger)-- An initialized logger.

**Process**:
1.  Set `this.runId` = `runId`.
2.  Set `this.cache` = `cacheClient`.
3.  Set `this.queueService` = `queueService`.
4.  Set `this.logger` = `logger`.
5.  Set `this.manifest` = `NULL`.

---

### 3.3. `start` Method

**Purpose**: Loads the run manifest and subscribes to worker completion events to begin listening for analysis findings.

**Inputs**: None

**Output**: Void

**TDD Anchors**:
-   `TEST 'start' should successfully load the manifest from the cache and subscribe to queues.`
-   `TEST 'start' should log a critical error and throw an exception if the manifest is not found.`

**Process**:
1.  `TRY`:
    1.  `manifestKey` = `CONCAT("manifest--", this.runId)`.
    2.  `manifestJson` = `AWAIT this.cache.get(manifestKey)`.
    3.  `IF manifestJson IS NULL OR EMPTY`:
        1.  `this.logger.critical("Manifest not found for runId-- ", this.runId)`.
        2.  `THROW New Error("CRITICAL-- Manifest not found.")`.
    4.  `this.manifest` = `JSON.parse(manifestJson)`.
    5.  `AWAIT this.queueService.subscribe("analysis-completed", this.handleAnalysisEvent)`.
    6.  `this.logger.info("ValidationCoordinator started for runId-- ", this.runId)`.
2.  `CATCH exception`:
    1.  `this.logger.error("Failed to start ValidationCoordinator-- ", exception.message)`.
    2.  `RETHROW exception`.

---

### 3.4. `handleAnalysisEvent` Method (Revised for Atomicity)

**Purpose**: Processes incoming findings, stores them as evidence, and uses an atomic counter to enqueue a relationship for reconciliation exactly once when all expected evidence has arrived. This prevents race conditions.

**Inputs**:
-   `event` (Object)-- The event payload from a worker, containing `runId`, `jobId`, and a list of `findings`.

**Output**: Void

**TDD Anchors**:
-   `TEST 'handleAnalysisEvent' should ignore events for a different runId.`
-   `TEST 'handleAnalysisEvent' should correctly store evidence for each finding.`
-   `TEST 'handleAnalysisEvent' should trigger reconciliation ONLY when the evidence count EXACTLY matches the manifest's expected count.`
-   `TEST 'handleAnalysisEvent' should not trigger reconciliation if the evidence count is less than expected.`
-   `TEST 'handleAnalysisEvent' under concurrent load should enqueue the reconciliation job exactly once.`

**Process**:
1.  `IF event.runId IS NOT EQUAL to this.runId`:
    1.  `RETURN`. // Ignore events not relevant to this run.
2.  `FOR EACH finding IN event.findings`:
    1.  `TRY`:
        1.  `relationshipHash` = `finding.relationshipHash`.
        2.  `manifestEntry` = `this.manifest.relationshipEvidenceMap[relationshipHash]`.
        3.  `IF manifestEntry IS NULL`:
            1.  `this.logger.warn("Received finding for a relationship not in the manifest-- ", relationshipHash)`.
            2.  `CONTINUE`. // Skip to the next finding
        4.
        5.  `expectedCount` = `manifestEntry.length`.
        6.  `evidenceDataKey` = `CONCAT("evidence--", this.runId, "--", relationshipHash)`.
        7.  `evidenceCounterKey` = `CONCAT("counter--", this.runId, "--", relationshipHash)`.
        8.
        9.  // Store the actual evidence data for the reconciler to use later.
        10. `AWAIT this.cache.pushToList(evidenceDataKey, JSON.stringify(finding))`.
        11.
        12. // Atomically increment the counter for this relationship and get the new value.
        13. // This is the core of the race condition fix.
        14. `newCount` = `AWAIT this.cache.increment(evidenceCounterKey)`.
        15.
        16. // Check if the new count is the exact number we need to trigger reconciliation.
        17. `IF newCount IS EQUAL to expectedCount`:
            1.  `reconciliationJob` = `{ relationshipHash-- relationshipHash, runId-- this.runId }`.
            2.  `AWAIT this.queueService.enqueue("reconcile-relationship", reconciliationJob)`.
            3.  `this.logger.info("Evidence count (", newCount, "/", expectedCount, ") met. Enqueued for reconciliation-- ", relationshipHash)`.
        18. `ELSE IF newCount > expectedCount`:
            1.  `this.logger.warn("Evidence count for ", relationshipHash, " is now ", newCount, " but expected ", expectedCount, ". Reconciliation job was likely already triggered.")`.
        19. `ELSE`:
            1.  `this.logger.debug("Evidence count for ", relationshipHash, " is now ", newCount, "/", expectedCount, ". Waiting for more evidence.")`.
    2.  `CATCH exception`:
        1.  `this.logger.error("Failed to handle analysis event for finding-- ", finding, " -- Error-- ", exception.message)`.
