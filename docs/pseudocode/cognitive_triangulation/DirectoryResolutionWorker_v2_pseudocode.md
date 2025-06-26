# Pseudocode-- DirectoryResolutionWorker (v2)

This document outlines the detailed, language-agnostic pseudocode for the `DirectoryResolutionWorker`. It serves as a logical blueprint for implementation, detailing the process of analyzing points of interest (POIs) within a directory to find cross-file relationships.

## 1. Class-- DirectoryResolutionWorker

### 1.1. Overview

Processes jobs from the `directory-resolution-queue`. Its main function is to perform a second-pass analysis on a directory after individual file analyses are complete, focusing on inter-file relationships.

### 1.2. Dependencies

-- `logger`-- For structured logging.
-- `sqliteDb`-- Database client to access POIs and existing relationships.
-- `LlmClient`-- A generic client to interact with a Large Language Model.
-- `ConfidenceScoringService`-- Service to calculate confidence scores for findings.
-- `eventPublisher`-- A client (e.g., BullMQ) to publish events to a queue.

### 1.3. Methods

#### **FUNCTION** `processJob(job)`

**Purpose**-- Main entry point for processing a single directory analysis job.

**INPUT**--
- `job` (Object)-- The job object containing the data for the task.
  - `job.data.runId` (String)-- The unique identifier for the analysis run.
  - `job.data.directoryPath` (String)-- The path to the directory to be analyzed.

**OUTPUT**-- None. The function publishes an event upon completion.

**BEGIN**
  `logger.info("Starting DirectoryResolutionWorker job for directory-- " + job.data.directoryPath)`

  **TRY**
    -- Deconstruct job data for clarity
    `runId = job.data.runId`
    `directoryPath = job.data.directoryPath`

    -- 1. Fetch all POIs within the target directory from the database.
    -- TEST-- Ensure the database query correctly retrieves all POIs for the specified directory and runId.
    `directoryPois = sqliteDb.query("SELECT * FROM pois WHERE runId = ? AND filePath LIKE ?", [runId, directoryPath + '%'])`

    -- If no POIs exist, there's nothing to analyze.
    -- TEST-- Verify the worker handles directories with no POIs gracefully and exits.
    **IF** `directoryPois` is empty **THEN**
      `logger.warn("No POIs found for directory-- " + directoryPath + ". Skipping analysis.")`
      -- Publish an event with empty findings to signal completion to the coordinator.
      `publishCompletionEvent(runId, directoryPath, [])`
      **RETURN**
    **END IF**

    -- 2. Fetch relationships previously identified in the file-pass for these POIs.
    -- This is crucial for re-evaluation.
    `poiIds = extract_ids_from(directoryPois)`
    -- TEST-- Ensure previously found relationships are correctly retrieved for the set of POIs.
    `filePassRelationships = sqliteDb.query("SELECT * FROM relationships WHERE runId = ? AND (sourcePoiId IN (?) OR targetPoiId IN (?))", [runId, poiIds, poiIds])`

    -- 3. Construct context and query the LLM for new relationships.
    -- TEST-- Check that the LLM context is formatted correctly from the list of POIs.
    `llmContext = formatPoisForLlm(directoryPois)`
    `llmPrompt = "Analyze the following points of interest from directory '" + directoryPath + "' and identify all relationships between them-- \n" + llmContext`
    
    -- TEST-- Mock the LLM client to verify it's called with the correct prompt.
    -- TEST-- Handle various LLM responses, including empty, malformed, or error responses.
    `llmResponse = LlmClient.generate(llmPrompt)`
    `llmIdentifiedRelationships = parseLlmResponse(llmResponse)`

    -- 4. Process LLM findings and re-evaluate file-pass relationships.
    `allFindings = []`
    `confirmedRelationshipKeys = new Set()`

    -- Process relationships newly identified by the LLM at the directory level.
    -- TEST-- Ensure a valid finding with a confidence score is created for each relationship from the LLM.
    **FOR EACH** `llmRel` **IN** `llmIdentifiedRelationships`
      `initialScore = ConfidenceScoringService.getInitialScoreFromLlm()`
      `finding = {`
        `sourcePoiId-- llmRel.sourcePoiId,`
        `targetPoiId-- llmRel.targetPoiId,`
        `relationshipType-- llmRel.type,`
        `explanation-- llmRel.explanation,`
        `foundRelationship-- TRUE,`
        `initialScore-- initialScore,`
        `source-- "DirectoryResolutionWorker"`
      `}`
      `allFindings.push(finding)`
      `key = createRelationshipKey(llmRel.sourcePoiId, llmRel.targetPoiId)`
      `confirmedRelationshipKeys.add(key)`
    **END FOR**

    -- Re-evaluate relationships from the file-pass. If not re-confirmed, mark as not found.
    -- TEST-- Verify a 'foundRelationship-- false' finding is created for any file-pass relationship not re-confirmed by the LLM.
    **FOR EACH** `fileRel` **IN** `filePassRelationships`
      `key = createRelationshipKey(fileRel.sourcePoiId, fileRel.targetPoiId)`
      **IF** `confirmedRelationshipKeys.has(key)` is `FALSE` **THEN**
        `finding = {`
          `sourcePoiId-- fileRel.sourcePoiId,`
          `targetPoiId-- fileRel.targetPoiId,`
          `relationshipType-- fileRel.type,`
          `explanation-- "Relationship from file-pass was not confirmed during directory-level analysis.",`
          `foundRelationship-- FALSE,`
          `initialScore-- 0.0,`
          `source-- "DirectoryResolutionWorker"`
        `}`
        `allFindings.push(finding)`
      **END IF**
    **END FOR**

    -- 5. Publish the comprehensive findings as a single event.
    -- TEST-- Ensure the completion event is published with the correct payload structure and contains all generated findings.
    `publishCompletionEvent(runId, directoryPath, allFindings)`

    `logger.info("Successfully completed DirectoryResolutionWorker job for directory-- " + directoryPath)`

  **CATCH** `error`
    -- TEST-- Verify that any exception during job processing is caught, logged, and re-thrown.
    `logger.error("Error in DirectoryResolutionWorker for directory " + job.data.directoryPath + "-- " + error.message)`
    **THROW** `error` -- Propagate the error to allow the queue manager to handle retries or failures.
  **END TRY**
**END FUNCTION**


#### **FUNCTION** `publishCompletionEvent(runId, directoryPath, findings)`

**Purpose**-- Constructs and publishes the `directory-analysis-completed` event.

**INPUT**--
- `runId` (String)
- `directoryPath` (String)
- `findings` (Array of Objects)

**BEGIN**
  `eventPayload = {`
    `runId-- runId,`
    `directoryPath-- directoryPath,`
    `findings-- findings`
  `}`
  `eventName = "directory-analysis-completed"`

  `eventPublisher.publish(eventName, eventPayload)`
  `logger.info("Published '" + eventName + "' for directory-- " + directoryPath)`
**END FUNCTION**