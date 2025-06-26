# Primary Project Planning Document -- Sprint 5 Performance Refactoring

## 1. High-Level Summary

The goal of this sprint is to resolve the critical performance bottlenecks within the existing data processing pipeline. We will transition from a sequential, monolithic architecture to a parallelized, job-queue-based system. This refactoring will leverage BullMQ and Redis to manage and execute analysis tasks concurrently, drastically reducing the overall processing time and improving system scalability and robustness. The `RelationshipResolver` agent's logic will be decomposed and distributed among independent worker processes.

---

## 2. Sprint Breakdown and Granular Tasks

### Phase 1 -- Infrastructure and Core Setup

This phase focuses on establishing the foundational components for the new architecture.

**Task 1.1 -- Redis and BullMQ Integration**

*   **Description**-- Install and configure Redis and the BullMQ library. Create a centralized module for managing queue connections to ensure consistency across the application.
*   **AI Verifiable End Result**-- A new module, [`src/utils/queueManager.js`](src/utils/queueManager.js:1), exists. It exports a function `getQueue(queueName)` that returns a BullMQ Queue instance connected to the Redis server. A test can successfully connect to Redis and create a BullMQ queue instance via this module.
*   **New/Modified Components**--
    *   **File**-- [`src/utils/queueManager.js`](src/utils/queueManager.js:1)
    *   **Function**-- `getQueue(queueName)`-- Returns a BullMQ queue object.
    *   **Function**-- `closeConnections()`-- Closes all open BullMQ connections.

**Task 1.2 -- Define Job Queues**

*   **Description**-- Define and initialize the two primary job queues required for the new pipeline-- one for file analysis and one for relationship resolution.
*   **AI Verifiable End Result**-- When the application starts, two BullMQ queues named `file-analysis-queue` and `relationship-resolution-queue` are created and available in Redis. A test script can successfully retrieve both queue instances using the `queueManager` module.
*   **New/Modified Components**--
    *   **File**-- [`src/main.js`](src/main.js:1) (or a new initialization script)
    *   **Logic**-- Code that calls `queueManager.getQueue('file-analysis-queue')` and `queueManager.getQueue('relationship-resolution-queue')` upon application startup.

---

### Phase 2 -- Worker Implementation

This phase involves creating the new worker agents that will consume jobs and perform the core analysis logic.

**Task 2.1 -- Create File Analysis Worker**

*   **Description**-- Create a new worker process responsible for consuming jobs from the `file-analysis-queue`. This worker will perform the initial analysis on a single file, which was previously part of the `RelationshipResolver`'s intra-file pass.
*   **AI Verifiable End Result**-- A new file, [`src/workers/fileAnalysisWorker.js`](src/workers/fileAnalysisWorker.js:1), exists. It defines a BullMQ worker that connects to the `file-analysis-queue`. When a job with a `filePath` payload is added to the queue, the worker processes it, executes the core analysis logic (stubbed for now), and logs the result. The job is marked as complete in Redis upon successful execution.
*   **New/Modified Components**--
    *   **File**-- [`src/workers/fileAnalysisWorker.js`](src/workers/fileAnalysisWorker.js:1)
    *   **Class**-- `FileAnalysisWorker`
    *   **Method**-- `constructor(concurrency)`-- Initializes the BullMQ worker.
    *   **Method**-- `processJob(job)`-- Contains the logic to analyze the file specified in `job.data.filePath`.

**Task 2.2 -- Implement Relationship Resolution Worker**

*   **Description**-- Create a worker for the `relationship-resolution-queue`. This worker will handle the more complex inter-file and global relationship analysis, similar to the later passes of the original `RelationshipResolver`.
*   **AI Verifiable End Result**-- A new file, [`src/workers/relationshipResolutionWorker.js`](src/workers/relationshipResolutionWorker.js:1), exists. It defines a BullMQ worker for the `relationship-resolution-queue`. When a job is added (e.g., with a directory path or a "global" flag), the worker executes the corresponding analysis logic (stubbed) and marks the job as complete.
*   **New/Modified Components**--
    *   **File**-- [`src/workers/relationshipResolutionWorker.js`](src/workers/relationshipResolutionWorker.js:1)
    *   **Class**-- `RelationshipResolutionWorker`
    *   **Method**-- `constructor(concurrency)`-- Initializes the BullMQ worker.
    *   **Method**-- `processJob(job)`-- Contains the logic for inter-file relationship analysis based on `job.data`.

