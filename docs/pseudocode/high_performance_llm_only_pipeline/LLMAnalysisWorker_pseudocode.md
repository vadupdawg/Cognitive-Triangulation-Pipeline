# Pseudocode-- `LLMAnalysisWorker`

**Version--** 1.0
**Date--** 2025-06-27

## 1. Introduction

This document provides detailed, language-agnostic pseudocode for the `LLMAnalysisWorker`. This worker is responsible for taking batches of files, formatting them into a detailed prompt, interacting with an LLM to perform code analysis, and enqueuing the structured results for the next stage of the pipeline.

## 2. Dependencies

- **`LLMClient`**-- A client module for interacting with the Deepseek LLM API.
- **`QueueManager`**-- A utility for adding jobs to message queues (e.g., BullMQ).

## 3. Class-- LLMAnalysisWorker

Defines the worker's properties and methods for processing file analysis jobs.

### **Properties**

- `llmClient`-- An instance of `LLMClient` used for API communication.
- `promptTemplate`-- A string containing the base template for the LLM prompt.

---

### **CONSTRUCTOR `(options)`**

Initializes a new instance of the `LLMAnalysisWorker`.

**INPUTS**
- `options`-- OBJECT. Configuration object.
  - `llmApiKey`-- STRING. **Required**. The API key for the LLM service.
  - `promptTemplate`-- STRING. **Optional**. A custom prompt template string to override the default.

**LOGIC**
1.  `TEST 'constructor' should throw an error if llmApiKey is not provided.`
2.  IF `options.llmApiKey` is NULL or UNDEFINED THEN
3.      THROW new Error("LLM API key is required.")
4.  END IF
5.
6.  `TEST 'constructor' should initialize the llmClient.`
7.  INITIALIZE `this.llmClient` with a new `LLMClient` instance, passing `options.llmApiKey`.
8.
9.  `TEST 'constructor' should use the default prompt template if none is provided.`
10. `TEST 'constructor' should use a custom prompt template when provided.`
11. IF `options.promptTemplate` is provided THEN
12.     SET `this.promptTemplate` to `options.promptTemplate`.
13. ELSE
14.     SET `this.promptTemplate` to the default prompt string defined in the specifications.
15. END IF
16.
**OUTPUT**
- A configured instance of `LLMAnalysisWorker`.

---

### **FUNCTION `processJob(job)`**

The primary entry point for processing a job from the `llm-analysis-queue`.

**INPUTS**
- `job`-- OBJECT. The job object from the queue.
  - `job.data`-- OBJECT. The `FileBatch` payload.
    - `batchId`-- STRING. A unique identifier for the batch.
    - `files`-- ARRAY of OBJECTS. Each object has `path` and `content`.

**LOGIC**
1.  BEGIN TRY
2.      `TEST 'processJob' should correctly format a prompt and enqueue a valid result.`
3.      // 1. Format the prompt
4.      DECLARE `batchData` = `job.data`.
5.      DECLARE `prompt` = CALL `this.formatPrompt(batchData)`.
6.
7.      // 2. Call the LLM
8.      DECLARE `llmResponseString` = AWAIT `this.llmClient.generate(prompt)`.
9.
10.     // 3. Parse and validate the response
11.     DECLARE `graphJson`.
12.     BEGIN TRY
13.         SET `graphJson` = PARSE_JSON(`llmResponseString`).
14.     CATCH JSONParseError
15.         `TEST 'processJob' should handle an invalid JSON response from the LLM.`
16.         LOG "Failed to parse LLM response as JSON."
17.         AWAIT `job.moveToFailed({ message-- "Invalid JSON response", response-- llmResponseString })`.
18.         RETURN.
19.     END TRY
20.
21.     `TEST 'processJob' should fail the job if the parsed JSON is missing the 'pois' key.`
22.     `TEST 'processJob' should fail the job if the parsed JSON is missing the 'relationships' key.`
23.     IF `graphJson.pois` is UNDEFINED OR `graphJson.relationships` is UNDEFINED THEN
24.         LOG "LLM response is missing required top-level keys ('pois', 'relationships')."
25.         AWAIT `job.moveToFailed({ message-- "Response missing required keys." })`.
26.         RETURN.
27.     END IF
28.
29.     // 4. Create and enqueue the next job
30.     DECLARE `graphDataPayload` = {
31.         `batchId`-- `batchData.batchId`,
32.         `graphJson`-- `graphJson`
33.     }.
34.
35.     AWAIT `QueueManager.addJob('graph-ingestion-queue', graphDataPayload)`.
36.     LOG "Successfully processed batch and enqueued for graph ingestion."
37.
38. CATCH `error`
39.     `TEST 'processJob' should handle unexpected errors during processing.`
40.     LOG "An unexpected error occurred in processJob-- " + `error.message`.
41.     AWAIT `job.moveToFailed(error)`.
42. END TRY

**OUTPUT**
- VOID. The function enqueues a new job or moves the current one to failed.

---

### **FUNCTION `formatPrompt(batch)`**

Constructs the final prompt string by injecting file contents into the template.

**INPUTS**
- `batch`-- OBJECT. The `FileBatch` data.
  - `files`-- ARRAY of OBJECTS. Each object has `path` and `content`.

**LOGIC**
1.  `TEST 'formatPrompt' should correctly inject a single file's content and path.`
2.  `TEST 'formatPrompt' should correctly inject multiple files' contents and paths.`
3.  DECLARE `fileBlocksString` = "".
4.
5.  FOR EACH `file` IN `batch.files` LOOP
6.      DECLARE `fileBlock` = `"\n--- FILE START ---\nPath-- {file.path}\n\n{file.content}\n--- FILE END ---\n"`.
7.      CONCATENATE `fileBlock` to `fileBlocksString`.
8.  END LOOP
9.
10. DECLARE `finalPrompt` = REPLACE placeholder in `this.promptTemplate` with `fileBlocksString`.
11. RETURN `finalPrompt`.

**OUTPUT**
- STRING. The complete, formatted prompt to be sent to the LLM.
