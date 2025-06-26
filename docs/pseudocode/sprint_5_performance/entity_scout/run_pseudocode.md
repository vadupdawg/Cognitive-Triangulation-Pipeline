# Pseudocode-- EntityScout.run() Method (Revised)

**Component**-- `EntityScout`
**Method**-- `run()`
**Sprint**-- 5 - Performance Refactoring
**CRITICAL REVISION**-- This version corrects a race condition identified in `docs/devil/critique_report_sprint_5_pseudocode.md`. The logic now ensures child jobs are created in a paused state, dependencies are registered, and only then are the jobs resumed, guaranteeing atomicity.

---

## 1. Method Overview

The `run` method orchestrates the entire file analysis process by fanning out jobs to the `file-analysis-queue` and creating a single finalization job that only runs after all analysis jobs are complete. This is achieved by creating jobs in a paused state to prevent a race condition.

## 2. Inputs

- None

## 3. Outputs

- `Promise<void>`-- Resolves when all jobs have been created, linked, and resumed. Rejects on failure.

## 4. TDD Anchors

- **TEST `run()` happy path**--
    - `TEST` should generate a unique `runId`.
    - `TEST` should create one parent 'graph-build-finalization' job.
    - `TEST` should discover all target files correctly.
    - `TEST` should create all `analyze-file` jobs with the `paused-- true` option.
    - `TEST` should call `addBulk` on the file analysis queue with the correct job definitions.
    - `TEST` should call `addDependencies` on the parent job with the IDs of all created child jobs.
    - `TEST` should call `resume` on every child job after dependencies are set.
- **TEST `run()` edge cases**--
    - `TEST` should handle the case where no files are discovered, creating only the parent job and no children.
    - `TEST` should throw an error if the parent job creation fails.
    - `TEST` should throw an error if adding child jobs in bulk fails.
    - `TEST` should throw an error if setting dependencies fails.
    - `TEST` should throw an error if resuming a child job fails.

---

## 5. Pseudocode

```plaintext
FUNCTION run()

  -- TEST should generate a unique runId.
  runId = GENERATE_UNIQUE_ID()
  LOG "Starting EntityScout run with ID-- " + runId

  TRY
    -- 1. Create the parent finalization job
    -- This job will wait for all children to complete.
    -- TEST should create one parent 'graph-build-finalization' job.
    parentJob = AWAIT this._createParentJob(runId)
    LOG "Parent job " + parentJob.id + " created for run " + runId

    -- 2. Discover files to be analyzed
    -- TEST should discover all target files correctly.
    filePaths = AWAIT this.discoverFiles()

    IF filePaths IS EMPTY THEN
      LOG "No files discovered for analysis. Run " + runId + " complete."
      -- TEST should handle the case where no files are discovered.
      RETURN
    END IF

    -- 3. Prepare child job definitions with the paused option
    -- This is the critical step to prevent race conditions.
    -- TEST should create all `analyze-file` jobs with the `paused-- true` option.
    childJobDefinitions = []
    FOR EACH filePath IN filePaths
      jobDefinition = {
        name-- "analyze-file",
        data-- { filePath-- filePath, runId-- runId },
        opts-- { paused-- true }
      }
      ADD jobDefinition to childJobDefinitions
    END FOR

    -- 4. Add all child jobs to the queue in a paused state
    -- addBulk returns the created job instances.
    -- TEST should call `addBulk` on the file analysis queue with the correct job definitions.
    createdChildJobs = AWAIT this.fileAnalysisQueue.addBulk(childJobDefinitions)
    LOG "Added " + createdChildJobs.length + " file analysis jobs in a paused state."

    -- 5. Extract job IDs from the created jobs
    childrenJobIds = EXTRACT_JOB_IDS_FROM(createdChildJobs)

    -- 6. Add dependencies to the parent job
    -- This atomically links all children. Workers cannot pick them up yet.
    -- TEST should call `addDependencies` on the parent job with the IDs of all created child jobs.
    AWAIT parentJob.addDependencies({ children-- childrenJobIds })
    LOG "Dependencies set on parent job " + parentJob.id

    -- 7. Resume all child jobs
    -- Now that dependencies are registered, it is safe to allow workers to process them.
    -- TEST should call `resume` on every child job after dependencies are set.
    resumePromises = []
    FOR EACH job IN createdChildJobs
      ADD job.resume() to resumePromises
    END FOR
    AWAIT PROMISE_ALL(resumePromises)
    LOG "All " + createdChildJobs.length + " child jobs have been resumed."

    LOG "EntityScout run " + runId + " successfully orchestrated."

  CATCH error
    LOG_ERROR "EntityScout run failed-- " + error.message
    -- TEST should throw an error if any step fails.
    THROW error
  END TRY

END FUNCTION