# Specification-- FileAnalysisWorker (v2 - Revised)

This document provides the detailed specification for the modified `FileAnalysisWorker`, which is a core component of the Cognitive Triangulation v2 architecture. This revision incorporates a best-effort parsing fallback and clarifies its data contracts.

## 1. Purpose and Role

The `FileAnalysisWorker` is the first-pass analysis engine. Its responsibility is to process a single file, use an LLM to identify "Points of Interest" (POIs) and intra-file relationships, and perform initial confidence scoring.

A key change in this revision is the introduction of a **"best-effort" regex-based fallback mechanism** to ensure some data is extracted even when the LLM fails, preventing total analysis failure for complex or problematic files.

## 2. Dependencies

-- **Module/Service** -- **Purpose**
-- --- -- ---
-- `bullmq` -- To process jobs from the `file-analysis-queue` and publish completion events.
-- `sqliteDb` -- To store the initial POIs and relationships with a `PENDING_VALIDATION` status.
-- `LlmClient` -- To communicate with the LLM, including retry logic.
-- `ConfidenceScoringService` -- To get the initial confidence score for each relationship.
-- `HashingService` -- A new utility that implements the contract from [`hashing_contracts.md`](./hashing_contracts.md).
-- `logger` -- For structured logging.

## 3. Class Definition-- `FileAnalysisWorker`

### 3.1. Methods

#### `processJob(job)`

-   **Purpose**: The main job processing logic for a single file.
-   **Parameters**:
    -   `job` (Object)-- The BullMQ job object. `job.data` contains `runId` and `filePath`.
-   **Logic**:
    1.  Read the content of `job.data.filePath`.
    2.  Attempt to get POIs and relationships by calling the `LlmClient`, which handles its own retry logic.
    3.  **Error Handling and Fallback**:
        -   If the `LlmClient` call succeeds and the response is valid, proceed to step 4.
        -   If the `LlmClient` call fails after all retries (e.g., due to persistently malformed JSON), **trigger the best-effort fallback**.
            a. Call `this.performRegexFallback(fileContent)`.
            b. The relationships from this fallback will have a very low confidence score and a special status flag.
            c. Proceed to step 4 with the fallback data.
    4.  For each relationship (from either LLM or regex):
        a. Calculate its unique hash using `HashingService.createRelationshipHash()`, adhering to the central contract.
        b. Call `ConfidenceScoringService.getInitialScoreFromLlm()` to get the preliminary score. For fallback relationships, this will be a fixed low value.
        c. Add the `initialScore` and `status: 'PENDING_VALIDATION'` to the relationship object. If from the fallback, also add `parseStatus: 'UNRELIABLE_PARSE'`.
    5.  Save all POIs and scored relationships to the SQLite database.
    6.  Publish a `file-analysis-completed` event for the `ValidationCoordinator`.

### 3.2. New Methods

#### `performRegexFallback(fileContent)`

-   **Purpose**: To extract POIs using simpler, regex-based patterns when the LLM fails. This is an "escape hatch" to prevent a total blind spot.
-   **Parameters**:
    -   `fileContent` (String)-- The raw text content of the file.
-   **Logic**:
    1.  Apply a series of language-specific regular expressions to find potential POIs (e.g., function definitions, class declarations).
    2.  This method is not expected to find complex relationships, but it can identify the primary entities within a file.
    3.  Return a list of POIs and a (likely empty) list of relationships.
-   **Returns**: `Object`-- An object `{ pois, relationships }` with a structure similar to the LLM response, but with relationships assigned a fixed low score (e.g., 0.05) and flagged as unreliable.

## 4. TDD Anchors / Pseudocode Stubs

```
// TEST-- 'FileAnalysisWorker should call ConfidenceScoringService for each found relationship'
// TEST-- 'FileAnalysisWorker should use the official HashingService to create relationship hashes'
// TEST-- 'FileAnalysisWorker should save relationships with a PENDING_VALIDATION status'
// TEST-- 'FileAnalysisWorker should publish a "file-analysis-completed" event'
// TEST-- 'If LLM parsing fails, FileAnalysisWorker should trigger the regex fallback'
// TEST-- 'Relationships from the fallback should have a low confidence score and an UNRELIABLE_PARSE status'

class FileAnalysisWorker {
  constructor(queueName) {
    this.worker = new Worker(queueName, this.processJob.bind(this));
  }

  async processJob(job) {
    const { runId, filePath } = job.data;
    const fileContent = await readFile(filePath);
    let llmResponse;

    try {
      llmResponse = await LlmClient.analyzeFile(fileContent);
    } catch (error) {
      logger.warn(`LLM analysis failed for ${filePath} after all retries. Falling back to regex.`);
      llmResponse = this.performRegexFallback(fileContent);
    }

    const relationships = [];
    for (const rel of llmResponse.relationships) {
      const initialScore = rel.isFallback 
        ? 0.05 
        : ConfidenceScoringService.getInitialScoreFromLlm(rel, { filePath });
      
      relationships.push({
        ...rel,
        confidenceScore: initialScore,
        status: 'PENDING_VALIDATION',
        parseStatus: rel.isFallback ? 'UNRELIABLE_PARSE' : 'LLM_SUCCESS',
        runId: runId
      });
    }

    await sqliteDb.savePois(llmResponse.pois);
    await sqliteDb.saveRelationships(relationships);

    const evidencePayload = {
      runId: runId,
      jobId: job.id,
      sourceWorker: 'FileAnalysisWorker',
      findings: relationships.map(rel => ({
        relationshipHash: HashingService.createRelationshipHash(rel.source, rel.target, rel.type),
        foundRelationship: true,
        initialScore: rel.confidenceScore,
        status: rel.parseStatus
      }))
    };

    await eventQueue.add('file-analysis-completed', evidencePayload);
  }

  performRegexFallback(fileContent) {
    // Simple example for JS
    const functionRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
    const pois = [];
    let match;
    while ((match = functionRegex.exec(fileContent)) !== null) {
      pois.push({ name: match[1], type: 'Function', qualifiedName: `TBD_REGEX::${match[1]}` });
    }
    return { pois, relationships: [] }; // No relationships from regex for now
  }
}