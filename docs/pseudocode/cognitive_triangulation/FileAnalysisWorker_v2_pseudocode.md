# Pseudocode-- FileAnalysisWorker (v2 - Transactional Outbox Fix)

This document provides detailed, language-agnostic pseudocode for the `FileAnalysisWorker` class, revised to implement the Transactional Outbox Pattern.

## 1. Dependencies

- `QueueService`-- An abstraction for the message queue (e.g., BullMQ), used to create the worker instance.
- `FileSystem`-- An abstraction for reading files.
- `LlmClient`-- Client to interact with the Language Model.
- `HashingService`-- Service to create unique hashes for relationships.
- `ConfidenceScoringService`-- Service to calculate initial confidence scores.
- `DatabaseService`-- An abstraction for the SQLite database, supporting transactions.
- `Logger`-- For structured logging.

## 2. Class Definition

```pseudocode
CLASS FileAnalysisWorker

  //-- Properties
  PRIVATE worker
  PRIVATE queueService
  PRIVATE fileSystem
  PRIVATE llmClient
  PRIVATE hashingService
  PRIVATE confidenceScoringService
  PRIVATE databaseService
  PRIVATE logger

  //--------------------------------------------------------------------------
  //-- Constructor
  //--------------------------------------------------------------------------
  FUNCTION constructor(queueName, services)
    //-- TEST-- 'Constructor should initialize all required services'
    //-- TEST-- 'Constructor should bind processJob to the worker'
    
    //-- Assign injected services
    this.queueService = services.queueService
    this.fileSystem = services.fileSystem
    this.llmClient = services.llmClient
    this.hashingService = services.hashingService
    this.confidenceScoringService = services.confidenceScoringService
    this.databaseService = services.databaseService
    this.logger = services.logger

    //-- Initialize the worker to listen on the specified queue
    //-- The `processJob` function is bound to the current instance context
    this.worker = this.queueService.createWorker(queueName, this.processJob.bind(this))

    this.logger.info("FileAnalysisWorker initialized and listening on queue-- " + queueName)
  ENDFUNCTION

  //--------------------------------------------------------------------------
  //-- Main Job Processing Logic
  //--------------------------------------------------------------------------
  ASYNC FUNCTION processJob(job)
    //-- INPUT-- job (Object)-- Contains job.id and job.data { runId, filePath }
    //-- OUTPUT-- None. Side effects are atomic DB writes (evidence + outbox event).

    //-- Extract data from the job payload
    CONSTANT runId = job.data.runId
    CONSTANT filePath = job.data.filePath
    this.logger.info("Starting analysis for file-- " + filePath + " with runId-- " + runId)

    CONSTANT fileContent = this.fileSystem.readFile(filePath)
    
    //-- Handle case where file is unreadable or empty
    IF fileContent IS NULL OR EMPTY THEN
      this.logger.error("Could not read or file is empty-- " + filePath)
      RETURN
    ENDIF

    VARIABLE analysisResult

    TRY
      //-- TEST-- 'If LLM parsing succeeds, it should return POIs and relationships'
      analysisResult = this.llmClient.analyzeFile(fileContent)
      analysisResult.isFallback = FALSE
    CATCH LlmError as error
      //-- TEST-- 'If LLM parsing fails, FileAnalysisWorker should trigger the regex fallback'
      this.logger.warn("LLM analysis failed for " + filePath + ". Falling back to regex. Error-- " + error.message)
      analysisResult = this.performRegexFallback(fileContent)
      analysisResult.isFallback = TRUE
    ENDTRY

    //-- Process the results, whether from LLM or fallback
    CONSTANT pois = analysisResult.pois
    CONSTANT relationshipsToProcess = analysisResult.relationships
    CONSTANT processedRelationships = CREATE_LIST()

    //-- TEST-- 'FileAnalysisWorker should process each relationship found'
    FOR EACH rel IN relationshipsToProcess
      VARIABLE initialScore
      VARIABLE parseStatus

      IF analysisResult.isFallback IS TRUE THEN
        //-- TEST-- 'Relationships from the fallback should have a low confidence score and an UNRELIABLE_PARSE status'
        initialScore = 0.05 //-- Fixed low score for unreliable data
        parseStatus = 'UNRELIABLE_PARSE'
      ELSE
        //-- TEST-- 'FileAnalysisWorker should call ConfidenceScoringService for each found relationship'
        initialScore = this.confidenceScoringService.getInitialScoreFromLlm(rel, { filePath: filePath })
        parseStatus = 'LLM_SUCCESS'
      ENDIF

      //-- Create a new relationship object with additional metadata
      CONSTANT processedRel = {
        ...rel,
        runId: runId,
        confidenceScore: initialScore,
        status: 'PENDING_VALIDATION',
        parseStatus: parseStatus
      }
      
      ADD processedRel TO processedRelationships
    ENDFOR

    //-- Prepare evidence findings from processed relationships
    CONSTANT findings = CREATE_LIST()
    FOR EACH rel IN processedRelationships
      //-- TEST-- 'FileAnalysisWorker should use the official HashingService to create relationship hashes'
      CONSTANT relationshipHash = this.hashingService.createRelationshipHash(rel.source, rel.target, rel.type)
      ADD {
        relationshipHash: relationshipHash,
        foundRelationship: TRUE,
        initialScore: rel.confidenceScore,
        status: rel.parseStatus
      } TO findings
    ENDFOR

    //-- Persist results and create outbox event within a single transaction
    //-- TEST-- 'All database writes (POIs, relationships, evidence, outbox) should be in a single transaction'
    TRY
        this.databaseService.beginTransaction()

        //-- Save POIs, Relationships, and Evidence
        this.databaseService.savePois(pois)
        this.databaseService.saveRelationships(processedRelationships)
        this.databaseService.saveEvidenceBatch({
            runId: runId,
            jobId: job.id,
            sourceWorker: 'FileAnalysisWorker',
            findings: findings
        })
        this.logger.info("Saved " + pois.length + " POIs and " + processedRelationships.length + " relationships/evidence for " + filePath)

        //-- Prepare and save the lightweight outbox event
        CONSTANT outboxPayload = {
          runId: runId,
          jobId: job.id,
          sourceWorker: 'FileAnalysisWorker',
          findingsCount: findings.length
        }
        CONSTANT outboxEvent = {
            eventName: 'file-analysis-completed',
            payload: outboxPayload
        }
        
        //-- TEST-- 'processJob should write a "file-analysis-completed" event to the outbox table'
        //-- TEST-- 'processJob should NOT call the queue service directly'
        this.databaseService.insertIntoOutbox(outboxEvent)
        this.logger.info("Saved 'file-analysis-completed' event to outbox for " + filePath)

        //-- TEST-- 'The transaction should commit successfully on valid data'
        this.databaseService.commitTransaction()
    CATCH DbError as dbError
        //-- TEST-- 'The transaction should roll back on any database error'
        this.logger.error("Database transaction failed for " + filePath + ". Rolling back. Error-- " + dbError.message)
        this.databaseService.rollbackTransaction()
        THROW dbError //-- Re-throw to let the job fail
    ENDTRY

  ENDFUNCTION

  //--------------------------------------------------------------------------
  //-- Regex Fallback Logic
  //--------------------------------------------------------------------------
  FUNCTION performRegexFallback(fileContent)
    //-- INPUT-- fileContent (String)-- The raw content of the file.
    //-- OUTPUT-- Object { pois, relationships }

    this.logger.info("Executing regex fallback.")
    CONSTANT pois = CREATE_LIST()
    
    //-- Example-- Define a regex to find simple function declarations in JavaScript
    CONSTANT functionRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g
    
    VARIABLE match
    WHILE (match = functionRegex.exec(fileContent)) IS NOT NULL
      CONSTANT poiName = match[1]
      CONSTANT newPoi = {
        name: poiName,
        type: 'Function',
        qualifiedName: 'REGEX_FALLBACK::' + poiName, 
        sourceFile: 'TBD' //-- filePath would be added in the main flow
      }
      ADD newPoi TO pois
    ENDWHILE

    this.logger.info("Regex fallback found " + pois.length + " potential POIs.")
    
    //-- This method does not attempt to find relationships, as it's unreliable
    RETURN { pois: pois, relationships: [] }
  ENDFUNCTION

ENDCLASS