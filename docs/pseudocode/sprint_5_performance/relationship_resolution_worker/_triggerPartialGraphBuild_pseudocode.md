# Pseudocode: `_triggerPartialGraphBuild` Method

**Class:** `RelationshipResolutionWorker`
**Method:** `_triggerPartialGraphBuild(results)`

## 1. Method Overview

This private method is responsible for initiating a partial graph build by adding a new job to the `graph-build-queue`. It encapsulates the logic for creating and dispatching the job with the necessary data payload.

---

## 2. Method Signature

```
FUNCTION _triggerPartialGraphBuild(results)
```

**INPUT:**
- `results` (Object) -- An object containing the entities and relationships resolved in the current batch. This data will form the payload for the graph build job.
  - **TEST-ASSUME** `results` is a well-formed object, as its integrity is the responsibility of the calling method (`processJob`).

**OUTPUT:**
- `newJob` (Job Object) -- The BullMQ Job object that was created and added to the queue.
  - **TEST-VERIFY** The returned object is a valid job object.

---

## 3. Pseudocode Logic

```
BEGIN FUNCTION _triggerPartialGraphBuild(results)

    -- Define the name for the new job. This should be a constant to ensure consistency.
    CONSTANT jobName = "build-partial-graph"

    -- Define the payload for the job. The entire results object is passed as data.
    CONSTANT jobPayload = results

    -- Log the action for debugging and traceability purposes.
    LOG "Adding job to graph-build-queue. Name-- " + jobName + ", Payload-- " + jobPayload

    -- Access the graphBuildQueue instance property of the class.
    -- Add the new job to the queue. This is an asynchronous operation.
    -- TEST-ANCHOR-- Test that the `add` method on the queue is called with the correct job name and payload.
    newJob = AWAIT this.graphBuildQueue.add(jobName, jobPayload)

    -- Log the successful creation of the job, including its ID.
    LOG "Successfully added job " + newJob.id + " to the graph-build-queue."

    -- Return the newly created job object to the caller.
    RETURN newJob

END FUNCTION
```

---

## 4. TDD Anchors

1.  **`TEST happy path-- should add a job to the queue and return it`**
    -   **GIVEN** a valid `results` object.
    -   **GIVEN** a mocked `graphBuildQueue` with a spy on its `add` method.
    -   **WHEN** `_triggerPartialGraphBuild` is called with the `results`.
    -   **THEN** the `add` method on the queue spy should be called exactly once.
    -   **THEN** the first argument to `add` should be `"build-partial-graph"`.
    -   **THEN** the second argument to `add` should be the `results` object.
    -   **THEN** the method should return the mocked job object created by the `add` method spy.

2.  **`TEST error handling-- should propagate errors from the queue`**
    -   **GIVEN** a `results` object.
    -   **GIVEN** a mocked `graphBuildQueue` where the `add` method is configured to throw an error (e.g., "Queue connection failed").
    -   **WHEN** `_triggerPartialGraphBuild` is called.
    -   **THEN** the method should throw or propagate the error.
    -   **TEST-VERIFY** that the application's error handling mechanism correctly catches and logs this failure.