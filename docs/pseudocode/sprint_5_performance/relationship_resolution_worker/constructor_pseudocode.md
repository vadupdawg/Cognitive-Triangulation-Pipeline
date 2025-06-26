# Pseudocode: RelationshipResolutionWorker - constructor

**Purpose:** To initialize the `RelationshipResolutionWorker`, set up its properties, and create the underlying BullMQ worker instance with a specified concurrency.

---

## 1. Class Definition

```plaintext
CLASS RelationshipResolutionWorker
```

---

## 2. Properties

-   `worker`: Holds the BullMQ worker instance.
-   `graphBuildQueue`: Holds the BullMQ queue instance for triggering graph builds.

---

## 3. Constructor Logic

```plaintext
FUNCTION constructor(concurrency)
    -- Inputs:
    --   concurrency (Integer, optional, default: 2): The number of parallel jobs this worker can process.

    -- Defaulting Logic
    IF concurrency IS NOT PROVIDED OR IS NULL THEN
        SET this.concurrency = 2
    ELSE
        SET this.concurrency = concurrency
    END IF

    -- TDD ANCHOR: TEST that the constructor correctly assigns the default concurrency of 2.
    -- TDD ANCHOR: TEST that the constructor correctly assigns a provided concurrency value (e.g., 5).

    -- Initialization
    
    -- 1. Get the queue for triggering the next step in the pipeline.
    -- This queue is used to send jobs for partial graph builds after relationships are resolved.
    this.graphBuildQueue = QueueManager.getQueue('graph-build-queue')
    -- TDD ANCHOR: TEST that `QueueManager.getQueue` is called exactly once with the argument 'graph-build-queue'.
    -- TDD ANCHOR: TEST that `this.graphBuildQueue` is assigned the object returned by `QueueManager.getQueue`.

    -- 2. Create the worker instance for this class.
    -- The worker is responsible for processing jobs from the 'relationship-resolution-queue'.
    -- It uses the `processJob` method of this class as the job handler.
    CONSTANT workerOptions = {
        concurrency: this.concurrency
    }
    
    this.worker = QueueManager.createWorker(
        'relationship-resolution-queue',
        this.processJob.bind(this),
        workerOptions
    )
    -- TDD ANCHOR: TEST that `QueueManager.createWorker` is called with the correct queue name, a bound `processJob` function, and options containing the correct concurrency.
    -- TDD ANCHOR: TEST that `this.worker` is assigned the worker instance returned by `QueueManager.createWorker`.

    -- Logging for operational visibility
    LOG "RelationshipResolutionWorker initialized with concurrency " + this.concurrency

END FUNCTION
```

---

## 4. TDD Anchor Summary

-   **Constructor Defaults:**
    -   Verify that `concurrency` defaults to `2` if not provided.
    -   Verify that a provided `concurrency` value is correctly assigned.
-   **QueueManager Interaction:**
    -   Ensure `QueueManager.getQueue` is called once with `'graph-build-queue'`.
    -   Ensure `this.graphBuildQueue` holds the returned queue instance.
    -   Ensure `QueueManager.createWorker` is called with the correct parameters:
        -   Queue Name: `'relationship-resolution-queue'`
        -   Processor: A function that correctly binds to `this.processJob`.
        -   Options: An object `{ concurrency: [value] }`.
    -   Ensure `this.worker` holds the returned worker instance.