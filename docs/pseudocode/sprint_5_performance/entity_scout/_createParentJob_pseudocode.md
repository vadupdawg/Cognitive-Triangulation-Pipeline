# Pseudocode: EntityScout._createParentJob(runId)

**Function:** `_createParentJob`
**Type:** Asynchronous Private Method

**Purpose:** To create the single parent job in the `graphBuildQueue` that will wait for all child `analyze-file` jobs to complete. This job acts as a "fan-in" point for the entire analysis process.

---

### Inputs:
- `runId`: STRING - A unique identifier for the current execution run.

### Outputs:
- **Success:** `parentJob`: OBJECT - The created BullMQ job object, which acts as the parent for all other jobs in this run.
- **Failure:** Throws an ERROR.

### Pre-conditions:
- `this.graphBuildQueue` must be an initialized and connected BullMQ Queue instance.

### Post-conditions:
- A new job named `graph-build-finalization` is added to the `graphBuildQueue`.
- The new job's data payload contains the `runId`.
- The created job object is returned, ready to have dependencies added to it.

---

## Method Logic

```pseudocode
FUNCTION _createParentJob(runId)
    -- TEST-- Happy Path -- Should create and return a valid job object.
    -- BEHAVIOR -- Verifies that the method correctly calls the queue's `add` method with the correct parameters.
    
    LOG "Attempting to create parent job 'graph-build-finalization' for run ID: " + runId

    TRY
        // Define the name for the parent job.
        jobName = "graph-build-finalization"

        // Define the data payload for the job.
        jobData = { "runId": runId }

        // Add the job to the graph build queue.
        // In BullMQ, a job becomes a parent and enters a 'waiting-children' state 
        // once other jobs are added as its dependencies. No special option is needed at creation time.
        parentJob = AWAIT this.graphBuildQueue.add(jobName, jobData)

        -- TEST-- Failure Path -- Should throw an error if job creation returns a falsy value.
        -- BEHAVIOR -- Ensures the system handles queue connection issues or invalid parameters gracefully.
        IF parentJob IS NULL OR UNDEFINED THEN
            THROW NEW Error("Failed to create parent job. The queue returned a null or undefined job object.")
        END IF

        LOG "Parent job created successfully with ID: " + parentJob.id

        -- TEST-- Return Value -- The returned object should be the job created by the queue.
        -- BEHAVIOR -- Confirms the method's output is as expected for subsequent operations.
        RETURN parentJob

    CATCH error
        LOG_ERROR "Failed to create parent job in graphBuildQueue for run ID: " + runId
        LOG_ERROR "Error details: " + error.message
        THROW error // Re-throw the error to be handled by the calling method, likely run().
    END TRY

END FUNCTION