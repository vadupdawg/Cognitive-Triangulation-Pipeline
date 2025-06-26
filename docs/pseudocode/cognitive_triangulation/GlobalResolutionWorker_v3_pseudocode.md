# Pseudocode-- GlobalResolutionWorker (v3 - Revised)

This document outlines the revised logic for the `GlobalResolutionWorker`. It now correctly fetches directory summaries from the new `directory_summaries` table, ensures its output conforms to the `AnalysisCompletedEvent` schema, and provides the final layer of analysis.

## 1. Dependencies

-- **Service** -- **Purpose**
-- --- -- ---
-- `DatabaseService` -- Handles all SQLite database interactions.
-- `LlmClient` -- Communicates with the Large Language Model for analysis.
-- `ConfidenceScoringService` -- Calculates confidence scores for findings.
-- `HashingService` -- Creates deterministic hashes for relationships.
-- `QueueService` -- For adding completion events to the queue.
-- `Logger` -- For structured logging.

## 2. Class-- GlobalResolutionWorker

### FUNCTION `processJob(job)`

**INPUTS**:
-   `job`: An object containing `{ runId, jobId }`.

**OUTPUT**:
-   Publishes a `global-analysis-completed` event.

**LOGIC**:

1.  **Initialization**
    -   Extract `runId`, `jobId` from `job.data`.
    -   Log the start of the job processing.
    -   `TEST-- 'Job should fail gracefully if runId is missing.'`

2.  **Data Fetching**
    -   `directorySummaries` = `DatabaseService.getDirectorySummariesForRun(runId)`.
    -   `TEST-- 'Worker must fetch summaries from the new directory_summaries table.'`
    -   `relationshipsToEvaluate` = `DatabaseService.getAllRelationshipsForRun(runId)`.
    -   IF `directorySummaries` is empty, log a message and finish job (nothing to analyze).

3.  **LLM Analysis**
    -   `llmContext` = `this.buildLlmContext(directorySummaries, relationshipsToEvaluate)`.
    -   `llmResponse` = `LlmClient.analyzeGlobally(llmContext)`.
    -   `TEST-- 'LlmClient should be called with a context of all directory summaries.'`
    -   `relationshipsFoundByLlm` = a map of relationship hashes to the raw LLM output for easy lookup.

4.  **Process Findings**
    -   `findings` = empty list
    -   FOR EACH `relationship` in `relationshipsToEvaluate`:
        -   `relationshipHash` = `HashingService.createRelationshipHash(relationship.sourcePoiId, relationship.targetPoiId, relationship.type)`.
        -   `wasFoundInThisPass` = `relationshipsFoundByLlm.has(relationshipHash)`.
        -   `rawLlmOutput` = `wasFoundInThisPass ? relationshipsFoundByLlm.get(relationshipHash) : null`.
        -   `score` = `ConfidenceScoringService.getInitialScore({ wasFound: wasFoundInThisPass, llmOutput: rawLlmOutput }, { source: 'GlobalResolutionWorker' })`.
        -   `TEST-- 'A finding must be created for every relationship in the run.'`

        -   Create `finding` object:
            -   `relationshipHash`: `relationshipHash`
            -   `foundRelationship`: `wasFoundInThisPass`
            -   `initialScore`: `score`
            -   `rawLlmOutput`: `rawLlmOutput`
        -   ADD `finding` to `findings` list.

5.  **Event Publication**
    -   Create `AnalysisCompletedEvent` payload:
        -   `runId`: `runId`
        -   `jobId`: `jobId`
        -   `sourceWorker`: "GlobalResolutionWorker"
        -   `findings`: `findings`
    -   `QueueService.add('global-analysis-completed', eventPayload)`.
    -   `TEST-- 'The final event payload must strictly adhere to the AnalysisCompletedEvent schema.'`
    -   `TEST-- 'The publication of this event should trigger the final validation process.'`

END FUNCTION

### FUNCTION `buildLlmContext(summaries, relationships)`

**INPUTS**:
-   `summaries`: List of directory summary objects.
-   `relationships`: List of all relationship objects for the run.

**OUTPUT**:
-   A string or structured object representing the context for the LLM.

**LOGIC**:

1.  Format the list of directory summaries, highlighting the key POIs in each.
2.  Format the list of candidate relationships that need a final, global-level opinion.
3.  Combine them into a clear, high-level prompt for the LLM to find architectural patterns.
4.  RETURN formatted context.

END FUNCTION