# Pseudocode-- GlobalResolutionWorker (v2 - Transactional Outbox Fix)

This document provides a detailed, language-agnostic pseudocode blueprint for the `GlobalResolutionWorker` class, revised to implement the Transactional Outbox Pattern.

## 1. Overview

The `GlobalResolutionWorker` is responsible for the final, global analysis pass over the entire codebase for a given run. It aggregates directory-level summaries to build a high-level context, asks an LLM to identify cross-directory relationships, and evaluates relationships found in previous, lower-level passes. Its findings are saved to the database, and a completion event is written to the outbox table within a single transaction.

## 2. Dependencies

- **DatabaseService**: An interface to a database (e.g., `sqliteDb`) supporting transactions.
- **QueueService**: An interface to a message queue (e.g., `bullmq`) to create the worker instance.
- **LlmClient**: A client to interact with a Large Language Model.
- **ConfidenceScoringService**: A service to calculate confidence scores for relationships.
- **HashingService**: A service for creating consistent hashes.
- **Logger**: A service for structured logging.

## 3. Class-- GlobalResolutionWorker

### 3.1. Class Structure

```pseudocode
CLASS GlobalResolutionWorker

    // Properties
    PRIVATE worker
    PRIVATE queueService
    PRIVATE dbService
    PRIVATE llmClient
    PRIVATE scoringService
    PRIVATE hashingService
    PRIVATE logger

    // Constructor
    FUNCTION constructor(queueName, services)
        this.queueService = services.queueService
        this.dbService = services.databaseService
        this.llmClient = services.llmClient
        this.scoringService = services.confidenceScoringService
        this.hashingService = services.hashingService
        this.logger = services.logger

        // The worker listens to a specific queue and binds processJob to handle messages
        this.worker = this.queueService.createWorker(queueName, this.processJob.bind(this))
        this.logger.info("GlobalResolutionWorker initialized and listening on queue--" + queueName)
    END FUNCTION

    // Main processing method
    ASYNC FUNCTION processJob(job)
        // ... detailed logic below ...
    END FUNCTION

    // Helper function for building LLM context
    FUNCTION buildLlmContext(directorySummaries)
        // ... detailed logic below ...
    END FUNCTION

END CLASS
```

### 3.2. Method-- `processJob`

This is the primary method that executes the global analysis logic.

