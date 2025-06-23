# Pseudocode for `_analyzeFileContent` Method

**Function Signature:** `_analyzeFileContent(fileContent)`

**Purpose:** Manages a self-correcting retry loop to analyze file content with an LLM and extract a validated list of Points of Interest (POIs).

**Inputs:**
-   `fileContent`-- STRING-- The raw text content of the source code file to be analyzed.

**Outputs:**
-   An OBJECT containing--
    -   `pois`-- ARRAY of POI objects-- A validated list of extracted points of interest. Empty if all attempts fail.
    -   `attempts`-- NUMBER-- The number of attempts made to get a valid result from the LLM.

---

### **BEGIN `_analyzeFileContent`**

1.  **Initialization**
    -   `CONSTANT MAX_RETRIES = 3`
    -   `VARIABLE attempts = 0`
    -   `VARIABLE validatedPois = []`
    -   `VARIABLE lastError = NULL`
    -   `VARIABLE llmResponse = NULL`

2.  **Retry Loop**
    -   `WHILE attempts < MAX_RETRIES`
        -   `INCREMENT attempts`
        -   `TRY`
            -   // TEST--behavior--LLM call is made with correct file content and prompt
            -   `llmResponse = CALL this.llmClient.generate(fileContent)` // Asynchronously call the LLM
            -   `IF llmResponse IS NULL OR EMPTY`
                -   `lastError = "LLM returned empty response"`
                -   `CONTINUE WHILE` // Proceed to the next iteration
            -   `END IF`

            -   // TEST--behavior--Correctly parses a valid JSON response from the LLM
            -   `parsedPois = PARSE_JSON(llmResponse)`

            -   // TEST--behavior--Successfully validates a correctly structured POI array
            -   `isValid = VALIDATE_SCHEMA(parsedPois, POI_ARRAY_SCHEMA)`

            -   `IF isValid IS TRUE`
                -   `validatedPois = parsedPois`
                -   // TEST--happy_path--Exits loop on first successful validation
                -   `BREAK WHILE` // Exit loop on success
            -   `ELSE`
                -   `lastError = "Schema validation failed"`
                -   // Log the validation error and the invalid response for debugging
                -   `LOG "Validation failed on attempt " + attempts + "-- Error-- " + lastError`
            -   `END IF`

        -   `CATCH JSON_PARSE_ERROR as error`
            -   `lastError = error`
            -   // TEST--edge_case--Handles malformed JSON from the LLM and retries
            -   `LOG "JSON parsing failed on attempt " + attempts + "-- Error-- " + error.message`
            -   `CONTINUE WHILE`

        -   `CATCH LLM_API_ERROR as error`
            -   `lastError = error`
            -   // TEST--edge_case--Handles LLM API call failures and retries
            -   `LOG "LLM API call failed on attempt " + attempts + "-- Error-- " + error.message`
            -   `CONTINUE WHILE`
        -   `END TRY`
    -   `END WHILE`

3.  **Finalization**
    -   `IF validatedPois IS EMPTY`
        -   // TEST--failure_case--Returns empty array after all retries are exhausted
        -   `LOG "All " + MAX_RETRIES + " attempts failed to get valid POIs. Last error-- " + lastError`
    -   `END IF`

4.  **Return Value**
    -   // TEST--return_value--Returns an object with the correct structure-- { pois, attempts }
    -   `RETURN { pois-- validatedPois, attempts-- attempts }`

### **END `_analyzeFileContent`**