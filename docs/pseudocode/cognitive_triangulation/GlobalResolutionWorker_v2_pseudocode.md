# Pseudocode-- GlobalResolutionWorker (v2)

This document outlines the detailed, language-agnostic pseudocode for the `GlobalResolutionWorker` class, specifically its `processJob` method. It is based on the v2 specification for the Cognitive Triangulation architecture.

## 1. Class-- GlobalResolutionWorker

### Dependencies
- `logger`-- For structured logging.
- `sqliteDb`-- To access the database for directory summaries.
- `llmClient`-- An abstraction for the Large Language Model client.
- `ConfidenceScoringService`-- To calculate initial confidence scores.
- `queueManager`-- To publish completion events.

### Class Structure
```pseudocode
CLASS GlobalResolutionWorker
    -- Dependencies are injected during instantiation
    CONSTRUCTOR(logger, sqliteDb, llmClient, ConfidenceScoringService, queueManager)
        this.logger = logger
        this.sqliteDb = sqliteDb
        this.llmClient = llmClient
        this.ConfidenceScoringService = ConfidenceScoringService
        this.queueManager = queueManager
    END CONSTRUCTOR

    -- Main method to process jobs
    FUNCTION processJob(job)
        -- See detailed pseudocode below
    END FUNCTION

END CLASS
```

## 2. Function-- processJob

This function orchestrates the global analysis of the entire codebase for a given run.

### 2.1. Signature
- **INPUT**: `job` (Object)-- A job object containing `runId`.
- **OUTPUT**: None (The function is asynchronous and signals completion via an event).

### 2.2. Pseudocode

```pseudocode
FUNCTION processJob(job)
    -- TDD Anchor-- TEST that a job with null or invalid data is handled gracefully.
    CONSTANT runId = job.data.runId
    CONSTANT workerName = "GlobalResolutionWorker"

    this.logger.info(`Starting global resolution for runId-- ${runId}`)

    TRY
        -- 1. Fetch all directory summaries from the database
        -- TDD Anchor-- TEST that the database is queried with the correct runId.
        CONSTANT directorySummaries = this.sqliteDb.getAllDirectorySummaries(runId)

        -- TDD Anchor-- TEST behavior when no directory summaries are found for the runId.
        IF directorySummaries IS EMPTY THEN
            this.logger.warn(`No directory summaries found for runId-- ${runId}. Nothing to process.`)
            -- Potentially publish a "completed-empty" event or simply return.
            RETURN
        END IF

        -- 2. Construct the high-level context for the LLM
        -- TDD Anchor-- TEST that the context string is formatted correctly from a sample list of summaries.
        CONSTANT globalContext = this.buildGlobalContext(directorySummaries)

        -- 3. Call the LLM to identify cross-directory relationships and evaluate findings
        -- TDD Anchor-- TEST that the LLM is called with the correctly formatted prompt and context.
        CONSTANT llmPrompt = "Analyze the following directory summaries to identify high-level, cross-directory relationships and architectural patterns. Provide a definitive analysis."
        CONSTANT llmResponse = this.llmClient.analyzeGlobalContext(llmPrompt, globalContext)

        -- TDD Anchor-- TEST the parsing logic for a valid, complex LLM response containing multiple findings.
        -- TDD Anchor-- TEST the handling of an empty or malformed LLM response.
        CONSTANT llmFindings = this.parseLlmResponse(llmResponse)

        -- 4. & 5. Process each finding from the LLM
        CONSTANT finalFindings = []
        FOR EACH finding IN llmFindings
            -- A "finding" can be a newly identified relationship or an opinion on an existing one.
            -- The LLM is expected to provide enough detail to differentiate.
            
            -- For new relationships identified in this global pass
            IF finding.isNewRelationship THEN
                -- TDD Anchor-- TEST that the scoring service is called for each newly identified relationship.
                CONSTANT initialScore = this.ConfidenceScoringService.getInitialScoreFromLlm(finding.details)
                
                -- Create a structured finding object for the event
                CONSTANT newFinding = {
                    type-- "NEW_GLOBAL_RELATIONSHIP",
                    source-- workerName,
                    details-- finding.details,
                    initialScore-- initialScore
                }
                finalFindings.push(newFinding)
            ELSE -- For opinions on relationships from lower-level passes
                -- TDD Anchor-- TEST that opinions on existing relationships are correctly structured.
                CONSTANT opinionFinding = {
                    type-- "OPINION",
                    source-- workerName,
                    targetRelationshipId-- finding.relationshipId, -- ID of the relationship being evaluated
                    opinion-- finding.opinion, -- e.g., "CONFIRMED", "REJECTED", "MODIFIED"
                    confidence-- finding.confidence
                }
                finalFindings.push(opinionFinding)
            END IF
        END FOR

        -- 6. Construct the event payload
        -- TDD Anchor-- TEST that the final event payload is structured correctly with all findings.
        CONSTANT eventPayload = {
            runId-- runId,
            source-- workerName,
            findings-- finalFindings
        }

        -- 7. Publish the completion event
        -- TDD Anchor-- TEST that the queueManager is called to publish the event with the correct name and payload.
        this.queueManager.publishEvent("global-analysis-completed", eventPayload)

        this.logger.info(`Successfully completed global resolution for runId-- ${runId}`)

    CATCH error
        -- TDD Anchor-- TEST that any exception during the process is caught, logged, and does not crash the worker.
        this.logger.error(`Error in GlobalResolutionWorker for runId-- ${runId}-- ${error.message}`)
        -- Optionally, publish a failure event
        this.queueManager.publishEvent("global-analysis-failed", { runId-- runId, error-- error.message })
    END TRY
END FUNCTION
```

### 2.3. Helper Function-- `buildGlobalContext` (Conceptual)

```pseudocode
FUNCTION buildGlobalContext(summaries)
    -- This function concatenates directory summaries into a single string.
    -- It adds separators to make it easily parsable by the LLM.
    
    CONSTANT contextParts = []
    FOR EACH summary IN summaries
        contextParts.push(`--- DIRECTORY-- ${summary.directoryPath} ---\n${summary.summaryText}\n`)
    END FOR
    
    RETURN contextParts.join("\n")
END FUNCTION