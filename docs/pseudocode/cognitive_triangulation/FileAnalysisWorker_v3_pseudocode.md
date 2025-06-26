# Pseudocode-- FileAnalysisWorker (v3 - Revised)

This document outlines the revised logic for the `FileAnalysisWorker`, ensuring its output conforms to the `AnalysisCompletedEvent` schema and that database operations are atomic.

## 1. Dependencies

-- **Service** -- **Purpose**
-- --- -- ---
-- `DatabaseService` -- Handles all SQLite database interactions, including transactions.
-- `LlmClient` -- Communicates with the Large Language Model for analysis.
-- `ConfidenceScoringService` -- Calculates initial confidence scores for findings.
-- `HashingService` -- Creates deterministic hashes for relationships.
-- `QueueService` -- For adding completion events to the queue.
-- `Logger` -- For structured logging.
-- `FileSystem` -- For reading file content.

## 2. Class-- FileAnalysisWorker

### FUNCTION `processJob(job)`

**INPUTS**:
-   `job`: An object containing `{ runId, filePath, jobId }`.

**OUTPUT**:
-   Publishes a `file-analysis-completed` event.
-   Persists POIs and initial relationships to the database.

**LOGIC**:

1.  **Initialization**
    -   Extract `runId`, `filePath`, `jobId` from `job.data`.
    -   Log the start of the job processing.
    -   `TEST-- 'Job should fail gracefully if runId or filePath is missing.'`

2.  **File Reading**
    -   `fileContent` = `FileSystem.readFile(filePath)`.
    -   IF `fileContent` is empty or read fails, log an error and terminate job.

3.  **LLM Analysis with Fallback**
    -   `llmAnalysisResult` = NULL
    -   TRY
        -   `llmAnalysisResult` = `LlmClient.analyzeFile(fileContent)`.
        -   `TEST-- 'LlmClient should be called with the correct file content.'`
    -   CATCH `error`
        -   `Logger.warn("LLM analysis failed, attempting regex fallback.")`
        -   `llmAnalysisResult` = `this.performRegexFallback(fileContent)`.
        -   `TEST-- 'Regex fallback should be triggered if LlmClient throws an error.'`

4.  **Data Processing and Persistence**
    -   `findings` = empty list
    -   `poisToSave` = `llmAnalysisResult.pois`
    -   `relationshipsToSave` = empty list

    -   BEGIN TRANSACTION with `DatabaseService`
        -   `TEST-- 'All database operations must be wrapped in a single transaction.'`
        -   TRY
            -   Save all POIs from `llmAnalysisResult.pois`.
            -   `poiIdMap` = map of qualified POI names to their new database IDs.

            -   FOR EACH `relationship` in `llmAnalysisResult.relationships`:
                -   `sourcePoiId` = `poiIdMap.get(relationship.source.qualifiedName)`
                -   `targetPoiId` = `poiIdMap.get(relationship.target.qualifiedName)`
                -   IF `sourcePoiId` or `targetPoiId` is missing, log a warning and continue to next relationship.

                -   `relationshipHash` = `HashingService.createRelationshipHash(sourcePoiId, targetPoiId, relationship.type)`.
                -   `TEST-- 'HashingService must be used to generate the relationship hash.'`

                -   `initialScore` = `ConfidenceScoringService.getInitialScore(relationship, { source: 'FileAnalysisWorker' })`.
                -   `TEST-- 'ConfidenceScoringService must be called for each potential relationship.'`

                -   Create `finding` object:
                    -   `relationshipHash`: `relationshipHash`
                    -   `foundRelationship`: `true`
                    -   `initialScore`: `initialScore`
                    -   `rawLlmOutput`: `relationship.rawLlmPayload`
                -   ADD `finding` to `findings` list.

                -   Create `dbRelationship` object:
                    -   `runId`, `sourcePoiId`, `targetPoiId`, `type`, `label`
                    -   `confidenceScore`: `initialScore`
                    -   `status`: 'PENDING_VALIDATION'
                -   ADD `dbRelationship` to `relationshipsToSave` list.

            -   `DatabaseService.saveInitialRelationships(relationshipsToSave)`.

            -   COMMIT TRANSACTION
        -   CATCH `dbError`
            -   ROLLBACK TRANSACTION
            -   `Logger.error("Database transaction failed.")`
            -   THROW `dbError`
        -   END TRY-CATCH

5.  **Event Publication**
    -   Create `AnalysisCompletedEvent` payload:
        -   `runId`: `runId`
        -   `jobId`: `jobId`
        -   `sourceWorker`: "FileAnalysisWorker"
        -   `findings`: `findings`
    -   `QueueService.add('file-analysis-completed', eventPayload)`.
    -   `TEST-- 'The final event payload must strictly adhere to the AnalysisCompletedEvent schema.'`
    -   `TEST-- 'The findings array must contain valid Finding objects.'`

END FUNCTION

### FUNCTION `performRegexFallback(fileContent)`

**INPUTS**:
-   `fileContent`: String

**OUTPUT**:
-   An object `{ pois, relationships }`.

**LOGIC**:

1.  `pois` = empty list
2.  Apply simple, language-agnostic regex to find function/class declarations.
3.  For each match, create a POI object.
4.  `TEST-- 'Fallback should extract function names as POIs.'`
5.  RETURN `{ pois: pois, relationships: [] }` -- Fallback does not identify relationships.

END FUNCTION