---

### Phase 3 -- Producer Refactoring

This phase focuses on modifying the `EntityScout` agent to produce jobs instead of invoking the `RelationshipResolver` directly.

**Task 3.1 -- Refactor `EntityScout` to Produce File Analysis Jobs**

*   **Description**-- Modify the `EntityScout` agent. After discovering a file, instead of storing a POI report and waiting, it will now create and dispatch a job to the `file-analysis-queue`.
*   **AI Verifiable End Result**-- The `run` method in [`src/agents/EntityScout.js`](src/agents/EntityScout.js:1) is modified. It no longer calls `RelationshipResolver`. Instead, it calls a new internal method, `addFileAnalysisJobToQueue(filePath)`. When `EntityScout` processes a file, a new job with the correct `filePath` as its payload is successfully added to the `file-analysis-queue` in Redis.
*   **New/Modified Components**--
    *   **File**-- [`src/agents/EntityScout.js`](src/agents/EntityScout.js:1)
    *   **Method**-- `addFileAnalysisJobToQueue(filePath)`-- Creates a job with the file path and adds it to the `file-analysis-queue` using the `queueManager`.
    *   **Method**-- `run()`-- Logic is updated to call `addFileAnalysisJobToQueue` for each discovered file.

---

### Phase 4 -- Result Aggregation and Finalization

This phase ensures that once all parallel processing is complete, the final graph can be built.

**Task 4.1 -- Design the Job Completion Trigger for `GraphBuilder`**

*   **Description**-- Implement a mechanism to detect when all file analysis and relationship resolution jobs for a given run are complete. This will trigger the `GraphBuilder` agent. A simple approach is to have `EntityScout` first add all file jobs, and then a final "sentinel" job.
*   **AI Verifiable End Result**-- A new "sentinel" or "aggregator" job type is defined. The `EntityScout` agent, after queueing all file analysis jobs, queues a single `start-graph-build` job to the `relationship-resolution-queue`. The `RelationshipResolutionWorker` has specific logic to identify this job type. Upon processing the `start-graph-build` job, it directly invokes the `GraphBuilder.run()` method.
*   **New/Modified Components**--
    *   **File**-- [`src/agents/EntityScout.js`](src/agents/EntityScout.js:1)
    *   **Method**-- `run()`-- After the file loop, adds a final job like `{ type-- 'start-graph-build', runId-- '...' }` to the queue.
    *   **File**-- [`src/workers/relationshipResolutionWorker.js`](src/workers/relationshipResolutionWorker.js:1)
    *   **Method**-- `processJob(job)`-- Includes an `if (job.data.type === 'start-graph-build')` block that instantiates and runs the `GraphBuilder` agent.

**Task 4.2 -- Validate Final Graph Integrity**

*   **Description**-- Verify that the `GraphBuilder` agent, now triggered by a series of partial build jobs and a finalization job, can correctly assemble the complete knowledge graph from the data asynchronously written by the worker fleet.
*   **AI Verifiable End Result**-- The brittle success criterion of producing an "identical" graph is replaced. The new verifiable result is the successful execution of a suite of predefined Cypher queries against the generated graph. These queries will validate the graph's integrity by verifying:
    1.  **Key node counts:** e.g., total number of `File`, `Class`, `Function` nodes.
    2.  **Key relationship counts:** e.g., total number of `IMPORTS`, `CALLS` relationships.
    3.  **Cornerstone relationships:** e.g., a query confirming that a specific function in `main.js` correctly forms a `CALLS` relationship to a function in `utils.js`.
    The results of these queries must match a pre-defined ground truth.
*   **New/Modified Components**--
    *   **File**-- [`src/agents/GraphBuilder.js`](src/agents/GraphBuilder.js:1) (Logic adapted for incremental/partial builds).
    *   **File**-- [`tests/acceptance/A-05_graph_integrity.test.js`](tests/acceptance/A-05_graph_integrity.test.js:1) (New test file containing the validation Cypher queries).