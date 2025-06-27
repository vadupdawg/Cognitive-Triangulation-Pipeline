# Pseudocode-- DirectoryResolutionWorker (v2 - Transactional Outbox Fix)

This document outlines the detailed, language-agnostic pseudocode for the `DirectoryResolutionWorker`, revised to implement the Transactional Outbox Pattern.

## 1. Constants and Configuration

```
CONSTANT QUEUE_NAME = "directory-resolution-queue"
CONSTANT COMPLETION_EVENT_NAME = "directory-analysis-completed"
CONSTANT WORKER_SOURCE_NAME = "DirectoryResolutionWorker"
CONSTANT SCORE_IF_NOT_FOUND = 0.1
```

## 2. Class Definition

```pseudocode
CLASS DirectoryResolutionWorker

  //-- Dependencies injected during instantiation
  PRIVATE worker
  PRIVATE dbService
  PRIVATE llmClient
  PRIVATE confidenceScorer
  PRIVATE hashingService
  PRIVATE logger

  //-- TDD ANCHOR-- TEST-- The constructor should correctly initialize the worker to listen to the specified queue.
  CONSTRUCTOR(queueName, services)
    this.dbService = services.databaseService
    this.llmClient = services.llmClient
    this.confidenceScorer = services.confidenceScoringService
    this.hashingService = services.hashingService
    this.logger = services.logger

    //-- Initialize the worker to process jobs from the queue, binding the `processJob` method.
    this.worker = services.queueService.createWorker(queueName, this.processJob.bind(this))
    this.logger.info("DirectoryResolutionWorker initialized and listening on queue-- " + QUEUE_NAME)
  END CONSTRUCTOR

  //--------------------------------------------------------------------
  //-- Main Job Processing Logic
  //--------------------------------------------------------------------

  //-- TDD ANCHOR-- TEST-- The processJob method should execute the full analysis and event publication flow.
  ASYNC FUNCTION processJob(job)
    //-- INPUT-- job object with properties `id` and `data` { runId, directoryPath }
    //-- OUTPUT-- None. Side effects are atomic DB writes (evidence + outbox event).
    CONSTANT runId = job.data.runId
    CONSTANT directoryPath = job.data.directoryPath
    CONSTANT jobId = job.id

    this.logger.info("Starting DirectoryResolutionWorker job " + jobId + " for directory-- " + directoryPath)

    TRY
      //-- 1. Fetch all relevant data for the directory from the database
      //-- TDD ANCHOR-- TEST-- Fetches all POIs for the specified directory and runId.
      CONSTANT poisInDirectory = this.dbService.getPoisForDirectory(runId, directoryPath)
      
      //-- TDD ANCHOR-- TEST-- Fetches all pre-existing relationships for the directory to be re-evaluated.
      CONSTANT relationshipsToEvaluate = this.dbService.getRelationshipsForDirectory(runId, directoryPath)

      //-- Handle case where there's nothing to analyze
      IF poisInDirectory IS EMPTY AND relationshipsToEvaluate IS EMPTY THEN
        this.logger.warn("No POIs or relationships found for directory-- " + directoryPath + ". Job " + jobId + " will be skipped.")
        RETURN //-- Exit gracefully
      END IF

      //-- 2. Construct context and query the LLM
      //-- TDD ANCHOR-- TEST-- Constructs a clear and comprehensive context for the LLM from the directory's POIs.
      CONSTANT llmContext = buildLlmContextFromPois(poisInDirectory)

      //-- TDD ANCHOR-- TEST-- Successfully calls the LLM with the directory context.
      CONSTANT llmResponse = this.llmClient.analyzeDirectoryRelationships(llmContext)
      
      //-- TDD ANCHOR-- TEST-- Correctly parses the LLM response to extract relationship data.
      CONSTANT relationshipsFoundByLlm = parseLlmResponseForRelationships(llmResponse)

      //-- 3. Evaluate relationships and generate findings
      CONSTANT findings = CREATE_LIST()
      FOR EACH rel IN relationshipsToEvaluate
        CONSTANT wasFoundInThisPass = checkIfRelationshipExists(rel, relationshipsFoundByLlm)
        DECLARE score
        DECLARE rawLlmOutputForFinding

        IF wasFoundInThisPass THEN
          //-- TDD ANCHOR-- TEST-- (Happy Path) Correctly identifies a confirmed relationship and gets its confidence score.
          rawLlmOutputForFinding = getRawLlmOutputForRelationship(rel, llmResponse)
          score = this.confidenceScorer.getInitialScoreFromLlm(rawLlmOutputForFinding)
        ELSE
          //-- TDD ANCHOR-- TEST-- (Negative Path) Correctly identifies a relationship that was NOT confirmed and assigns a low score.
          score = SCORE_IF_NOT_FOUND
          rawLlmOutputForFinding = NULL
        END IF

        CONSTANT relationshipHash = this.hashingService.createRelationshipHash(rel.source, rel.target, rel.type)
        CONSTANT finding = {
          relationshipHash: relationshipHash,
          foundRelationship: wasFoundInThisPass,
          initialScore: score,
          rawLlmOutput: rawLlmOutputForFinding 
        }
        ADD finding TO findings
      END FOR

      //-- 4. Persist results and create outbox event within a single transaction
      //-- TDD ANCHOR-- TEST-- All database writes (evidence, outbox) should be in a single transaction
      TRY
        this.dbService.beginTransaction()

        //-- 4a. Write the full evidence payload to the database
        CONSTANT evidencePayload = {
            runId: runId,
            jobId: jobId,
            sourceWorker: WORKER_SOURCE_NAME,
            findings: findings
        }
        this.dbService.saveEvidenceBatch(evidencePayload)
        this.logger.info("Saved " + findings.length + " evidence findings for job " + jobId)
        
        //-- 4b. Write the lightweight event notification to the outbox
        CONSTANT outboxPayload = {
          runId: runId,
          jobId: jobId,
          sourceWorker: WORKER_SOURCE_NAME,
          findingsCount: findings.length
        }
        CONSTANT outboxEvent = {
          eventName: COMPLETION_EVENT_NAME,
          payload: outboxPayload
        }

        //-- TDD ANCHOR-- TEST-- processJob should write a "directory-analysis-completed" event to the outbox table
        //-- TDD ANCHOR-- TEST-- processJob should NOT call the queue service or event emitter directly
        this.dbService.insertIntoOutbox(outboxEvent)
        this.logger.info("Saved '" + COMPLETION_EVENT_NAME + "' event to outbox for job " + jobId)

        //-- TDD ANCHOR-- TEST-- The transaction should commit successfully on valid data
        this.dbService.commitTransaction()
      CATCH DbError as dbError
        //-- TDD ANCHOR-- TEST-- The transaction should roll back on any database error
        this.logger.error("Database transaction failed for job " + jobId + ". Rolling back. Error-- " + dbError.message)
        this.dbService.rollbackTransaction()
        THROW dbError
      ENDTRY

    CATCH error
      //-- TDD ANCHOR-- TEST-- Catches errors during processing, logs them, and allows the job to fail correctly.
      this.logger.error("Error in DirectoryResolutionWorker job " + jobId + "-- " + error.message)
      //-- Re-throw the error to let the queue manager handle the failure (e.g., retries, move to failed)
      THROW error
    END TRY

  END FUNCTION

END CLASS