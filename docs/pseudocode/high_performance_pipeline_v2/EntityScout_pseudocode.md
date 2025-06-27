# Pseudocode: EntityScout Component (v2)

## 1. Overview

The `EntityScout` component acts as a producer in the high-performance pipeline. Its primary responsibility is to scan a specified directory, create a single "master" job to represent the entire analysis run, and then create individual "child" jobs for each file found. These child jobs are added to a BullMQ flow, ensuring that the entire batch of file analyses is managed and tracked as a single, cohesive unit.

**V2 Update**: The payload for each `"analyze-file"` job has been updated to include `totalFilesInDir`. This field is critical for the downstream `AggregationService` to determine when all files in a specific directory have been processed.

## 2. TDD Anchors

-   **TEST_CONSTRUCTOR_HAPPY_PATH**: Verify that the `EntityScout` instance is created with the correct queue manager and directory path.
-   **TEST_RUN_CREATES_MASTER_FLOW**: Verify that the `run` method successfully creates a master flow job using the flow producer.
-   **TEST_RUN_SCANS_DIRECTORY**: Verify that the `run` method correctly scans the target directory and identifies all files within it and its subdirectories.
-   **TEST_RUN_HANDLES_EMPTY_DIRECTORY**: Verify that if the target directory is empty, the master flow is created but no child jobs are added.
-   **TEST_RUN_CREATES_CHILD_JOBS**: For a directory containing files, verify that an `analyze-file` child job is created for each file.
-   **TEST_RUN_CHILD_JOBS_HAVE_CORRECT_DATA**: Verify that each `analyze-file` child job contains the correct and absolute file path in its data payload.
-   **TEST_RUN_CHILD_JOBS_HAVE_DIR_FILE_COUNT**: Verify that each `analyze-file` child job contains the correct `directoryPath` and the accurate `totalFilesInDir` count.
-   **TEST_RUN_HANDLES_FILE_SCAN_ERROR**: Verify that the system gracefully handles I/O errors that might occur during directory scanning.
-   **TEST_RUN_HANDLES_QUEUE_CONNECTION_ERROR**: Verify that the system gracefully handles errors when trying to connect to the queue or create jobs.

---

## 3. Component: EntityScout

### 3.1. Properties

-   `queueManager`: OBJECT - An instance of the QueueManager for interacting with BullMQ.
-   `targetDirectory`: STRING - The path to the directory to be scanned.
-   `flowProducer`: OBJECT - An instance of a BullMQ FlowProducer, obtained from the `queueManager`.

---

### 3.2. FUNCTION `constructor(queueManager, targetDirectory)`

**Purpose**: Initializes a new instance of the `EntityScout`.

**Inputs**:
-   `queueManager`: The application's central queue manager instance.
-   `targetDirectory`: The root directory designated for the file scan.

**Process**:
1.  SET `this.queueManager` to `queueManager`.
2.  SET `this.targetDirectory` to `targetDirectory`.
3.  SET `this.flowProducer` to `this.queueManager.getFlowProducer()`.
    -   **TDD Anchor**: `TEST_CONSTRUCTOR_HAPPY_PATH`.

**Outputs**:
-   A new `EntityScout` instance.

---

### 3.3. FUNCTION `run()`

**Purpose**: The main execution function that orchestrates scanning the directory and creating the master flow with its child jobs.

**Inputs**: None

**Process**:
1.  LOG "Starting EntityScout run for directory-- " + `this.targetDirectory`.
2.  BEGIN TRY
3.      // Scan the directory to get a flat list of all file paths
4.      `fileList` = `scanDirectoryRecursively(this.targetDirectory)`.
5.
6.      // Handle the case where the directory is empty
7.      IF `fileList` is EMPTY THEN
8.          LOG "Directory is empty. No files to process.".
            -   **TDD Anchor**: `TEST_RUN_HANDLES_EMPTY_DIRECTORY`.
