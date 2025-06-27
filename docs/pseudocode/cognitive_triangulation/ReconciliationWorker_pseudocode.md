# Pseudocode-- ReconciliationWorker

This document outlines the detailed, language-agnostic pseudocode for the `ReconciliationWorker`.

## 1. Overview

The `ReconciliationWorker` is a dedicated process that handles the `reconcile-relationship` job. It is triggered by the `ValidationCoordinator` once all expected evidence for a specific relationship has been collected. Its sole responsibility is to fetch all evidence, calculate a final confidence score, and persist the validated results to the database.

## 2. Dependencies

-   **CacheClient**: An interface for a persistent key-value store (e.g., Redis) to retrieve the collected evidence.
-   **DatabaseClient**: An interface for the primary database (e.g., SQLite) to save validated data.
-   **ConfidenceScoringService**: A service to calculate the final confidence score from a collection of evidence.
-   **Logger**: A service for structured logging.

## 3. Class-- ReconciliationWorker

### 3.1. `constructor`

**Purpose**: Initializes a new instance of the `ReconciliationWorker`.

**Inputs**:
-   `cacheClient` (CacheClient)-- An initialized cache client.
-   `dbClient` (DatabaseClient)-- An initialized database client.
-   `scoringService` (ConfidenceScoringService)-- An initialized scoring service.
-   `logger` (Logger)-- An initialized logger.

**Process**:
1.  Set `this.cache` = `cacheClient`.
2.  Set `this.db` = `dbClient`.
3.  Set `this.scoringService` = `scoringService`.
4.  Set `this.logger` = `logger`.

---

### 3.2. `process` Method

**Purpose**: Executes the reconciliation and persistence logic for a single relationship.

**Inputs**:
-   `job` (Object)-- The job object from the queue. `job.data` contains `relationshipHash` and `runId`.

**Output**: Void

**TDD Anchors**:
-   `TEST 'process' should successfully retrieve all evidence from the cache.`
-   `TEST 'process' should correctly call the ConfidenceScoringService to get a final score.`
-   `TEST 'process' should log a warning if the scoring service reports a conflict.`
-   `TEST 'process' should save the validated relationship and its full evidence trail to the database.`
-   `TEST 'process' should handle cases where evidence is missing from the cache unexpectedly.`

**Process**:
1.  `TRY`:
    1.  `relationshipHash` = `job.data.relationshipHash`.
    2.  `runId` = `job.data.runId`.
    3.  `evidenceKey` = `CONCAT("evidence--", runId, "--", relationshipHash)`.
    4.  
    5.  // Retrieve all evidence as a list of JSON strings.
    6.  `evidenceJsonList` = `AWAIT this.cache.getLrange(evidenceKey, 0, -1)`.
    7.  
    8.  `IF evidenceJsonList IS NULL OR IS EMPTY`:
        1.  `this.logger.warn("No evidence found in cache for key-- ", evidenceKey)`.
        2.  `RETURN`.
    9.
    10. `allEvidence` = `evidenceJsonList.map(json => JSON.parse(json))`.
    11. 
    12. // Calculate final score.
    13. `scoringResult` = `this.scoringService.calculateFinalScore(allEvidence)`.
    14. `finalScore` = `scoringResult.finalScore`.
    15. `hasConflict` = `scoringResult.hasConflict`.
    16. 
    17. `IF hasConflict IS TRUE`:
        1.  `this.logger.warn("Relationship discrepancy found for hash-- ", relationshipHash, " in run-- ", runId)`.
    18. 
    19. // Persist the validated data.
    20. `validatedRelationship` = `{ status-- "VALIDATED", confidenceScore-- finalScore }`.
    21. `AWAIT this.db.updateRelationship(relationshipHash, validatedRelationship)`.
    22. 
    23. // Persist the complete evidence trail for auditability.
    24. `AWAIT this.db.saveEvidence(relationshipHash, allEvidence)`.
    25. 
    26. `this.logger.info("Successfully reconciled and persisted relationship-- ", relationshipHash)`.
2.  `CATCH exception`:
    1.  `this.logger.error("Failed to process reconciliation for job-- ", job.data, " -- Error-- ", exception.message)`.
    2.  // Depending on queue implementation, re-throw to trigger a retry.
    3.  `RETHROW exception`.
