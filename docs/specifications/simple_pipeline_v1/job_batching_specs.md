# Specification-- Job Batching for Relationship Resolution with Dead-Lettering

**Version--** 1.1.0
**Date--** 2025-06-27
**Status--** Proposed
**Change--** This version addresses the "Partial Batch Failure" risk identified in the Devil's Advocate report (`critique_report_simple_pipeline_v1.md`). The "log-and-continue" error handling has been replaced with a robust dead-lettering mechanism to prevent data loss.

---

## 1. Introduction

This document outlines the specifications for implementing a job batching mechanism within the `TransactionalOutboxPublisher` and a corresponding dead-lettering process in the `RelationshipResolutionWorker`. The goal is to group POIs from a single file analysis into a single job to improve efficiency while ensuring that individual processing failures within a batch do not result in data loss.

This change is based on the "Simplicity-First Path" from `docs/research/architectural_pivot_research_report.md`, amended by the critical recommendations in `docs/devil/critique_report_simple_pipeline_v1.md`.

---

## 2. Functional Requirements

*   **FR1--** The `TransactionalOutboxPublisher` service MUST collect all POIs generated from a single file analysis session.
*   **FR2--** The `TransactionalOutboxPublisher` MUST create a single job for the `RelationshipResolutionWorker` that contains the entire batch of collected POIs.
*   **FR3--** The batched job payload MUST contain the `fileId` and the complete array of POI objects.
*   **FR4--** The `RelationshipResolutionWorker` MUST be updated to correctly parse and process the new batched job format.
*   **FR5--** The `RelationshipResolutionWorker` MUST iterate through every POI in the batch and execute the relationship resolution logic for each one individually.
*   **FR6--** The system's end-to-end behavior MUST remain unchanged for successfully processed POIs-- all relationships must be resolved and stored correctly.
*   **FR7--** If processing a single POI within a batch fails, the worker MUST move the original POI data, along with structured error details, to a dedicated dead-letter data store (`failed_pois` table).

---

## 3. Non-Functional Requirements

*   **NFR1-- Performance--** The number of jobs enqueued to the `relationship-resolution-queue` MUST be reduced from N to 1 for each file processed, where N is the number of POIs found in that file.
*   **NFR2-- Reliability--** The creation and storage of the batched job in the outbox table MUST be atomic and part of the same database transaction that handles the file analysis results.
*   **NFR3-- Error Handling (Revised)--** If processing a single POI within a batch fails, the worker MUST persist the failed POI and associated error information to the `failed_pois` table. The worker MUST then continue processing the remaining POIs in the batch. **No data from a failed POI processing attempt shall be silently dropped.**

---

## 4. System Components Impacted

*   **`src/services/TransactionalOutboxPublisher.js`**-- Core logic for batching.
*   **`src/workers/relationshipResolutionWorker.js`**-- Modified to handle batched payloads and implement dead-lettering on error.
*   **Database Schema--** A new table, `failed_pois`, will be required.

---

## 5. Data Model Specification

### 5.1. Batched Relationship Resolution Job

The job payload sent to the `relationship-resolution-queue` will adhere to the following structure.

**Topic--** `relationship-resolution-queue`

**Payload Structure--**
```json
{
  "jobId": "string -- A unique identifier for the job",
  "fileId": "string -- The unique identifier for the source file of the analysis",
  "pois": [
    {
      "id": "string -- Unique ID for the POI",
      "type": "string -- e.g., 'function_definition', 'class_declaration'",
      "name": "string -- The name of the defined entity",
      "filePath": "string -- The path to the file containing the POI",
      "lineNumber": "integer -- The line number of the POI",
      "rawCode": "string -- The raw source code of the POI",
      "context": "string -- Surrounding code or context for the POI"
    }
  ]
}
```

### 5.2. Dead-Letter POI Record (`failed_pois` Table)

This table stores POIs that failed during processing for later analysis and potential reprocessing.

**Table Name--** `failed_pois`

**Schema--**

-- Column Name -- Data Type -- Description --
-- --- -- --- -- --- --
-- `id` -- `INTEGER` -- Primary Key, auto-incrementing.
-- `originalJobId` -- `TEXT` -- The `jobId` from the batched job.
-- `failedAt` -- `DATETIME` -- Timestamp of when the failure occurred (UTC).
-- `errorMessage` -- `TEXT` -- The error message from the exception.
-- `errorContext` -- `TEXT` -- Additional context, such as a stack trace.
-- `originalPoiData` -- `JSON` -- The complete JSON object of the POI that failed.
-- `status` -- `TEXT` -- The status of the dead-letter record (e.g., 'new', 'reprocessed', 'ignored'). Defaults to 'new'.

