# Specification Document-- `EntityScout` Agent (Fortified Revision)

## 1. Introduction and Vision

The `EntityScout` agent is a specialized component designed for rapid, shallow analysis of source code files. Its primary function is to identify potential "Points of Interest" (POIs) using exclusively Large Language Model (LLM) based analysis. This approach allows for a flexible and language-agnostic discovery process, avoiding the rigidity of Abstract Syntax Trees (ASTs).

This revised document fortifies the agent against the probabilistic nature of LLM outputs. It specifies a resilient architecture featuring targeted self-correcting retry logic to handle `ValidationError` failures, as mandated by the architectural critique ([`docs/devil/critique_report_architecture_20250622_2048.md`](docs/devil/critique_report_architecture_20250622_2048.md)).

## 2. Core Principles and Constraints

-   **LLM-Exclusive Analysis**-- The agent MUST rely solely on LLM-based analysis for identifying POIs.
-   **Shallow Analysis**-- The agent performs a "shallow" scan to identify entities, not to understand their complete behavior.
-   **Statelessness**-- Each file analysis is an independent, stateless operation.
-   **Resilience**-- The agent MUST implement mechanisms to handle and attempt recovery from malformed or non-compliant LLM responses using targeted feedback.

## 3. Configuration

### Configuration Object (`EntityScoutConfig`)

-- Property -- Type -- Description -- Default Value --
-- --- -- --- -- --- -- --- --
-- `fileExtensions` -- `string[]` -- An array of file extensions to be scanned. -- `[]` --
-- `llmModel` -- `string` -- The identifier for the LLM model to be used for analysis. -- `'deepseek-coder'` --
-- `maxFileSize` -- `number` -- The maximum file size in bytes to process. -- `1000000` (1MB) --
-- `maxRetries` -- `number` -- The maximum number of self-correction attempts after a validation failure. -- `2` --

## 4. Data Structures

### Point of Interest (POI)

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `name` -- `string` -- The name of the identified entity (e.g., function name, class name). --
-- `type` -- `string` -- The type of the POI (e.g., `FunctionDefinition`, `ClassDefinition`). --
-- `startLine` -- `number` -- The starting line number of the POI. --
-- `endLine` -- `number` -- The ending line number of the POI. --
-- `confidence` -- `number` -- A score from 0 to 1 indicating the LLM's confidence. --

### File Analysis Report

The final JSON output for a single source code file.

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `filePath` -- `string` -- The absolute path to the analyzed file. --
-- `fileChecksum` -- `string` -- A SHA256 checksum of the file content. --
-- `language` -- `string` -- The detected programming language. --
-- `pois` -- `POI[]` -- An array of `POI` objects identified within the file. --
-- `status` -- `string` -- A granular status code for the analysis outcome. See Status Codes section. --
-- `error` -- `string` -- An error message if the analysis failed. Null otherwise. --
-- `analysisAttempts` -- `number` -- The number of LLM queries made for this file. --

### Status Codes

A formalized set of status codes to provide clear observability into the pipeline.

-- Code -- Description --
-- --- -- --- --
-- `COMPLETED_SUCCESS` -- The file was analyzed successfully. --
-- `SKIPPED_FILE_TOO_LARGE` -- The file was skipped because it exceeded `maxFileSize`. --
-- `FAILED_FILE_NOT_FOUND` -- The file could not be read from the filesystem. --
-- `FAILED_LLM_API_ERROR` -- The LLM API returned a non-recoverable error. --
-- `FAILED_VALIDATION_ERROR` -- The LLM response was invalid and could not be corrected after all retries. --

## 5. `LLMResponseSanitizer` Module (Revised)

A dedicated static module for cleaning common, non-destructive issues from LLM JSON output before parsing.

### `static sanitize(rawResponse-- string)-- string`

-   **Purpose**-- Acts as the main entry point for the sanitization process. It orchestrates calls to specific repair functions.
-   **AI Verifiable End Result**-- A string that is more likely to be valid JSON. It will have attempted to fix issues like trailing commas.

### `private static _fixTrailingCommas(jsonString-- string)-- string`

-   **Purpose**-- Removes trailing commas from JSON objects and arrays.
-   **AI Verifiable End Result**-- A JSON string with all trailing commas removed.

**Note:** The `_completeTruncatedObject` method has been **removed** as per the critique's recommendation due to its high risk of data corruption. Handling truncated or malformed JSON is now the exclusive responsibility of the self-correction loop.

## 6. `EntityScout` Class and Method Specifications

### `EntityScout` Class

#### Properties

-- Property -- Type -- Description --
-- --- -- --- -- --- --
-- `config` -- `EntityScoutConfig` -- The configuration object for the agent. --
-- `llmClient` -- `LLMClient` -- An instance of a client to interact with the configured LLM. --

