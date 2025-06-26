# Pseudocode-- ValidationCoordinator Agent (v2)

This document provides a detailed, language-agnostic pseudocode blueprint for the `ValidationCoordinator` agent, based on the revised v2 specification.

## 1. Agent Overview

The `ValidationCoordinator` orchestrates the validation of relationship findings from various analysis workers. It is event-driven and relies on a persistent cache for state management across different stages of the validation process.

## 2. Dependencies

-- **Service/Module** -- **Purpose**
-- --- -- ---
-- `QueueClient` (e.g., BullMQ) -- For listening to worker completion events and managing its own job queue.
-- `CacheClient` (e.g., Redis) -- For reading the run manifest and storing/retrieving evidence lists.
-- `DatabaseClient` (e.g., SQLite) -- For persisting final validated relationships and their evidence.
-- `ConfidenceScoringService` -- For calculating the final confidence score of a relationship.
-- `Logger` -- For structured logging.

## 3. Class-- ValidationCoordinator

### 3.1. Properties

-   `runId` (String)-- The unique ID for the analysis run this instance is coordinating.
-   `cache` (CacheClient)-- An initialized client for the persistent cache.
-   `db` (DatabaseClient)-- An initialized client for the database.
-   `queue` (QueueClient)-- An initialized client for the message queue.
-   `logger` (Logger)-- An initialized logger instance.
-   `manifest` (Object)-- The run manifest, loaded during initialization.

### 3.2. Constructor

```pseudocode
FUNCTION constructor(runId)
    INPUT-- runId (String)

    this.runId = runId
    this.cache = NEW CacheClient()
    this.db = NEW DatabaseClient()
    this.queue = NEW QueueClient()
    this.logger = NEW Logger()
    this.manifest = NULL

    -- TEST-- constructor should correctly initialize all properties.
    -- TEST-- constructor should throw an error if runId is null or empty.
ENDFUNCTION
```

### 3.3. Method-- `start()`

This method initializes the agent, loads the necessary manifest, and begins listening for events.

```pseudocode
ASYNC FUNCTION start()
    BEGIN
        -- Load the manifest associated with the current runId from the cache.
        -- The key is constructed using the runId.
        TRY
            -- TEST-- start() successfully loads a valid manifest for a given runId.
            manifestData = AWAIT this.cache.get("manifest:" + this.runId)

            IF manifestData IS NULL OR EMPTY THEN
                -- TEST-- start() logs a critical error and stops if the manifest is not found.
                this.logger.critical("Manifest not found for runId: " + this.runId)
                RETURN -- Stop execution
            ENDIF

            this.manifest = PARSE_JSON(manifestData)
            -- TEST-- start() correctly parses a valid JSON manifest.

        CATCH error
            -- TEST-- start() handles errors during manifest loading (e.g., cache connection failure).
            this.logger.error("Failed to load or parse manifest for runId: " + this.runId, error)
            RETURN -- Stop execution
        ENDTRY

        -- Subscribe to worker completion queues.
        -- The specific queue names should be defined in a configuration.
        -- This handler will delegate to handleAnalysisEvent.
        AWAIT this.queue.subscribe("worker-completion-queue", this.handleAnalysisEvent)
        -- TEST-- start() successfully subscribes to the correct event queue.

        -- Also, create a worker to process its own reconciliation queue.
        AWAIT this.queue.createWorker("reconcile-relationship-queue", this.reconcileRelationship)
        -- TEST-- start() successfully creates a worker for the reconciliation queue.


        this.logger.info("ValidationCoordinator started for runId: " + this.runId)
    END
ENDFUNCTION
```

### 3.4. Method-- `handleAnalysisEvent(event)`

This is the core event handler that processes findings from worker agents.

