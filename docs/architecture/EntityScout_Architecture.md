# Architecture Document-- `EntityScout` Agent

## 1. Overview

The `EntityScout` agent is the first-pass analysis component in the Cognitive Triangulation system. It is designed for rapid, LLM-driven identification of "Points of Interest" (POIs) within individual source code files. Its architecture prioritizes resilience and statelessness, incorporating self-correction and data sanitization to handle the unpredictable nature of LLM outputs.

## 2. Architectural Style

The agent follows a **component-based architecture**. It is a self-contained unit with a single responsibility-- analyzing a file and producing a structured report. It interacts with an external LLM service and relies on a utility module for data sanitization.

## 3. Component Breakdown

### 3.1. `EntityScout` Class

This is the primary class for the agent, orchestrating the file analysis process.

#### Class Diagram (Conceptual)

```
+---------------------------+
--      EntityScout          --
+---------------------------+
-- - config-- EntityScoutConfig --
-- - llmClient-- LLMClient     --
+---------------------------+
-- + constructor(config)       --
-- + async run(filePath)     --
-- - async _analyzeFileContent()--
-- - _generatePrompt()       --
-- - _generateCorrectionPrompt()--
-- - _calculateChecksum()    --
+---------------------------+
```

#### Properties

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `config` -- `EntityScoutConfig` -- The configuration object for the agent, containing settings like `maxRetries` and `llmModel`. --
-- `llmClient` -- `LLMClient` -- An abstraction for the Large Language Model API, responsible for making `query` calls. --

#### Methods

##### `constructor(config-- EntityScoutConfig)`
- **Visibility:** `public`
- **Description:** Initializes the agent. It sets the `config` and instantiates the `llmClient`.

##### `async run(filePath-- string)-- Promise<FileAnalysisReport>`
- **Visibility:** `public`
- **Description:** The main public entry point. It reads the file, calculates its checksum, orchestrates the analysis via `_analyzeFileContent`, and returns the final `FileAnalysisReport`.

##### `private async _analyzeFileContent(fileContent-- string)-- Promise<{ pois-- POI[], attempts-- number }>`
- **Visibility:** `private`
- **Description:** Implements the core resilient analysis loop. It calls the LLM, sanitizes the response, validates it, and orchestrates the self-correction retry logic if validation fails.

##### `private _generatePrompt(fileContent-- string)-- string`
- **Visibility:** `private`
- **Description:** Constructs the initial, detailed prompt to be sent to the LLM for POI extraction.

##### `private _generateCorrectionPrompt(fileContent-- string, invalidOutput-- string, errorMessage-- string)-- string`
- **Visibility:** `private`
- **Description:** Constructs a follow-up prompt when the LLM returns invalid data, guiding it to fix its previous response.

##### `private _calculateChecksum(content-- string)-- string`
- **Visibility:** `private`
- **Description:** Computes a SHA256 hash of the file content for identification and caching purposes.

### 3.2. `LLMResponseSanitizer` Utility

A static utility module responsible for cleaning and repairing raw LLM output before it is parsed.

#### Class Diagram (Conceptual)

```
+---------------------------------+
--      <<Utility>>               --
--      LLMResponseSanitizer      --
+---------------------------------+
--                                 --
+---------------------------------+
-- + static sanitize(rawResponse)    --
-- - static _fixTrailingCommas()   --
-- - static _completeTruncatedObject()--
+---------------------------------+
```

#### Methods

##### `static sanitize(rawResponse-- string)-- string`
- **Visibility:** `public`
- **Description:** The main sanitization function. It trims whitespace, extracts JSON from markdown blocks, and calls helper methods to fix common issues.

##### `private static _fixTrailingCommas(jsonString-- string)-- string`
- **Visibility:** `private`
- **Description:** Uses regular expressions to remove trailing commas from objects and arrays.

##### `private static _completeTruncatedObject(jsonString-- string)-- string`
- **Visibility:** `private`
- **Description:** Attempts to fix truncated JSON by appending missing closing brackets (`}`) or braces (`]`).

## 4. Data Models

### 4.1. `EntityScoutConfig`
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `fileExtensions` -- `string[]` -- File extensions to scan. --
-- `llmModel` -- `string` -- LLM model identifier. --
-- `maxFileSize` -- `number` -- Maximum file size in bytes. --
-- `maxRetries` -- `number` -- Self-correction attempts. --

### 4.2. `POI` (Point of Interest)
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `name` -- `string` -- Name of the entity. --
-- `type` -- `string` -- Type of the entity (e.g., `FunctionDefinition`). --
-- `startLine` -- `number` -- Start line number. --
-- `endLine` -- `number` -- End line number. --
-- `confidence` -- `number` -- LLM confidence score (0-1). --

### 4.3. `FileAnalysisReport`
-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `filePath` -- `string` -- Path to the analyzed file. --
-- `fileChecksum` -- `string` -- SHA256 checksum of file content. --
-- `language` -- `string` -- Detected programming language. --
-- `pois` -- `POI[]` -- Array of identified POIs. --
-- `status` -- `string` -- `processed`, `skipped`, or `error`. --
-- `error` -- `string` -- Error message if analysis failed. --
-- `analysisAttempts` -- `number` -- Number of LLM queries made. --

## 5. Interaction Diagram (Sequence)

```
[User] -> [EntityScout.run(filePath)]
    |
    |-- 1. readFile(filePath)
    |
    |-- 2. _calculateChecksum(content)
    |
    |-- 3. _analyzeFileContent(content)
    |   |
    |   |-- 3a. _generatePrompt(content)
    |   |
    |   |-- 3b. llmClient.query(prompt)
    |   |
    |   |-- 3c. LLMResponseSanitizer.sanitize(rawResponse)
    |   |
    |   |-- 3d. Validate JSON Schema
    |   |
    |   |-- (If validation fails)
    |   |-- 3e. _generateCorrectionPrompt(...)
    |   |
    |   |-- 3f. llmClient.query(correctionPrompt) -> Loop to 3c
    |
    |-- 4. Create FileAnalysisReport
    |
    <- return FileAnalysisReport
```

## 6. Key Architectural Decisions

- **Resilience through Retry Loop:** The `_analyzeFileContent` method's retry loop is a critical design choice to handle the inherent unreliability of LLM JSON outputs. This prevents the entire system from failing due to a single malformed response.
- **Separation of Concerns:** The `LLMResponseSanitizer` is a separate, static utility. This makes the sanitization logic reusable and testable in isolation from the `EntityScout` agent itself.
- **Stateless Analysis:** Each `run` call is independent. The agent does not maintain state between file analyses, making it highly scalable and easy to parallelize.