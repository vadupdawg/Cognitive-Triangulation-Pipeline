# Pseudocode: `_resolveRelationships` Method

**Owner**: `RelationshipResolutionWorker`
**Purpose**: To query an LLM with the combined context of multiple file analysis results to discover inter-file relationships.

---

## 1. Method Definition

```
PRIVATE ASYNC FUNCTION _resolveRelationships(analysisResultsBatch)
```

### **INPUTS:**
- `analysisResultsBatch` (Object/Array): A collection of file analysis results for a group of files (e.g., from the same directory). Each result should contain at least the file path and the entities (functions, classes, etc.) found within it.
  - Example Structure: `[{ filePath: "path/to/fileA.js", entities: [...] }, { filePath: "path/to/fileB.js", entities: [...] }]`

### **OUTPUT:**
- `Promise<Object>`: A promise that resolves to an object containing the newly discovered inter-file relationships, structured for easy database insertion.
  - Example Structure: `{ relationships: [{ source_file: "...", target_file: "...", type: "...", ... }] }`

### **TDD ANCHORS:**
- `TEST happy path with multiple files returns valid inter-file relationships`
- `TEST with a batch containing only one file, returns an empty relationships object`
- `TEST when analysisResultsBatch is empty or null, returns an empty relationships object`
- `TEST LLM returns malformed or non-JSON response, throws a parsing error after retries`
- `TEST LLM returns a valid but empty list of relationships, returns an empty relationships object`
- `TEST LLM API call fails, retries the specified number of times, and then throws an error`
- `TEST prompt correctly aggregates and formats context from all files in the batch`

---

## 2. Method Logic

```
BEGIN FUNCTION _resolveRelationships

    // TDD Anchor: Test for empty or invalid input
    IF analysisResultsBatch IS NULL OR analysisResultsBatch.length < 2 THEN
        LOG "Batch has fewer than two files, skipping inter-file analysis."
        RETURN { relationships: [] }
    END IF

    // 1. Aggregate Context and Generate Prompt
    // Combine the information from all file analyses into a single context
    // that the LLM can use to find connections.
    LET combinedContext = ""
    FOR EACH fileResult IN analysisResultsBatch
        combinedContext += "File: " + fileResult.filePath + "\n"
        combinedContext += "Entities: " + JSON.stringify(fileResult.entities) + "\n\n"
    END FOR

    LET prompt = CONSTRUCT_LLM_PROMPT(combinedContext)
    // The prompt should specifically ask the LLM to identify relationships
    // BETWEEN the files, not within them, and to return the output
    // in a specific, parsable JSON format.

    // 2. Query LLM with Retry Logic
    TRY
        // TDD Anchor: Test that LLM is called with the correct prompt
        // TDD Anchor: Test retry mechanism on LLM failure
        LET llmResponse = AWAIT self.queryLlmWithRetry(prompt)

        // 3. Parse and Sanitize Response
        // TDD Anchor: Test handling of malformed JSON from LLM
        LET parsedRelationships = PARSE_AND_SANITIZE_JSON(llmResponse)

        // TDD Anchor: Test handling of valid but empty response
        IF parsedRelationships IS NULL OR parsedRelationships.relationships IS EMPTY THEN
            RETURN { relationships: [] }
        END IF

        // 4. Return Structured Results
        RETURN parsedRelationships

    CATCH error
        LOG_ERROR "Failed to resolve relationships after multiple retries: " + error.message
        // TDD Anchor: Test that an error is thrown after all retries fail
        THROW new Error("Could not resolve relationships from LLM.")
    END TRY

END FUNCTION
```

---

## 3. Helper Functions (Conceptual)

-   **`CONSTRUCT_LLM_PROMPT(context)`**: A helper function to build the detailed instruction string for the LLM, telling it what to look for and how to format the response.
-   **`queryLlmWithRetry(prompt)`**: A robust wrapper around the LLM client call that handles transient network errors and API failures by retrying the request a configured number of times. (This might be a shared utility).
-   **`PARSE_AND_SANITIZE_JSON(jsonString)`**: A helper that safely parses a JSON string and validates its structure against a predefined schema for relationships, preventing injection of malformed data.