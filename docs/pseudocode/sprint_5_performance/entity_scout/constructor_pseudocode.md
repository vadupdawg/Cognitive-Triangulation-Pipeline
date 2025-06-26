# `EntityScout` - `constructor` Pseudocode

**Objective:** To initialize an `EntityScout` instance, acquiring the necessary message queue instances from a central `queueManager`.

---

## 1. Class Definition

```plaintext
CLASS EntityScout
```

---

## 2. Properties

```plaintext
    PROPERTY fileAnalysisQueue  -- Holds the instance of the file analysis job queue.
    PROPERTY graphBuildQueue   -- Holds the instance of the graph build job queue.
```

---

## 3. Constructor Logic

**Inputs:**
-   `queueManager`: An object or module responsible for managing and providing access to all message queues.

**Outputs:**
-   An `EntityScout` instance with `fileAnalysisQueue` and `graphBuildQueue` properties initialized.

```plaintext
    FUNCTION constructor(queueManager)
        -- TDD ANCHOR: TEST constructor requests 'file-analysis-queue' from the queueManager.
        -- TDD ANCHOR: TEST constructor requests 'graph-build-queue' from the queueManager.
        
        -- Retrieve the queue for dispatching file analysis jobs.
        this.fileAnalysisQueue = queueManager.getQueue('file-analysis-queue')
        
        -- TDD ANCHOR: TEST constructor correctly assigns the file analysis queue instance.
        -- ASSERT that this.fileAnalysisQueue is not null or undefined.
        
        -- Retrieve the queue for dispatching the final graph build job.
        this.graphBuildQueue = queueManager.getQueue('graph-build-queue')
        
        -- TDD ANCHOR: TEST constructor correctly assigns the graph build queue instance.
        -- ASSERT that this.graphBuildQueue is not null or undefined.

        -- TDD ANCHOR: TEST constructor throws an error if queueManager fails to provide a queue.
        -- SETUP a mock queueManager that returns null for 'file-analysis-queue'.
        -- EXPECT the constructor to throw a "QueueInitializationError".
        -- SETUP a mock queueManager that returns null for 'graph-build-queue'.
        -- EXPECT the constructor to throw a "QueueInitializationError".
        
    END FUNCTION
```

---

## 4. End of Class Definition

```plaintext
END CLASS