---

## 6. Detailed Component Specifications

### Class-- `TransactionalOutboxPublisher`

*   **File Path--** [`src/services/TransactionalOutboxPublisher.js`](src/services/TransactionalOutboxPublisher.js)
*   **Unchanged from previous specification.** The logic for creating the batched job remains the same.

### Worker-- `relationshipResolutionWorker`

*   **File Path--** [`src/workers/relationshipResolutionWorker.js`](src/workers/relationshipResolutionWorker.js)
*   **Description--** Processes batched jobs, executing relationship resolution for each POI and routing any failures to the dead-letter table.

#### Function-- `processJob(job)` (Revised)

*   **Description--** Receives a batched job, parses it, and iterates through the contained POIs. For each POI, it attempts relationship resolution. If an error occurs, it creates a dead-letter record and continues.
*   **Parameters--**
    *   `job` (Object)-- The job object dequeued by the worker.
*   **Returns--** `Promise<void>`-- Resolves when all POIs in the batch have been processed.
*   **Core Logic--**
    1.  Parse the `job.data` string into a JavaScript object.
    2.  Extract the `pois` array and `jobId` from the parsed data.
    3.  If the `pois` array is empty or missing, log a warning and acknowledge the job.
    4.  Loop through each `poi` in the `pois` array.
    5.  Inside the loop, wrap the processing for each `poi` in a `try...catch` block.
    6.  In the `try` block, invoke the relationship resolution logic (e.g., `RelationshipResolver.resolve(poi)`).
    7.  In the `catch (error)` block--
        a.  Construct a `deadLetterRecord` object conforming to the `failed_pois` schema.
        b.  Populate the record with `job.id`, a new timestamp, `error.message`, `error.stack`, and the original `poi` object.
        c.  Insert the `deadLetterRecord` into the `failed_pois` database table.
        d.  Log an informational message indicating a POI has been moved to the dead-letter queue.
        e.  **Crucially, do not re-throw the error.** This allows the loop to continue to the next POI.

---

## 7. TDD Anchors / Pseudocode Stubs

### `TransactionalOutboxPublisher.spec.js`
(No changes from previous version)

### `relationshipResolutionWorker.spec.js` (Revised)

```javascript
describe('relationshipResolutionWorker -- with batching and dead-lettering', () => {

  test('TEST-- should call the resolver for every POI in a successful batched job', async () => {
    // GIVEN a batched job with 5 POIs
    // WHEN the worker processes the job
    // THEN the RelationshipResolver.resolve method should be called 5 times
  });

  test('TEST-- should move a failing POI to the dead-letter table', async () => {
    // GIVEN a batched job where the 2nd of 3 POIs will cause an error
    // WHEN the worker processes the job
    // THEN a new record should be inserted into the 'failed_pois' table
    // AND the record should contain the data of the 2nd POI and the error details
  });

  test('TEST-- should continue processing subsequent POIs after one fails', async () => {
    // GIVEN a batched job where the 2nd of 3 POIs will cause an error
    // WHEN the worker processes the job
    // THEN the resolver should still be called for the 1st and 3rd POIs
  });

  test('TEST-- should handle a job with an empty POIs array gracefully', async () => {
    // GIVEN a batched job with an empty 'pois' array
    // WHEN the worker processes the job
    // THEN it should not call the resolver and should not throw an error
  });
});
```

---

## 8. Edge Cases and Constraints

*   **Empty POI List--** Handled by `publishPoisForAnalysis`. No empty jobs will be created.
*   **Payload Size Limits--** Developers should remain aware of potential message size limits imposed by the underlying queue technology.
*   **Inconsistent `fileId`--** `publishPoisForAnalysis` should validate that all POIs in a batch share the same source file.
*   **Dead-Letter Queue Management--** The `failed_pois` table will grow over time. An operational process for reviewing, reprocessing, or archiving these records must be established. This is outside the scope of this specification but is a required follow-up action.
*   **Transactional Failure--** If the database write to the `failed_pois` table fails, the error should be logged with high severity, as it represents a failure of the safety mechanism itself. The worker should still attempt to continue processing the rest of the batch.
