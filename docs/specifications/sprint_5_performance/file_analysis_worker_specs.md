# Specification: File Analysis Worker

**Sprint:** 5 - Performance Refactoring
**Component:** `src/workers/fileAnalysisWorker.js`
**Purpose:** To create a dedicated, scalable worker process that consumes jobs from the `file-analysis-queue` and performs the initial, self-contained analysis of a single source file.

---

## 1. Functional Requirements

*   The worker must connect to the `file-analysis-queue` upon startup.
*   The worker must process jobs from the queue according to a specified concurrency level.
*   For each job, the worker must--
    1.  Validate the job payload.
    2.  Read the content of the file specified in `job.data.filePath`.
    3.  Execute the core analysis logic (i.e., querying the LLM to find POIs).
    4.  Save the resulting POIs and any identified intra-file relationships to the SQLite database.
*   The worker must adhere to the default retry policy defined in the `QueueManager`.
*   If an error occurs, the job will be retried. After exhausting all retries, the job will be moved to the `failed-jobs` queue by the system.

---

## 2. Non-Functional Requirements

*   **Scalability:** The architecture must support running multiple instances of this worker process simultaneously.
*   **Isolation:** The worker should be a completely independent process. A crash in one worker should not affect other workers.
*   **Resource Management:** The worker should manage its resources (database connections, memory) efficiently.

---

## 3. Data Integrity Mandates

*   **Atomic Transactions:** All database write operations performed for a single job **must** be wrapped in a single, atomic SQLite transaction. The process is `BEGIN TRANSACTION;` -> (all INSERTs/UPDATEs) -> `COMMIT;`. If any operation fails, the entire transaction must be rolled back. This guarantees that a job either fully succeeds or leaves the database in its original state.
*   **Idempotent Writes:** To handle job retries gracefully without creating duplicate data, all `INSERT` statements must use `INSERT ... ON CONFLICT DO UPDATE` (or equivalent `MERGE`) logic. This ensures that if a job runs more than once, it will update existing records instead of failing or creating duplicates.

---

## 4. Class and Function Definitions

### File: `src/workers/fileAnalysisWorker.js`

#### **Class: `FileAnalysisWorker`**

*   **Properties:**
    *   `worker`: `BullMQ.Worker` - The BullMQ worker instance, created via the `QueueManager`.

*   **Methods:**
    *   `constructor(concurrency = 4)`
        *   **Purpose:** Initializes the worker using `QueueManager.createWorker`, which applies the standard policies for retries and stalled job handling.
    *   `async processJob(job)`
        *   **Parameters:**
            *   `job` (`BullMQ.Job`): The job object from the queue.
        *   **Returns:** `Promise<void>`
        *   **Purpose:** The core processing logic for a single job. It orchestrates file reading, analysis, and saving the results.
    *   `async _analyzeFileContent(filePath, fileContent)`
        *   **Parameters:**
            *   `filePath` (string): The path to the file.
            *   `fileContent` (string): The content of the file.
        *   **Returns:** `Promise<Object>` - An object containing the analysis results (POIs, relationships).
        *   **Purpose:** A private method containing the refactored logic for the intra-file analysis pass.
    *   `async _saveResults(analysisResults)`
        *   **Parameters:**
            *   `analysisResults` (Object): The results from `_analyzeFileContent`.
        *   **Returns:** `Promise<void>`
        *   **Purpose:** A private method to write the analysis results to the SQLite database, strictly adhering to the **Atomic Transaction** and **Idempotent Write** mandates defined above.

---

## 5. TDD Anchors / Pseudocode Stubs

```
TEST "Worker should process a valid job successfully"
    -- 1. Mock the file system, LLM client, and database.
    -- 2. Create a test job and add it to a test queue.
    -- 3. Instantiate the FileAnalysisWorker and wait for the job to be processed.
    -- 4. Assert that the database mock's 'beginTransaction' method was called.
    -- 5. Assert that the database mock's 'commit' method was called.
    -- 6. Assert that the database was called with idempotent statements (containing 'ON CONFLICT').

TEST "Worker should rollback transaction if any database write fails"
    -- 1. Mock the database `execute` method to throw an error on the second call.
    -- 2. Instantiate the worker and process a job.
    -- 3. Assert that the database mock's 'beginTransaction' method was called.
    -- 4. Assert that the database mock's 'rollback' method was called.
    -- 5. Assert that the database mock's 'commit' method was NOT called.
    -- 6. Assert that the job is eventually marked as failed after retries.