```pseudocode
ASYNC FUNCTION handleAnalysisEvent(event)
    INPUT-- event (Object) containing runId, jobId, and findings.

    BEGIN
        -- TEST-- handleAnalysisEvent should gracefully ignore events with missing or invalid data.
        IF event IS NULL OR event.findings IS NULL OR event.findings IS EMPTY THEN
            this.logger.warn("Received an empty or invalid analysis event.", event)
            RETURN
        ENDIF

        -- TEST-- handleAnalysisEvent should process a single finding correctly.
        -- TEST-- handleAnalysisEvent should process multiple findings in a single event correctly.
        FOR EACH finding IN event.findings
            relationshipHash = finding.relationshipHash

            -- Atomically add the new evidence to the list for this relationship in the cache.
            -- Using a list push operation is ideal here.
            evidenceKey = "evidence:" + relationshipHash
            AWAIT this.cache.listPush(evidenceKey, SERIALIZE(finding))
            -- TEST-- handleAnalysisEvent correctly appends new evidence to the cache for a relationship.

            -- Get the current count of evidence pieces we have collected.
            currentEvidenceCount = AWAIT this.cache.listLength(evidenceKey)

            -- Look up how many pieces of evidence are expected from the manifest.
            expectedEvidenceCount = this.manifest.getExpectedCountFor(relationshipHash)
            -- TEST-- handleAnalysisEvent correctly retrieves the expected evidence count from the manifest.

            -- Check if all expected evidence has been received.
            IF currentEvidenceCount >= expectedEvidenceCount THEN
                -- TEST-- handleAnalysisEvent enqueues a reconciliation job when all evidence is received.
                this.logger.info("All evidence received for " + relationshipHash + ". Enqueuing for reconciliation.")
                AWAIT this.queue.enqueue("reconcile-relationship-queue", { relationshipHash: relationshipHash })
            ELSE
                -- TEST-- handleAnalysisEvent does NOT enqueue a reconciliation job if evidence is still missing.
                this.logger.debug("Still waiting for more evidence for " + relationshipHash + ". Have " + currentEvidenceCount + "/" + expectedEvidenceCount)
            ENDIF
        ENDFOR
    END
ENDFUNCTION
```

### 3.5. Method-- `reconcileRelationship(job)`

This method is triggered when all evidence for a relationship is ready for final processing.

```pseudocode
ASYNC FUNCTION reconcileRelationship(job)
    INPUT-- job (Object) containing relationshipHash.

    BEGIN
        relationshipHash = job.data.relationshipHash
        evidenceKey = "evidence:" + relationshipHash

        TRY
            -- 1. Retrieve all evidence from the cache.
            -- TEST-- reconcileRelationship successfully retrieves all evidence for a hash.
            evidenceListJSON = AWAIT this.cache.listRange(evidenceKey, 0, -1)
            evidenceList = DESERIALIZE_ALL(evidenceListJSON)

            IF evidenceList IS EMPTY THEN
                -- TEST-- reconcileRelationship handles cases where evidence is unexpectedly missing.
                this.logger.error("Reconciliation triggered for " + relationshipHash + " but no evidence was found in cache.")
                RETURN
            ENDIF

            -- 2. Calculate final score.
            -- TEST-- reconcileRelationship correctly calls the ConfidenceScoringService.
            scoringResult = ConfidenceScoringService.calculateFinalScore(evidenceList)

            -- 3. Log if there was a conflict.
            IF scoringResult.conflictDetected THEN
                -- TEST-- reconcileRelationship logs a structured warning when a conflict is detected.
                this.logger.warn({
                    message: "Conflict detected during reconciliation for " + relationshipHash,
                    hash: relationshipHash,
                    score: scoringResult.finalScore,
                    evidence: evidenceList
                })
            ENDIF

            -- 4. Save validated relationship to the primary database (e.g., SQLite).
            -- TEST-- reconcileRelationship correctly saves the validated relationship to the database.
            AWAIT this.db.execute(
                "UPDATE relationships SET status = 'VALIDATED', confidence_score = ? WHERE hash = ?",
                [scoringResult.finalScore, relationshipHash]
            )

            -- 5. Save the full evidence trail for audit purposes.
            -- TEST-- reconcileRelationship correctly saves the complete evidence trail.
            FOR EACH evidenceItem IN evidenceList
                AWAIT this.db.execute(
                    "INSERT INTO relationship_evidence (relationship_hash, evidence_payload) VALUES (?, ?)",
                    [relationshipHash, SERIALIZE(evidenceItem)]
                )
            ENDFOR

            -- Optional-- Clean up the evidence from the cache after successful persistence.
            -- AWAIT this.cache.delete(evidenceKey)
            -- TEST-- reconcileRelationship cleans up the cache entry after processing.

            this.logger.info("Successfully reconciled and persisted relationship " + relationshipHash)

        CATCH error
            -- TEST-- reconcileRelationship handles errors during database operations or scoring.
            this.logger.error("Failed to reconcile relationship " + relationshipHash, error)
            -- Optional-- Implement a retry mechanism by re-throwing the error to the queue worker.
            THROW error
        ENDTRY
    END
ENDFUNCTION