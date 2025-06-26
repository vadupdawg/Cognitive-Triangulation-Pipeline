# Specification-- Job Data Models (v2)

This document specifies the structure of the key data objects used in the Cognitive Triangulation v2 architecture, particularly the events passed between the analysis workers and the `ValidationCoordinator`.

## 1. `Relationship` Database Model

The `relationships` table in SQLite will be modified to include the new `status` and `confidenceScore` fields.

-- **Column Name** -- **Data Type** -- **Description**
-- --- -- --- -- ---
-- `id` -- INTEGER -- Primary Key.
-- `runId` -- TEXT -- The ID of the analysis run this relationship belongs to.
-- `sourcePoiId` -- INTEGER -- Foreign key to the `pois` table.
-- `targetPoiId` -- INTEGER -- Foreign key to the `pois` table.
-- `type` -- TEXT -- The type of relationship (e.g., 'CALLS', 'IMPLEMENTS').
-- `label` -- TEXT -- A human-readable description of the relationship.
-- `confidenceScore` -- REAL -- **(Modified)** The final, reconciled confidence score (0.0 to 1.0). Initially holds the preliminary score.
-- `status` -- TEXT -- **(New)** The validation status of the relationship. Enum-- `PENDING_VALIDATION`, `VALIDATED`, `CONFLICT`.
-- `createdAt` -- DATETIME -- Timestamp of creation.

## 2. `RelationshipEvidence` Database Model

A new table is required to store the auditable evidence trail for each relationship's validation process.

-- **Column Name** -- **Data Type** -- **Description**
-- --- -- --- -- ---
-- `id` -- INTEGER -- Primary Key.
-- `relationshipId` -- INTEGER -- Foreign key to the `relationships` table.
-- `runId` -- TEXT -- The ID of the analysis run.
-- `evidencePayload` -- TEXT (JSON) -- A JSON blob containing the array of evidence from all workers.

### `evidencePayload` JSON Structure

```json
[
  {
    "sourceWorker": "FileAnalysisWorker",
    "foundRelationship": true,
    "initialScore": 0.85,
    "rawLlmOutput": { "...raw LLM JSON for this finding..." }
  },
  {
    "sourceWorker": "DirectoryResolutionWorker",
    "foundRelationship": true,
    "initialScore": 0.91,
    "rawLlmOutput": { "...raw LLM JSON for this finding..." }
  },
  {
    "sourceWorker": "GlobalResolutionWorker",
    "foundRelationship": false,
    "initialScore": 0.1,
    "rawLlmOutput": { "...raw LLM JSON for this finding..." }
  }
]
```

## 3. Worker Event Payload (`*-analysis-completed`)

This defines the structure of the event object that each worker (`FileAnalysisWorker`, `DirectoryResolutionWorker`, etc.) will publish for the `ValidationCoordinator` to consume.

### `AnalysisCompletedEvent` Structure

-- **Field** -- **Data Type** -- **Description**
-- --- -- --- -- ---
-- `runId` -- String -- The ID of the overall analysis run.
-- `jobId` -- String/Integer -- The ID of the BullMQ job that produced this result.
-- `sourceWorker` -- String -- The name of the worker class that generated the event (e.g., 'FileAnalysisWorker').
-- `findings` -- Array -- An array of `Finding` objects, one for each relationship the worker evaluated.

### `Finding` Object Structure

This object contains the specific evidence from one worker about one relationship.

-- **Field** -- **Data Type** -- **Description**
-- --- -- --- -- ---
-- `relationshipHash` -- String -- A unique, deterministic hash representing the relationship (e.g., a hash of source and target POI IDs).
-- `foundRelationship` -- Boolean -- `true` if the worker's analysis concluded the relationship exists, `false` otherwise.
-- `initialScore` -- Number -- The confidence score from this worker's perspective, calculated via `ConfidenceScoringService`.
-- `rawLlmOutput` -- Object -- The raw JSON output from the LLM that led to this finding, for auditing purposes.