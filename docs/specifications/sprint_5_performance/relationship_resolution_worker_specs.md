# Specification: Relationship Resolution Worker

**Sprint:** 5 - Performance Refactoring
**Component:** `src/workers/relationshipResolutionWorker.js`
**Purpose:** To create a worker that performs sophisticated, incremental relationship analysis, moving beyond simple file-level analysis and triggering partial graph builds.

---

## 1. Architectural Shift: Incremental and Batched Processing

The previous architecture treated relationship resolution and graph building as a single, monolithic final step, creating a bottleneck. This new specification redefines this worker's role to be an intermediate, parallelizable processing stage that enables **incremental graph building**.

---

## 2. Functional Requirements

*   The worker must connect to the `relationship-resolution-queue` upon startup.
*   The worker's primary job is to process `resolve-relationships` jobs, which will be added by a new producer (or an enhanced `FileAnalysisWorker`).
*   **Job Payload:** Each `resolve-relationships` job will contain a batch of related file analysis results (e.g., all files within a specific directory).
*   For each job, the worker must:
    1.  Load the specified analysis results from the database.
    2.  Perform a "cross-file" analysis pass on the batch, querying an LLM to identify relationships *between* the files in the batch.
    3.  Save the newly discovered inter-file relationships to the database.
    4.  **Trigger a partial graph build:** After saving the relationships, the worker will add a `build-partial-graph` job to the `graph-build-queue`, providing the list of entities and relationships to be ingested.
*   All database writes **must** occur within an atomic transaction and use idempotent operations, consistent with the `FileAnalysisWorker` specs.

---

## 3. Non-Functional Requirements

*   **Concurrency:** Unlike the previous design, this worker can and should be run with a concurrency greater than 1 to process multiple relationship batches in parallel.
*   **Extensibility:** The design should allow for different batching strategies in the future (e.g., by component, by feature) by modifying the job producer.

---

## 4. Class and Function Definitions

### File: `src/workers/relationshipResolutionWorker.js`

#### **Class: `RelationshipResolutionWorker`**

*   **Properties:**
    *   `worker`: `BullMQ.Worker` - The BullMQ worker instance.
    *   `graphBuildQueue`: `BullMQ.Queue` - An instance of the `graph-build-queue`.

*   **Methods:**
    *   `constructor(concurrency = 2)`
        *   **Purpose:** Initializes the worker via `QueueManager`. Concurrency is now greater than 1 to enable parallel batch processing.
    *   `async processJob(job)`
        *   **Parameters:**
            *   `job` (`BullMQ.Job`): The job object, expected to be of type `resolve-relationships`.
        *   **Returns:** `Promise<void>`
        *   **Purpose:** Orchestrates the loading, analysis, saving, and subsequent triggering of a partial graph build.
    *   `async _resolveRelationships(analysisResultsBatch)`
        *   **Parameters:**
            *   `analysisResultsBatch` (Object): The collection of data for the files in the batch.
        *   **Returns:** `Promise<Object>` - An object containing the newly discovered inter-file relationships.
        *   **Purpose:** A private method to query the LLM with the context of multiple files to find connections between them.
    *   `async _saveRelationships(relationshipResults)`
        *   **Parameters:**
            *   `relationshipResults` (Object): The results from `_resolveRelationships`.
        *   **Returns:** `Promise<void>`
        *   **Purpose:** A private method to save the new relationships to the database, using atomic and idempotent writes.
    *   `async _triggerPartialGraphBuild(results)`
        *   **Parameters:**
            *   `results` (Object): The data to be included in the partial build.
        *   **Returns:** `Promise<BullMQ.Job>`
        *   **Purpose:** Adds a `build-partial-graph` job to the `graph-build-queue`.

---

## 5. TDD Anchors / Pseudocode Stubs

```
TEST "Worker should resolve relationships and trigger a partial build job"
    -- 1. Mock the database to provide a batch of 3 file analysis results.
    -- 2. Mock the LLM client to return a predictable set of inter-file relationships.
    -- 3. Mock the graph-build-queue and spy on its `add` method.
    -- 4. Create and process a `resolve-relationships` job.
    -- 5. Assert that the database transaction was handled correctly for saving the new relationships.
    -- 6. Assert that the `add` method on the graph-build-queue spy was called once.
    -- 7. Assert that the payload of the new job contains the correct entities and relationships for the partial build.

TEST "Worker should run with concurrency"
    -- 1. Create a worker with concurrency set to 2.
    -- 2. Add two jobs to the queue simultaneously.
    -- 3. Mock the processor to have a slight delay.
    -- 4. Assert that both jobs start processing in parallel, without waiting for the other to finish.