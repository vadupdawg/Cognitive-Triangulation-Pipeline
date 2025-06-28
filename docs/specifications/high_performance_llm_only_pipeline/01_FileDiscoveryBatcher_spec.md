# Spec-- 01 - `FileDiscoveryBatcher` Worker

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Initial Draft

## 1. Overview

The `FileDiscoveryBatcher` is a Node.js `worker_thread` responsible for the first stage of the analysis pipeline. Its primary function is to scan the project directory for source code files, read their content, and group them into token-aware batches. This process must be efficient and non-blocking to ensure the main application remains responsive.

This worker implements the "Industry Standard" I/O processing path and the "Simplicity-First" batching strategy identified in the [`LLM_Only_Pipeline_Research_Report.md`](../../research/LLM_Only_Pipeline_Research_Report.md:1).

## 2. Class Definition

### `FileDiscoveryBatcher`

This class encapsulates the logic for file discovery and batching. It is designed to be instantiated and run within a dedicated `worker_thread`.

#### **Properties**

*   `tokenizer`-- An instance of a Hugging Face `Tokenizer`, loaded from the Deepseek model's tokenizer files.
*   `maxTokensPerBatch`-- `Number`. The maximum number of tokens allowed in a single batch. This is a hard limit.
    *   **Default--** 65,000
*   `promptOverhead`-- `Number`. A reserved number of tokens to account for the static parts of the prompt template used by the `LLMAnalysisWorker`. This ensures the final prompt does not exceed the context window.
    *   **Default--** 1,000 (Estimate, should be configurable)
*   `targetDirectory`-- `string`. The root directory to scan for files.
*   `globPatterns`-- `string[]`. An array of glob patterns to include/exclude files.
    *   **Default--** `['**/*.js', '**/*.py', '!**/node_modules/**', '!**/.git/**']`

#### **Constructor**

*   `constructor(options)`--
    *   **`options`**-- `Object`. Configuration object.
        *   `targetDirectory`-- `string`. **Required**.
        *   `globPatterns`-- `string[]`. Optional.
        *   `maxTokensPerBatch`-- `Number`. Optional.
        *   `promptOverhead`-- `Number`. Optional.

## 3. Core Functions and Logic

### `async initialize()`

*   **Description--** Loads the Hugging Face tokenizer from a known file path. This is an asynchronous operation and must complete before any batching can occur.
*   **Parameters--** None.
*   **Returns--** `Promise<void>`.
*   **Logic--**
    1.  Uses `Tokenizer.fromFile()` from `@huggingface/tokenizers` to load the `tokenizer.json`.
    2.  Assigns the loaded tokenizer to the `this.tokenizer` property.

### `async run()`

*   **Description--** The main entry point for the worker. It orchestrates the file discovery, token counting, and batching process.
*   **Parameters--** None.
*   **Returns--** `Promise<void>`.
*   **Logic--**
    1.  Calls `discoverFiles()` to get a list of all file paths.
    2.  Calls `createBatches()` with the list of file paths.
    3.  For each batch returned, it creates a `FileBatch` job and adds it to the `llm-analysis-queue` using the `QueueManager`.
    4.  Logs the total number of files found and batches created.

### `async discoverFiles()`

*   **Description--** Uses `fast-glob` to find all files matching the configured glob patterns within the `targetDirectory`.
*   **Parameters--** None.
*   **Returns--** `Promise<string[]>`. A list of file paths.
*   **Implementation--**
    *   Utilizes the `glob.stream()` method from `fast-glob` for memory efficiency when scanning large directories.

### `async createBatches(filePaths)`

*   **Description--** Implements the "fill-the-bucket" batching algorithm. It iterates through files, reads them, counts their tokens, and adds them to a batch until the batch is "full".
*   **Parameters--**
    *   `filePaths`-- `string[]`. The list of file paths to process.
*   **Returns--** `Promise<Array<Object>>`. An array of batch objects. Each batch object conforms to the `FileBatch` job data model.
*   **Algorithm--**
    1.  Initialize `batches` array and a `currentBatch` object.
    2.  Initialize `currentTokenCount` to 0.
    3.  Loop through each `filePath` in `filePaths`.
    4.  Read the file content asynchronously (`fs.promises.readFile`).
    5.  Count the tokens in the file content using `this.tokenizer.encode(content)`.
    6.  If `currentTokenCount` + `fileTokenCount` > (`this.maxTokensPerBatch` - `this.promptOverhead`)--
        a.  Push `currentBatch` to the `batches` array.
        b.  Reset `currentBatch` to a new empty batch.
        c.  Reset `currentTokenCount` to 0.
    7.  Add the file `{ path, content }` to `currentBatch.files`.
    8.  Add `fileTokenCount` to `currentTokenCount`.
    9.  After the loop, if `currentBatch` is not empty, push it to the `batches` array.
    10. Return the `batches` array.

## 4. Job Output Data Structure

The worker will produce jobs for the `llm-analysis-queue` with the following structure. See [`04_Job_Data_Models_spec.md`](./04_Job_Data_Models_spec.md:1) for the formal definition.

### `FileBatch` Job Payload

```json
{
  "batchId": "uuid-v4-string",
  "files": [
    {
      "path": "src/services/someService.js",
      "content": "const x = 1; ..."
    },
    {
      "path": "src/utils/helpers.js",
      "content": "export function doSomething() { ... }"
    }
  ]
}
```

## 5. TDD Anchors / Pseudocode Stubs

```
TEST 'FileDiscoveryBatcher.run()' should discover files and create at least one batch.
  - Mock `fast-glob` to return a fixed set of file paths.
  - Mock `fs.readFile` to return content.
  - Mock `@huggingface/tokenizers` to return a fixed token count per file.
  - Mock `QueueManager.addJob`.
  - Instantiate and run the batcher.
  - Assert that `QueueManager.addJob` was called with a valid batch structure.

TEST 'FileDiscoveryBatcher.createBatches()' should correctly split files into multiple batches based on token limits.
  - Provide a list of files where the total token count exceeds the batch limit.
  - Assert that the function returns more than one batch.
  - Assert that no single batch's token count exceeds the configured limit.

TEST 'FileDiscoveryBatcher.createBatches()' should handle a single file that exceeds the token limit.
  - Provide a single file path with a token count > maxTokensPerBatch.
  - The batcher should place this single file into its own batch and log a warning.
  - The batch should still be created and sent to the next worker, which will be responsible for handling oversized inputs.