```pseudocode
// TEST-- 'GlobalResolutionWorker should successfully process a valid job'
// TEST-- 'GlobalResolutionWorker should handle jobs with no directory summaries gracefully'
// TEST-- 'GlobalResolutionWorker should log an error if the job processing fails'
ASYNC FUNCTION processJob(job)
    TRY
        // 1. Initialization
        this.logger.info("Starting GlobalResolutionWorker job for runId--" + job.data.runId)
        CONSTANT runId = job.data.runId
        CONSTANT jobId = job.id
        CONSTANT findings = [] // An array to hold all findings from this pass

        // 2. Fetch Data
        // TEST-- 'GlobalResolutionWorker should fetch all directory summaries for the run'
        CONSTANT directorySummaries = this.dbService.getDirectorySummaries(runId)

        IF directorySummaries IS EMPTY THEN
            this.logger.warn("No directory summaries found for runId--" + runId + ". Aborting global analysis.")
            RETURN // Exit early
        END IF

        // TEST-- 'GlobalResolutionWorker should fetch all relationships from lower-level passes'
        CONSTANT relationshipsToEvaluate = this.dbService.getAllRelationshipsForRun(runId)

        // 3. LLM Context Construction & Analysis
        CONSTANT llmContext = this.buildLlmContext(directorySummaries)
        CONSTANT llmResponse = this.llmClient.analyzeGlobally(llmContext, relationshipsToEvaluate)
        CONSTANT relationshipsFoundByLlm = llmResponse.relationships // New relationships identified
        CONSTANT llmEvaluations = llmResponse.evaluations // Opinions on existing relationships

        // 4. Evaluate Relationships from Lower-Level Passes
        // TEST-- 'GlobalResolutionWorker should create a "finding" for each relationship it evaluates'
        FOR EACH existingRel IN relationshipsToEvaluate
            CONSTANT evaluation = llmEvaluations.find(e -> e.hash == existingRel.hash)
            IF evaluation IS NOT NULL THEN
                CONSTANT finding = {
                    relationshipHash: existingRel.hash,
                    foundInPass: evaluation.isConfirmed,
                    pass: 'global',
                    score: this.scoringService.getScoreFromLlmEvaluation(evaluation),
                    rawLlmOutput: evaluation.reasoning
                }
                findings.push(finding)
            END IF
        ENDFOR

        // 5. Process Newly Identified Relationships
        // TEST-- 'GlobalResolutionWorker should create a "finding" for each new cross-directory relationship'
        FOR EACH newRel IN relationshipsFoundByLlm
            CONSTANT newRelHash = this.hashingService.createRelationshipHash(newRel)
            CONSTANT finding = {
                relationshipHash: newRelHash,
                foundInPass: TRUE,
                pass: 'global',
                score: this.scoringService.getInitialScoreFromLlm(newRel.raw),
                rawLlmOutput: newRel.raw,
                relationshipData: newRel // Include data for potential insertion
            }
            findings.push(finding)
        ENDFOR
        
        // 6. Persist results and create outbox event within a single transaction
        // TEST-- 'All database writes (evidence, new relationships, outbox) should be in a single transaction'
        TRY
            this.dbService.beginTransaction()

            // 6a. Write the full evidence payload to the database
            CONSTANT evidencePayload = {
                runId: runId,
                jobId: jobId,
                sourceWorker: 'GlobalResolutionWorker',
                findings: findings
            }
            this.dbService.saveEvidenceBatch(evidencePayload)
            
            // 6b. Save any newly discovered relationships
            this.dbService.saveNewRelationshipsFromGlobalPass(findings)

            this.logger.info("Saved " + findings.length + " evidence findings for job " + jobId)

            // 6c. Write the lightweight event notification to the outbox
            CONSTANT outboxPayload = {
              runId: runId,
              jobId: jobId,
              sourceWorker: 'GlobalResolutionWorker',
              findingsCount: findings.length
            }
            CONSTANT outboxEvent = {
              eventName: 'global-analysis-completed',
              payload: outboxPayload
            }

            // TEST-- 'processJob should write a "global-analysis-completed" event to the outbox table'
            // TEST-- 'processJob should NOT call the queue service directly'
            this.dbService.insertIntoOutbox(outboxEvent)
            this.logger.info("Saved 'global-analysis-completed' event to outbox for job " + jobId)
            
            // TEST-- 'The transaction should commit successfully on valid data'
            this.dbService.commitTransaction()
        CATCH DbError as dbError
            // TEST-- 'The transaction should roll back on any database error'
            this.logger.error("Database transaction failed for job " + jobId + ". Rolling back. Error-- " + dbError.message)
            this.dbService.rollbackTransaction()
            THROW dbError
        ENDTRY
        
        this.logger.info("GlobalResolutionWorker job completed for runId--" + runId)
        RETURN

    CATCH error
        this.logger.error("Error processing job in GlobalResolutionWorker for runId--" + job.data.runId, error)
        THROW error
    END TRY
END FUNCTION
```

### 3.3. Helper Method-- `buildLlmContext`

```pseudocode
FUNCTION buildLlmContext(directorySummaries)
    CONSTANT context = "You are a senior software architect. Your task is to analyze the following directory summaries from a codebase to identify high-level, cross-directory relationships and architectural patterns. Focus on interactions *between* these directories."
    
    context += "\n\n== DIRECTORY SUMMARIES ==\n"

    FOR EACH summary IN directorySummaries
        context += "\n--- DIRECTORY: " + summary.directoryPath + " ---\n"
        context += summary.summaryText + "\n"
    ENDFOR

    context += "\n\n== TASK ==\n"
    context += "1. Identify and describe any relationships (e.g., 'uses', 'calls', 'depends_on', 'inherits_from') between entities in DIFFERENT directories.\n"
    context += "2. Re-evaluate the provided list of existing relationships based on this global context. For each one, state if you confirm it and provide a brief reasoning.\n"
    context += "3. Format your response as a JSON object with two keys: 'newRelationships' and 'evaluatedRelationships'."

    RETURN context
END FUNCTION