9.          // Optional-- create a master job with a status indicating no files, or simply return.
10.         RETURN.
11.     END IF.
12.
13.     // Pre-calculate file counts for each directory to aid aggregation service
14.     `directoryFileCounts` = CREATE_EMPTY_MAP().
15.     FOR EACH `filePath` IN `fileList`
16.         `parentDir` = `extractParentDirectoryPath(filePath)`.
17.         `currentCount` = `directoryFileCounts.get(parentDir)` OR 0.
18.         `directoryFileCounts.set(parentDir, currentCount + 1)`.
19.     END FOR.
20.
21.     // Prepare the child jobs for the flow
22.     `masterJobName` = "master-analysis-flow--" + `generateTimestamp()`.
23.     `childJobs` = CREATE_EMPTY_LIST().
24.
25.     FOR EACH `filePath` IN `fileList`
26.         `parentDir` = `extractParentDirectoryPath(filePath)`.
27.         `totalCountInDir` = `directoryFileCounts.get(parentDir)`.
28.
29.         `jobPayload` = {
30.             name-- "analyze-file",
31.             data-- {
32.                 filePath-- filePath,
33.                 directoryPath-- parentDir,
34.                 totalFilesInDir-- totalCountInDir
35.             },
36.             queueName-- "file-analysis-queue"
37.         }.
38.         ADD `jobPayload` TO `childJobs`.
39.         -   **TDD Anchor**: `TEST_RUN_CREATES_CHILD_JOBS`.
40.         -   **TDD Anchor**: `TEST_RUN_CHILD_JOBS_HAVE_CORRECT_DATA`.
41.         -   **TDD Anchor**: `TEST_RUN_CHILD_JOBS_HAVE_DIR_FILE_COUNT`.
42.     END FOR.
43.
44.     // Add the entire flow (master job + children) to the queue
45.     CALL `this.flowProducer.add` with arguments-- {
46.         name-- `masterJobName`,
47.         queueName-- "file-analysis-queue", // Master job can be on any relevant queue
48.         data-- { directory-- `this.targetDirectory`, fileCount-- `childJobs.length` },
49.         children-- `childJobs`
50.     }.
51.     LOG "Successfully created master flow job '" + `masterJobName` + "' with " + `childJobs.length` + " child jobs.".
52.     -   **TDD Anchor**: `TEST_RUN_CREATES_MASTER_FLOW`.
53.
54. CATCH `error`
55.     LOG_ERROR "Failed to create job flow-- " + `error.message`.
56.     -   **TDD Anchor**: `TEST_RUN_HANDLES_QUEUE_CONNECTION_ERROR`.
57. END TRY.

**Outputs**: None. The result is the creation of jobs in the queue.

---

### 3.4. FUNCTION `scanDirectoryRecursively(directoryPath)`

**Purpose**: Scans a directory and all its subdirectories, returning a flat list of full file paths.

**Inputs**:
-   `directoryPath`: STRING - The path to the directory to scan.

**Process**:
1.  INITIALIZE `fileList` as an empty ARRAY.
2.  BEGIN TRY
3.      `items` = `listItemsInDirectory(directoryPath)`.
4.      FOR EACH `item` IN `items`
5.          `fullPath` = `combinePath(directoryPath, item.name)`.
6.          IF `item` is a DIRECTORY THEN
7.              `subDirectoryFiles` = RECURSIVE_CALL `scanDirectoryRecursively(fullPath)`.
8.              APPEND all elements from `subDirectoryFiles` TO `fileList`.
9.          ELSE IF `item` is a FILE THEN
10.             ADD `fullPath` TO `fileList`.
11.         END IF.
12.     END FOR.
13. CATCH `scanError`
14.     LOG_ERROR "Error scanning directory '" + `directoryPath` + "'-- " + `scanError.message`.
15.     -   **TDD Anchor**: `TEST_RUN_HANDLES_FILE_SCAN_ERROR`.
16.     THROW new Error("Failed to scan directory.").
17. END TRY.
18. RETURN `fileList`.
19. -   **TDD Anchor**: `TEST_RUN_SCANS_DIRECTORY`.

**Outputs**:
-   `fileList`: ARRAY of STRINGS - A flat list of full file paths.

---
### 3.5 HELPER FUNCTION `extractParentDirectoryPath(filePath)`

**Purpose**: Extracts the parent directory path from a full file path.

**Inputs**:
- `filePath`: STRING - The full path to a file.

**Process**:
1.  Use platform-specific path manipulation logic to find the last directory separator.
2.  RETURN the substring of `filePath` from the beginning to the last separator.

**Outputs**:
- STRING: The path to the parent directory.