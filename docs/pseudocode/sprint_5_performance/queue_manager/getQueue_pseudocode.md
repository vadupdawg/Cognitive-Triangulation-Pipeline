# Pseudocode for getQueue(queueName)

**Purpose:** To retrieve an existing message queue instance or create and configure a new one, ensuring a singleton pattern for queue management. This revised version includes critical logic for handling jobs that fail permanently.

**Module-Level State:**
-   `activeQueues`: A Map or Dictionary to store created queue instances, with the queue name as the key.
-   `DEFAULT_JOB_OPTIONS`: A configuration object with default settings for new jobs (e.g., retry attempts, backoff strategy).
-   `FAILED_JOBS_QUEUE_NAME`: A constant string, e.g., "failed-jobs".

---

### FUNCTION `getQueue(queueName)`

**Inputs:**
-   `queueName` (String) The name of the queue to get or create.

**Output:**
-   A queue instance.

**Pre-conditions:**
-   A connection to the underlying queue system (e.g., Redis) is available.

**Post-conditions:**
-   A queue instance corresponding to `queueName` is returned.
-   If a new queue is created, it is stored in `activeQueues`.
-   If a new queue is created, it has a listener for the `failed` event to move failed jobs to the `failed-jobs` queue.

---

### Logic Steps:

```pseudocode
FUNCTION getQueue(queueName)
  // TDD Anchor -- TEST getQueue with an existing queue name -- should return the exact same instance
  // 1. Check if the queue already exists in our active cache.
  IF activeQueues.has(queueName) THEN
    // 1a. If it exists, return the stored instance immediately.
    RETURN activeQueues.get(queueName)
  END IF

  // TDD Anchor -- TEST getQueue with a new queue name -- should create a new queue instance
  // 2. If the queue does not exist, create a new one.
  LOG `Creating new queue instance for-- ${queueName}`

  // 3. Define the configuration for the new queue.
  //    This includes connection details and default job processing options.
  DECLARE queueOptions = {
    connection: -- shared connection object --,
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  }

  // 4. Instantiate the new queue.
  DECLARE newQueue = CREATE_NEW_QUEUE_INSTANCE(queueName, queueOptions)

  // TDD Anchor -- TEST getQueue for 'failed-jobs' queue -- should not attach a failed listener to itself to prevent infinite loops.
  // 5. **[CRITICAL FIX]** Attach a global listener for jobs that have exhausted all retries,
  //    UNLESS this is the failed jobs queue itself, to prevent a recursive failure loop.
  IF queueName IS NOT EQUAL TO FAILED_JOBS_QUEUE_NAME THEN

    // TDD Anchor -- TEST a job failing in a new queue -- should be added to the 'failed-jobs' queue.
    // TDD Anchor -- TEST the data added to 'failed-jobs' queue -- should match the original failed job's data.
    ON newQueue.event("failed", ASYNC FUNCTION (job, error) {
      // 5a. Log the permanent failure for diagnostics.
      LOG `Job ${job.id} in queue ${queueName} failed permanently. Error-- ${error.message}`

      // 5b. Get the dedicated queue for failed jobs. This is a safe recursive call
      //     because the singleton check at the start of the function will handle it.
      DECLARE failedJobsQueue = getQueue(FAILED_JOBS_QUEUE_NAME)

      // 5c. Add the data of the failed job to the 'failed-jobs' queue for inspection or manual retry.
      //     We add the original `data` payload, not the entire job object.
      CALL failedJobsQueue.add(job.data)
    })
  END IF

  // TDD Anchor -- TEST getQueue with a new queue name -- should store the new instance in the activeQueues map.
  // 6. Store the newly created queue in the `activeQueues` map for reuse.
  activeQueues.set(queueName, newQueue)

  // 7. Return the new queue instance.
  RETURN newQueue

END FUNCTION