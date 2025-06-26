# Specification: EntityScout as a Job Producer

**Sprint:** 5 - Performance Refactoring
**Component:** `src/agents/EntityScout.js`
**Purpose:** To refactor the `EntityScout` agent to produce jobs for the new queue-based architecture, orchestrating the entire analysis pipeline using a reliable job dependency model.

---

## 1. Functional Requirements

*   The `EntityScout` agent's `run()` method must be completely refactored to manage a "fan-out/fan-in" job pattern.
*   The agent must no longer dispatch a "sentinel job". This pattern is deprecated and replaced by job dependencies.
*   At the start of a run, the agent must create a single parent job, `graph-build-finalization`, in the `graph-build-queue`. This job must be created in a **waiting state**.
*   For each file discovered, the agent must create and dispatch an `analyze-file` job to the `file-analysis-queue`.
*   Crucially, each `analyze-file` job must be added as a **dependency** to the parent `graph-build-finalization` job.
*   The agent must generate a unique `runId` and associate it with all jobs created during that run.

---

## 2. Non-Functional Requirements

*   **Reliability:** The use of BullMQ's dependency management system ensures the final graph build will *only* start after all `analyze-file` jobs have completed successfully. This eliminates the race conditions inherent in the previous design.
*   **Efficiency:** The agent should add jobs to the queue in an efficient manner, potentially using batching methods if available (`addBulk`).
*   **Atomicity (Conceptual):** The creation of the parent job and all its dependent children should be treated as a single logical operation.

---

## 3. Class and Function Definitions

### File: `src/agents/EntityScout.js`

#### **Class: `EntityScout`**

*   **Properties:**
    *   `fileAnalysisQueue`: `BullMQ.Queue` - An instance of the `file-analysis-queue`.
    *   `graphBuildQueue`: `BullMQ.Queue` - An instance of the `graph-build-queue`.

*   **Methods:**
    *   `constructor()`
        *   **Modification:** The constructor should get queue instances from the `queueManager`.
    *   `async run()`
        *   **Modification (Complete Overhaul):**
            1.  Generate a unique `runId`.
            2.  Create the parent `graph-build-finalization` job in the `graphBuildQueue`. This job is created with the `runId` in its payload but remains in a `waiting` state because it will have dependencies.
            3.  Discover all relevant files.
            4.  Create an array of `analyze-file` job definitions. Each definition includes the job name, payload (`{ filePath, runId }`), and options.
            5.  Use the `fileAnalysisQueue.addBulk()` method to add all file analysis jobs at once. This returns a list of the created jobs.
            6.  Get the job IDs from the newly created `analyze-file` jobs.
            7.  Call `parentJob.addDependencies(childrenJobIds)` to link all child jobs to the parent job.
            8.  The method resolves when the parent job and all its dependent children have been successfully created and linked.
    *   `async _createParentJob(runId)`
        *   **Parameters:** `runId` (string)
        *   **Returns:** `Promise<BullMQ.Job>`
        *   **Purpose:** A new private method to create the single, overarching `graph-build-finalization` job.
    *   `async _createFileAnalysisJobs(filePaths, runId)`
        *   **Parameters:** `filePaths` (Array<string>), `runId` (string)
        *   **Returns:** `Promise<Array<BullMQ.Job>>`
        *   **Purpose:** A new private method that prepares and adds all `analyze-file` jobs to the queue using `addBulk`.

---

## 4. TDD Anchors / Pseudocode Stubs

```
TEST "run() should create a single parent job in a waiting state"
    -- 1. Mock file discovery to return an empty array.
    -- 2. Mock the queueManager and spy on the `add` method of the mock graph-build-queue.
    -- 3. Instantiate and run EntityScout.
    -- 4. Assert that the `add` method on the graph-build-queue spy was called once with the job name 'graph-build-finalization'.
    -- 5. Assert that the job was created with options that would place it in a waiting state if dependencies were added.

TEST "run() should add an analysis job for each file and link it to the parent job"
    -- 1. Mock file discovery to return 2 test files.
    -- 2. Mock the queueManager and spy on `addBulk` for the file-analysis-queue and `add` for the graph-build-queue.
    -- 3. Mock the parent job object to spy on its `addDependencies` method.
    -- 4. Instantiate and run EntityScout.
    -- 5. Assert `addBulk` was called on the file-analysis-queue with 2 jobs.
    -- 6. Assert `addDependencies` was called on the parent job mock with the IDs of the 2 child jobs.