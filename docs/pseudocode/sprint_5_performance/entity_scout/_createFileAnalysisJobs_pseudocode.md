# Pseudocode: `EntityScout._createFileAnalysisJobs`

**Purpose:** This private method is responsible for creating a batch of `analyze-file` jobs and adding them to the `fileAnalysisQueue` in a single bulk operation.

**File Location:** `src/agents/EntityScout.js`

---

## `_createFileAnalysisJobs(filePaths, runId)`

### **Signature**

`PRIVATE ASYNC METHOD _createFileAnalysisJobs(filePaths, runId)`

### **Inputs**

-   `filePaths` (ARRAY of STRING) -- A list of absolute or relative file paths to be analyzed.
-   `runId` (STRING) -- The unique identifier for the current agent run, used to associate all related jobs.

### **Output**

-   (PROMISE resolving to ARRAY of JOB_OBJECT) -- An array of the BullMQ job objects that were created.

### **TDD Anchors**

-   `TEST should correctly map an array of file paths to an array of job definitions`
    -   `GIVEN` a list of file paths and a runId
    -   `WHEN` the job definitions are prepared
    -   `THEN` each definition must have the name 'analyze-file' and a data payload of `{ filePath, runId }`.

-   `TEST should call the fileAnalysisQueue.addBulk method with the correct job definitions`
    -   `GIVEN` a list of file paths
    -   `WHEN` `_createFileAnalysisJobs` is invoked
    -   `THEN` the `addBulk` method on the `fileAnalysisQueue` mock should be called exactly once with the prepared job definitions.

-   `TEST should return the array of created jobs from the addBulk call`
    -   `GIVEN` the `addBulk` method will return a specific array of mock job objects
    -   `WHEN` `_createFileAnalysisJobs` is invoked
    -   `THEN` the method's return value must be identical to the mock return value.

-   `TEST should handle an empty filePaths array gracefully`
    -   `GIVEN` an empty array of `filePaths`
    -   `WHEN` `_createFileAnalysisJobs` is invoked
    -   `THEN` `addBulk` should be called with an empty array.
    -   `AND` the method should return an empty array.

-   `TEST should propagate errors from the addBulk call`
    -   `GIVEN` the `addBulk` method is mocked to throw an error
    -   `WHEN` `_createFileAnalysisJobs` is invoked
    -   `THEN` the method should reject with the same error.

---

### **Pseudocode Logic**

```pseudocode
FUNCTION _createFileAnalysisJobs(filePaths, runId)
    // TEST ANCHOR-- should handle an empty filePaths array gracefully
    IF filePaths is NULL or filePaths.length is 0 THEN
        LOG "No file paths provided to create analysis jobs."
        RETURN an empty ARRAY
    END IF

    // TEST ANCHOR-- should correctly map an array of file paths to an array of job definitions
    // 1. Prepare the job definitions for the bulk insertion.
    //    Map each filePath to a job object structure required by BullMQ's addBulk.
    DECLARE jobsToCreate AS an empty ARRAY

    FOR EACH filePath IN filePaths
        DECLARE jobPayload AS OBJECT WITH {
            filePath: filePath,
            runId: runId
        }

        DECLARE jobDefinition AS OBJECT WITH {
            name: "analyze-file",
            data: jobPayload
        }

        ADD jobDefinition to jobsToCreate
    END FOR

    TRY
        // TEST ANCHOR-- should call the fileAnalysisQueue.addBulk method with the correct job definitions
        // 2. Add all jobs to the queue in a single atomic operation.
        LOG "Adding " + jobsToCreate.length + " file analysis jobs to the queue."
        DECLARE createdJobs = AWAIT this.fileAnalysisQueue.addBulk(jobsToCreate)

        // TEST ANCHOR-- should return the array of created jobs from the addBulk call
        // 3. Return the newly created job objects.
        RETURN createdJobs
    CATCH error
        // TEST ANCHOR-- should propagate errors from the addBulk call
        LOG_ERROR "Failed to add file analysis jobs in bulk to the queue. Error-- " + error.message
        THROW error // Propagate the exception to the caller (run() method)
    END TRY

END FUNCTION