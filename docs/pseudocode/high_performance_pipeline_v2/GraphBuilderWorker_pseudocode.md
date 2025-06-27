# GraphBuilderWorker Pseudocode

## Overview

The `GraphBuilderWorker` is a dedicated sink component in the high-performance pipeline. Its sole responsibility is to consume validated relationship data from a queue and persist it into the Neo4j knowledge graph. It ensures the graph is built incrementally and atomically, providing a near real-time representation of the analyzed codebase.

## Dependencies

-   **QueueManager**: To connect to and consume messages from the `relationship-validated` queue.
-   **Neo4jDriver**: To establish a connection and execute transactions against the Neo4j database.
-   **Logger**: For structured logging of operations, successes, and failures.

---

## 1. Component Initialization

### `GraphBuilderWorker.constructor`

**Purpose**: Initializes the worker, sets up connections to the queue and the database.

**Inputs**:
-   `queueManager`: An instance of the QueueManager.
-   `neo4jDriver`: An instance of the Neo4jDriver.
-   `logger`: An instance of the Logger.

**Process**:
1.  Store the `queueManager`, `neo4jDriver`, and `logger` instances.
2.  Use the `queueManager` to get a reference to the `relationship-validated` queue.
3.  Log the successful initialization of the worker.
    -   **TEST**: Verify that the constructor correctly initializes all required properties.
    -   **TEST**: Ensure the worker attempts to connect to the specified queue.

---

## 2. Main Process

### `GraphBuilderWorker.start`

**Purpose**: Starts the main loop of the worker to continuously process messages.

**Process**:
1.  Log that the worker is starting and waiting for jobs.
2.  Initiate a blocking listen on the `relationship-validated` queue.
3.  The listen loop will pass each received job to the `processRelationshipJob` function.
4.  Include error handling for the queue connection itself. If the connection drops, implement a retry mechanism with exponential backoff.
    -   **TEST**: Check that the worker starts listening on the correct queue.
    -   **TEST**: Verify the retry logic for a failed queue connection.

---

## 3. Job Processing Logic

### `GraphBuilderWorker.processRelationshipJob`

**Purpose**: Processes a single `relationship-validated` event. It constructs and executes an atomic Cypher `MERGE` query to update the graph.

**Input**:
-   `job`: A job object from the queue. The job's data is the payload from the `relationship-validated` event.
    -   **Example `job.data` (payload) structure**:
        ```json
        {
          "source": {
            "label": "Function",
            "properties": { "id": "file.js-myFunc", "name": "myFunc", "filePath": "file.js" }
          },
          "target": {
            "label": "Variable",
            "properties": { "id": "file.js-myVar", "name": "myVar", "filePath": "file.js" }
          },
          "relationship": {
            "type": "CALLS",
            "properties": {
              "line": 42,
              "final_confidence_score": 0.98,
              "supporting_evidence_count": 3
            }
          }
        }
        ```

**Process**:
1.  BEGIN TRY
2.      Log the start of processing for the received job ID.
3.      **// TDD Anchor -- Validate Exact Job Structure**
4.      Validate the structure of `job.data`. Ensure `source`, `target`, and `relationship` fields exist.
5.      Ensure `source` and `target` have `label` and `properties` (with an `id`).
6.      Ensure `relationship` has `type` and `properties`.
7.      **// TDD Anchor -- Test with the exact, enriched payload structure shown in the example above.**
8.      IF validation fails THEN
9.          Log a critical error with job details.
10.         Acknowledge and remove the job from the queue to prevent reprocessing.
11.         RETURN.
12.         **// TDD Anchor -- Test with malformed job data (e.g., missing 'source' node or 'final_confidence_score').**
13.     END IF
14.
15.     **// TDD Anchor -- Construct Cypher Query**
16.     Extract `source`, `target`, and `relationship` from `job.data`.
17.     Construct the atomic `MERGE` query string.
18.         -   The query uses `MERGE` on both nodes based on a unique identifier (the `id` property).
19.         -   It uses `ON CREATE SET` to add all properties when the node is first created.
20.         -   It uses `ON MATCH SET` to update properties if the node already exists.
21.         -   It then uses `MERGE` on the relationship between the two nodes.
22.         -   `ON CREATE SET` and `ON MATCH SET` are also used for the relationship's properties.
23.
24.     **// TDD Anchor -- Execute Database Transaction**
25.     Acquire a session from the `neo4jDriver`.
26.     Begin a transaction.
27.     Execute the constructed Cypher query with the properties as parameters.
28.     Commit the transaction.
29.     Log the successful creation/update of the relationship in the graph.
30.     **// TDD Anchor -- Test happy path, successful graph update.**
31.
32. CATCH DatabaseError as e
33.     Log the database error, including the query that failed and the job ID.
34.     IF the transaction is active THEN
35.         Rollback the transaction.
36.     END IF
37.     // Decide on error strategy- either reject and requeue the job for a retry,
38.     // or move to a dead-letter queue after several failed attempts.
39.     **// TDD Anchor -- Test database connection failure.**
40.     **// TDD Anchor -- Test Cypher syntax error.**
41.
42. CATCH AnyOtherError as e
43.     Log the unexpected error.
44.     Acknowledge and remove the job to avoid poison-pilling the queue.
45.     **// TDD Anchor -- Test unexpected processing error.**
46.
47. FINALLY
48.     IF a session was acquired THEN
49.         Close the session.
50.     END IF
51.     Acknowledge the job was processed (if not already done in error cases).
52. END TRY

---