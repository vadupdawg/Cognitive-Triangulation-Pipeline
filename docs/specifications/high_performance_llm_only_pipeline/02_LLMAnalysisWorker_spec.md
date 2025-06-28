# Spec-- 02 - `LLMAnalysisWorker`

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Initial Draft

## 1. Overview

The `LLMAnalysisWorker` is the second stage in the pipeline. It consumes `FileBatch` jobs from the `llm-analysis-queue`, orchestrates the interaction with the Deepseek LLM, and produces `GraphData` jobs for the final ingestion stage. Its core responsibility is to manage the complexity of prompt engineering and LLM communication.

## 2. Class Definition

### `LLMAnalysisWorker`

This class defines the logic for processing a batch of files and extracting a code graph via the LLM.

#### **Properties**

*   `llmClient`-- An instance of a client class responsible for handling the raw HTTP communication with the Deepseek API.
*   `promptTemplate`-- `string`. The complete, parameterized prompt template to be sent to the LLM.

#### **Constructor**

*   `constructor(options)`--
    *   **`options`**-- `Object`. Configuration object.
        *   `llmApiKey`-- `string`. **Required**. The API key for the Deepseek service.
        *   `promptTemplate`-- `string`. Optional. Allows for overriding the default prompt template.

## 3. Core Functions and Logic

### `async processJob(job)`

*   **Description--** The main function that processes a single job from the queue. It formats the prompt, calls the LLM, and enqueues the result.
*   **Parameters--**
    *   `job`-- `Object`. A `FileBatch` job object from BullMQ.
        *   `job.data`-- The payload, as defined in [`01_FileDiscoveryBatcher_spec.md`](./01_FileDiscoveryBatcher_spec.md:1).
*   **Returns--** `Promise<void>`.
*   **Logic--**
    1.  Calls `formatPrompt()` with the job data to construct the final prompt string.
    2.  Calls `this.llmClient.generate(prompt)` to get the JSON response from the LLM.
    3.  Performs a basic validation on the response to ensure it is valid JSON and contains the expected top-level keys (`pois` and `relationships`).
    4.  Creates a `GraphData` job with the LLM's JSON output.
    5.  Adds the new job to the `graph-ingestion-queue` via the `QueueManager`.

### `formatPrompt(batch)`

*   **Description--** Constructs the full prompt string that will be sent to the LLM. It injects the file contents into the prompt template.
*   **Parameters--**
    *   `batch`-- `Object`. The `FileBatch` job data.
*   **Returns--** `string`. The complete, ready-to-send prompt.
*   **Logic--**
    1.  Iterates through each file in `batch.files`.
    2.  For each file, creates a formatted block, including the file path and content, separated by markers.
    3.  Concatenates all file blocks into a single string.
    4.  Injects the concatenated file string into the main `promptTemplate`.

## 4. Prompt Engineering Strategy

The prompt is designed for zero-shot learning. It provides clear instructions and a schema definition to guide the LLM in producing a structured, consolidated JSON output for the entire batch of files.

### **Full Prompt Template**

```
You are an expert code analysis AI. Your task is to act as a compiler, parsing multiple source code files to identify all Points of Interest (POIs) and the relationships between them.

A POI can be a file, a class, a function, a method, or a variable assignment.

Your output MUST be a single, consolidated JSON object containing two top-level keys-- "pois" and "relationships". Do NOT include any other text, explanations, or markdown formatting in your response.

**JSON Schema Definition--**

- **pois**: An array of objects. Each object represents a single POI and MUST have the following properties--
  - `id` (string)-- A unique identifier for the POI, constructed as `filePath--poiName` for functions/classes, or just `filePath` for file-level POIs.
  - `type` (string)-- The type of POI. Must be one of-- "File", "Class", "Function", "Method", "Variable".
  - `name` (string)-- The name of the POI (e.g., "MyClass", "calculateTotal", "config"). For a "File" POI, this is the file path.
  - `filePath` (string)-- The absolute path to the file where the POI is defined.
  - `startLine` (number)-- The starting line number of the POI definition.
  - `endLine` (number)-- The ending line number of the POI definition.

- **relationships**: An array of objects. Each object represents a directed link from a source POI to a target POI and MUST have the following properties--
  - `source` (string)-- The `id` of the source POI.
  - `target` (string)-- The `id` of the target POI.
  - `type` (string)-- The type of relationship. Must be one of-- "IMPORTS", "DEFINES", "CALLS", "INSTANTIATES".
  - `filePath` (string)-- The file path where the relationship is observed.

**Source Code Files to Analyze--**

Below are the source code files. Analyze all of them and produce one single JSON object that represents the complete graph of all POIs and relationships across all files.

--- FILE START ---
Path-- {{filePath1}}

{{fileContent1}}
--- FILE END ---

--- FILE START ---
Path-- {{filePath2}}

{{fileContent2}}
--- FILE END ---

... more files ...

**JSON Output--**
```

## 5. Expected LLM Output Structure

The worker expects the LLM to return a raw string that is a valid JSON object matching the schema described in the prompt. See [`04_Job_Data_Models_spec.md`](./04_Job_Data_Models_spec.md:1) for the formal definition.

### `GraphData` Job Payload

```json
{
  "batchId": "uuid-v4-string-from-previous-job",
  "graphJson": {
    "pois": [
      {
        "id": "src/main.js--App",
        "type": "Class",
        "name": "App",
        "filePath": "src/main.js",
        "startLine": 5,
        "endLine": 25
      }
    ],
    "relationships": [
      {
        "source": "src/main.js",
        "target": "src/main.js--App",
        "type": "DEFINES",
        "filePath": "src/main.js"
      }
    ]
  }
}
```

## 6. TDD Anchors / Pseudocode Stubs

```
TEST 'LLMAnalysisWorker.processJob()' should format a prompt and enqueue a result.
  - Mock the LLM client to return a valid JSON graph string.
  - Mock `QueueManager.addJob`.
  - Provide a valid `FileBatch` job as input.
  - Run `processJob()`.
  - Assert that the LLM client was called with a correctly formatted prompt.
  - Assert that `QueueManager.addJob` was called with the correct `GraphData` payload.

TEST 'LLMAnalysisWorker.processJob()' should handle an invalid JSON response from the LLM.
  - Mock the LLM client to return a malformed JSON string (e.g., "An error occurred...").
  - The `processJob()` function should catch the JSON parsing error.
  - It should log the error and fail the job using `job.moveToFailed()` so BullMQ can handle retries.

TEST 'formatPrompt()' should correctly inject multiple file contents into the template.
  - Create a batch with two or more files.
  - Run `formatPrompt()`.
  - Assert that the output string contains the content and paths of all files, each wrapped in the specified "--- FILE START ---" and "--- FILE END ---" markers.