#### `constructor(config-- EntityScoutConfig)`

-   **Purpose**-- Initializes a new instance of the `EntityScout` agent.
-   **AI Verifiable End Result**-- An `EntityScout` object is created with the provided configuration.

#### `async run(filePath-- string)-- Promise<FileAnalysisReport>`

-   **Purpose**-- The main entry point. It takes a file path, performs a resilient analysis, and returns a report with a granular status.
-   **AI Verifiable End Result**-- A `FileAnalysisReport` is returned with a specific status code (e.g., `COMPLETED_SUCCESS`, `FAILED_VALIDATION_ERROR`).

#### `private async _analyzeFileContent(fileContent-- string)-- Promise<{ pois-- POI[], attempts-- number, error-- Error }>`

-   **Purpose**-- Manages the self-correcting retry loop to get valid POIs from the LLM.
-   **AI Verifiable End Result**-- A promise that resolves to an object containing a validated array of `POI` objects, the number of attempts taken, and any final error. If all retries fail, the `pois` array will be empty and the `error` object will be populated.

#### `private _generatePrompt(fileContent-- string)-- string`

-   **Purpose**-- Creates the initial prompt to be sent to the LLM.
-   **AI Verifiable End Result**-- A string is returned containing the formatted prompt with clear instructions for the LLM to return structured JSON.

#### `private _generateCorrectionPrompt(fileContent-- string, invalidOutput-- string, validationError-- Error)-- string`

-   **Purpose**-- Creates a targeted follow-up prompt to instruct the LLM to correct its previous invalid output.
-   **AI Verifiable End Result**-- A string is returned that provides specific, context-aware guidance to the LLM. For a missing field, it will state-- "Your last response was invalid. The error was-- `{errorMessage}`. Please ensure every object in the `pois` array includes the required `{fieldName}` field." For a type mismatch, it will state-- "The field `{fieldName}` must be of type `{expectedType}`."

#### `private _calculateChecksum(content-- string)-- string`

-   **Purpose**-- Calculates a SHA256 checksum for the given content.
-   **AI Verifiable End Result**-- A SHA256 hash string is returned.

## 7. TDD Anchors (Revised Pseudocode)

### `EntityScout._analyzeFileContent`

```
TEST "_analyzeFileContent should return POIs after one successful attempt"
TEST "_analyzeFileContent should use retry logic with a targeted prompt and succeed on the second attempt"
TEST "_analyzeFileContent should return an empty array and an error after exhausting all retries"

ASYNC FUNCTION _analyzeFileContent(fileContent)
  currentPrompt = this._generatePrompt(fileContent)
  attempts = 0
  lastError = null

  LOOP from 1 to (this.config.maxRetries + 1)
    attempts = attempts + 1
    rawResponse = AWAIT this.llmClient.query(currentPrompt)

    // 1. Sanitize
    sanitizedResponse = LLMResponseSanitizer.sanitize(rawResponse)

    // 2. Parse and Validate
    TRY
      parsedJson = PARSE JSON from sanitizedResponse
      VALIDATE parsedJson against POI list schema
      // If validation is successful--
      RETURN { pois-- parsedJson.pois, attempts-- attempts, error-- null }
    CATCH (validationError)
      lastError = validationError
      // If validation fails and retries are left--
      IF attempts <= this.config.maxRetries THEN
        // Generate a new, targeted prompt asking for a correction
        currentPrompt = this._generateCorrectionPrompt(fileContent, rawResponse, validationError)
      ELSE
        // If out of retries, log the final error
        LOG "Final attempt failed. Error-- " + validationError.message
      END IF
    END TRY
  END LOOP

  // If loop completes without success
  RETURN { pois-- [], attempts-- attempts, error-- lastError }
END FUNCTION
```

### `LLMResponseSanitizer.sanitize` (Revised)
```
TEST "sanitize should fix trailing commas and return a valid JSON string"
TEST "sanitize should extract a JSON object from conversational text"
TEST "sanitize should return the original string if no issues are found"

FUNCTION sanitize(rawResponse)
  // Trim whitespace
  response = TRIM(rawResponse)

  // Attempt to find the start and end of the JSON object
  // This handles cases where the LLM adds conversational text
  startIndex = FIND first '{' or '['
  endIndex = FIND last '}' or ']'
  IF startIndex > -1 AND endIndex > -1 THEN
    response = SUBSTRING from startIndex to endIndex
  END IF

  // Chain repair functions
  response = _fixTrailingCommas(response)
  // _completeTruncatedObject is REMOVED

  RETURN response
END FUNCTION