# Pseudocode-- `FileDiscoveryBatcher`

**Version--** 1.0
**Date--** 2025-06-27

## 1. Overview

This document provides language-agnostic pseudocode for the `FileDiscoveryBatcher` class. This class is responsible for discovering source code files, calculating their token counts, and grouping them into appropriately sized batches for further processing by the `LLMAnalysisWorker`.

---

## 2. Class-- FileDiscoveryBatcher

### **Properties**

- `tokenizer`-- Holds an instance of the tokenizer. Initialized as NULL.
- `maxTokensPerBatch`-- NUMBER. The maximum number of tokens allowed in a single batch.
- `promptOverhead`-- NUMBER. A buffer to account for tokens used by the LLM prompt itself.
- `targetDirectory`-- STRING. The root directory for file discovery.
- `globPatterns`-- LIST OF STRINGS. Patterns to include/exclude files during discovery.
- `queueManager`-- An instance of a queue management client.

### **Constructor**

```pseudocode
FUNCTION constructor(options)
  INPUT-- options (OBJECT containing configuration)
    - targetDirectory (STRING, required)
    - globPatterns (LIST OF STRINGS, optional)
    - maxTokensPerBatch (NUMBER, optional)
    - promptOverhead (NUMBER, optional)
    - queueManager (OBJECT, required)

  -- TEST-- Constructor should correctly assign options or defaults.
  this.targetDirectory = options.targetDirectory
  this.globPatterns = options.globPatterns OR default_glob_patterns
  this.maxTokensPerBatch = options.maxTokensPerBatch OR 65000
  this.promptOverhead = options.promptOverhead OR 1000
  this.queueManager = options.queueManager

  IF targetDirectory is not provided THEN
    THROW new Error("targetDirectory is a required option.")
  END IF
  IF queueManager is not provided THEN
    THROW new Error("queueManager is a required option.")
  END IF
END FUNCTION
```

---

## 3. Methods

### **initialize**

```pseudocode
ASYNC FUNCTION initialize()
  -- Initializes the tokenizer required for batching.
  -- TEST-- Should successfully load and assign the tokenizer.
  -- TEST-- Should throw an error if the tokenizer file is not found.
  BEGIN TRY
    -- This path should be configurable or well-known.
    tokenizer_path = "path/to/deepseek/tokenizer.json"
    this.tokenizer = LOAD_TOKENIZER_FROM_FILE(tokenizer_path)
    LOG "Tokenizer initialized successfully."
  CATCH error
    LOG_ERROR "Failed to initialize tokenizer-- " + error.message
    THROW error
  END TRY
END FUNCTION
```

### **run**

```pseudocode
ASYNC FUNCTION run()
  -- Orchestrates the entire file discovery and batching process.
  -- TEST-- Should discover files and create at least one batch for a valid directory.
  -- TEST-- Should handle cases where no files are found.
  LOG "Starting file discovery and batching run..."

  -- 1. Discover files
  filePaths = CALL this.discoverFiles()
  LOG "Discovered " + length(filePaths) + " files."

  IF length(filePaths) IS 0 THEN
    LOG "No files found to process. Exiting run."
    RETURN
  END IF

  -- 2. Create batches
  batches = CALL this.createBatches(filePaths)
  LOG "Created " + length(batches) + " batches."

  -- 3. Enqueue batches
  FOR each batch in batches
    -- The job name should be standardized.
    jobName = "FileBatch"
    -- The queue name should be standardized.
    queueName = "llm-analysis-queue"
    CALL this.queueManager.addJob(queueName, jobName, batch)
    LOG "Enqueued batch " + batch.batchId
  END FOR

  LOG "File discovery and batching run complete."
END FUNCTION
```

### **discoverFiles**

```pseudocode
ASYNC FUNCTION discoverFiles()
  -- Uses a glob utility to find all relevant file paths.
  OUTPUT-- LIST OF STRINGS (file paths)
  -- TEST-- Should correctly apply glob patterns to include and exclude files.
  -- TEST-- Should return an empty list if no files match.
  LOG "Scanning directory-- " + this.targetDirectory

  options = {
    cwd-- this.targetDirectory,
    onlyFiles-- TRUE,
    ignore-- default_ignore_patterns (e.g., node_modules, .git)
  }

  filePaths = GLOB_ASYNC(this.globPatterns, options)

  RETURN filePaths
END FUNCTION
```

### **createBatches**

```pseudocode
ASYNC FUNCTION createBatches(filePaths)
  INPUT-- filePaths (LIST OF STRINGS)
  OUTPUT-- LIST OF OBJECTS (batches)

  -- TEST-- Should create a single batch if total tokens are within the limit.
  -- TEST-- Should split files into multiple batches correctly when the token limit is exceeded.
  -- TEST-- Should handle an empty list of file paths gracefully.
  -- TEST-- Should handle a single file that is larger than the batch limit.

  IF this.tokenizer is NULL THEN
    THROW new Error("Tokenizer is not initialized. Call initialize() first.")
  END IF

  allBatches = []
  currentBatch = CREATE_NEW_BATCH()
  currentTokenCount = 0
  maxTokensForBatch = this.maxTokensPerBatch - this.promptOverhead

  FOR each filePath in filePaths
    BEGIN TRY
      fileContent = READ_FILE_ASYNC(filePath)
      fileTokenCount = this.tokenizer.countTokens(fileContent)

      -- Check if a single file exceeds the limit
      IF fileTokenCount > maxTokensForBatch THEN
        LOG_WARNING "File " + filePath + " (" + fileTokenCount + " tokens) exceeds the batch limit of " + maxTokensForBatch + " tokens."
        -- If the current batch is not empty, push it first.
        IF length(currentBatch.files) > 0 THEN
          ADD currentBatch TO allBatches
          currentBatch = CREATE_NEW_BATCH()
          currentTokenCount = 0
        END IF

        -- Add the oversized file as its own batch.
        ADD {path-- filePath, content-- fileContent} TO currentBatch.files
        currentBatch.tokenCount = fileTokenCount
        ADD currentBatch TO allBatches
        currentBatch = CREATE_NEW_BATCH()
        CONTINUE FOR LOOP
      END IF

      -- Check if adding the next file would exceed the limit
      IF (currentTokenCount + fileTokenCount) > maxTokensForBatch AND length(currentBatch.files) > 0 THEN
        currentBatch.tokenCount = currentTokenCount
        ADD currentBatch TO allBatches
        currentBatch = CREATE_NEW_BATCH()
        currentTokenCount = 0
      END IF

      -- Add the file to the current batch
      ADD {path-- filePath, content-- fileContent} TO currentBatch.files
      currentTokenCount = currentTokenCount + fileTokenCount

    CATCH error
      LOG_ERROR "Could not process file " + filePath + "-- " + error.message
    END TRY
  END FOR

  -- Add the last remaining batch if it's not empty
  IF length(currentBatch.files) > 0 THEN
    currentBatch.tokenCount = currentTokenCount
    ADD currentBatch TO allBatches
  END IF

  RETURN allBatches
END FUNCTION

---

### **Helper-- CREATE_NEW_BATCH**

```pseudocode
FUNCTION CREATE_NEW_BATCH()
  OUTPUT-- OBJECT (a new batch structure)
  RETURN {
    batchId-- GENERATE_UUID(),
    files-- [],
    tokenCount-- 0
  }
END FUNCTION