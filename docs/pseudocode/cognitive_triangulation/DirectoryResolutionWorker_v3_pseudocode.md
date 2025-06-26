# Pseudocode-- DirectoryResolutionWorker (v3 - Revised)

This document outlines the revised logic for the `DirectoryResolutionWorker`. It now creates directory summaries, ensures its output conforms to the `AnalysisCompletedEvent` schema, and uses transactions for database operations.

## 1. Dependencies

-- **Service** -- **Purpose**
-- --- -- ---
-- `DatabaseService` -- Handles all SQLite database interactions, including transactions.
-- `LlmClient` -- Communicates with the Large Language Model for analysis.
-- `ConfidenceScoringService` -- Calculates confidence scores for findings.
-- `HashingService` -- Creates deterministic hashes for relationships.
-- `QueueService` -- For adding completion events to the queue.
-- `Logger` -- For structured logging.

## 2. Class-- DirectoryResolutionWorker

### FUNCTION `processJob(job)`

**INPUTS**:
-   `job`: An object containing `{ runId, directoryPath, jobId }`.

**OUTPUT**:
-   Publishes a `directory-analysis-completed` event.
-   Persists a directory summary to the database.

**LOGIC**:

1.  **Initialization**
    -   Extract `runId`, `directoryPath`, `jobId` from `job.data`.
    -   Log the start of the job processing.
    -   `TEST-- 'Job should fail gracefully if runId or directoryPath is missing.'`

2.  **Data Fetching**
    -   `poisInDirectory` = `DatabaseService.getPoisForDirectory(runId, directoryPath)`.
    -   `relationshipsInDirectory` = `DatabaseService.getRelationshipsForDirectory(runId, directoryPath)`.
    -   IF `poisInDirectory` is empty, log a message and finish job (nothing to analyze).

3.  **LLM Analysis**
    -   `llmContext` = `this.buildLlmContext(poisInDirectory, relationshipsInDirectory)`.
    -   `llmResponse` = `LlmClient.analyzeDirectory(llmContext)`.
    -   `TEST-- 'LlmClient should be called with a context of all POIs and existing relationships in the directory.'`
    -   `relationshipsFoundByLlm` = a map of relationship hashes to the raw LLM output for easy lookup.

4.  **Process Findings and Create Summary**
    -   `findings` = empty list
    -   FOR EACH `relationship` in `relationshipsInDirectory`:
        -   `relationshipHash` = `HashingService.createRelationshipHash(relationship.sourcePoiId, relationship.targetPoiId, relationship.type)`.
        -   `wasFoundInThisPass` = `relationshipsFoundByLlm.has(relationshipHash)`.
        -   `rawLlmOutput` = `wasFoundInThisPass ? relationshipsFoundByLlm.get(relationshipHash) : null`.
        -   `score` = `ConfidenceScoringService.getInitialScore({ wasFound: wasFoundInThisPass, llmOutput: rawLlmOutput }, { source: 'DirectoryResolutionWorker' })`.
        -   `TEST-- 'A finding should be created for every relationship evaluated, regardless of outcome.'`

        -   Create `finding` object:
            -   `relationshipHash`: `relationshipHash`
            -   `foundRelationship`: `wasFoundInThisPass`
            -   `initialScore`: `score`
            -   `rawLlmOutput`: `rawLlmOutput`
        -   ADD `finding` to `findings` list.

5.  **Persist Directory Summary**
    -   `highSignalPois` = `this.extractHighSignalPois(poisInDirectory, llmResponse)`.
    -   `directorySummary` = `{ qualifiedNames: highSignalPois.map(p => p.qualifiedName) }`.
    -   `TEST-- 'High-signal POIs like exports and public classes should be identified for the summary.'`

    -   BEGIN TRANSACTION with `DatabaseService`
        -   `TEST-- 'Directory summary persistence must be in a transaction.'`
        -   TRY
            -   `DatabaseService.saveDirectorySummary(runId, directoryPath, directorySummary)`.
            -   COMMIT TRANSACTION
        -   CATCH `dbError`
            -   ROLLBACK TRANSACTION
            -   `Logger.error("Failed to save directory summary.")`
            -   THROW `dbError`
        -   END TRY-CATCH

6.  **Event Publication**
    -   Create `AnalysisCompletedEvent` payload:
        -   `runId`: `runId`
        -   `jobId`: `jobId`
        -   `sourceWorker`: "DirectoryResolutionWorker"
        -   `findings`: `findings`
    -   `QueueService.add('directory-analysis-completed', eventPayload)`.
    -   `TEST-- 'The final event payload must strictly adhere to the AnalysisCompletedEvent schema.'`

END FUNCTION

### FUNCTION `buildLlmContext(pois, relationships)`

**INPUTS**:
-   `pois`: List of POI objects.
-   `relationships`: List of relationship objects from the file-pass.

**OUTPUT**:
-   A string or structured object representing the context for the LLM.

**LOGIC**:

1.  Format the list of POIs and their properties.
2.  Format the list of relationships already identified as candidates for validation.
3.  Combine them into a clear prompt for the LLM.
4.  RETURN formatted context.

END FUNCTION

### FUNCTION `extractHighSignalPois(pois, llmResponse)`

**INPUTS**:
-   `pois`: The original list of POIs in the directory.
-   `llmResponse`: The output from the LLM, which might contain metadata.

**OUTPUT**:
-   A list of POI objects considered "high-signal".

**LOGIC**:

1.  `highSignalPois` = empty list
2.  FOR EACH `poi` in `pois`:
    -   IF `poi` is an exported function, a public class, or identified by the LLM as a key entry point:
        -   ADD `poi` to `highSignalPois`.
3.  RETURN `highSignalPois`.

END FUNCTION