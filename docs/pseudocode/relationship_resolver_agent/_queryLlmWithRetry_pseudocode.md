# Pseudocode for `_queryLlmWithRetry` Method

This document outlines the logic for the `_queryLlmWithRetry` method, a resilient wrapper for querying a Large Language Model (LLM) with built-in sanitization, validation, and self-correction retries.

## Method Signature

`PRIVATE ASYNC FUNCTION _queryLlmWithRetry(prompt STRING, schema OBJECT) RETURNS PROMISE<OBJECT>`

## Constants

-   `MAX_RETRIES`-- INTEGER, e.g., 3. The maximum number of times to retry the LLM query.
-   `INITIAL_DELAY`-- INTEGER, e.g., 1000 (in milliseconds). The base delay for exponential backoff.

## TDD Anchors

-   **Test-1 (Happy Path)**-- `TEST: Given a valid prompt and schema, returns a validated JSON object on the first attempt.`
-   **Test-2 (Sanitization)**-- `TEST: Correctly extracts and parses a JSON object from a markdown-formatted LLM response.`
-   **Test-3 (Validation Failure and Retry)**-- `TEST: When the LLM returns a non-compliant object, it triggers a retry with a corrective prompt.`
-   **Test-4 (Parsing Failure and Retry)**-- `TEST: When the LLM returns invalid JSON, it triggers a retry with a corrective prompt.`
-   **Test-5 (Max Retries)**-- `TEST: Throws a final error after exceeding MAX_RETRIES without a valid response.`
-   **Test-6 (Exponential Backoff)**-- `TEST: Applies an increasing delay between each retry attempt.`
-   **Test-7 (Correction Prompt Generation)**-- `TEST: The correction prompt contains the original prompt, the failed response, and the specific validation error.`

## Pseudocode

```plaintext
FUNCTION _queryLlmWithRetry(prompt, schema)
    -- Initialize retry counter and a variable to hold the current prompt
    DECLARE attempts = 0
    DECLARE currentPrompt = prompt
    DECLARE lastError = NULL

    -- Loop for a maximum number of retries
    WHILE attempts < MAX_RETRIES
        -- TDD Anchor: Test-3, Test-4
        TRY
            -- 1. Query the LLM
            -- TDD Anchor: Test-1
            LOG "Attempting to query LLM, attempt #${attempts + 1}"
            DECLARE rawResponse = AWAIT LLM_Client.query(currentPrompt)

            -- 2. Sanitize the response
            -- TDD Anchor: Test-2
            LOG "Sanitizing LLM response"
            DECLARE sanitizedResponse = SanitizeUtil.extractJson(rawResponse)
            IF sanitizedResponse IS NULL THEN
                THROW NEW Error("Failed to extract JSON from LLM response.")
            END IF

            -- 3. Parse the sanitized response
            DECLARE parsedJson = JSON.parse(sanitizedResponse)

            -- 4. Validate the parsed JSON against the schema
            DECLARE validationResult = SchemaValidator.validate(parsedJson, schema)

            -- 5. Handle validation result
            IF validationResult.isValid THEN
                -- TDD Anchor: Test-1
                LOG "Response validated successfully."
                RETURN parsedJson -- Success case
            ELSE
                -- TDD Anchor: Test-3
                LOG "Response failed validation."
                -- Store the error for the correction prompt
                lastError = validationResult.error
                THROW lastError
            END IF

        CATCH error
            -- TDD Anchor: Test-3, Test-4
            LOG "An error occurred on attempt #${attempts + 1}-- ${error.message}"
            attempts = attempts + 1
            lastError = error

            -- Check if we have exhausted retries
            IF attempts >= MAX_RETRIES THEN
                -- TDD Anchor: Test-5
                LOG "Max retries reached. Failing permanently."
                BREAK -- Exit the loop to throw the final error
            END IF

            -- 6. Generate a new prompt for self-correction
            -- TDD Anchor: Test-7
            LOG "Generating correction prompt."
            currentPrompt = generateCorrectionPrompt(currentPrompt, rawResponse, lastError)

            -- 7. Wait with exponential backoff before the next attempt
            -- TDD Anchor: Test-6
            DECLARE delay = INITIAL_DELAY * (2 ** (attempts - 1))
            LOG "Waiting for ${delay}ms before next retry."
            AWAIT sleep(delay)
        END TRY
    END WHILE

    -- If the loop finishes without returning, all retries have failed.
    -- TDD Anchor: Test-5
    THROW NEW Error("Failed to get a valid response from the LLM after ${MAX_RETRIES} attempts. Last error-- ${lastError.message}")
END FUNCTION

-- Helper function to generate the correction prompt
FUNCTION generateCorrectionPrompt(originalPrompt, failedResponse, error)
    -- TDD Anchor: Test-7
    DECLARE correctionMessage = "The previous attempt failed. Please correct the following error and provide a response that strictly adheres to the requested JSON schema."
    RETURN `
        Original Prompt--
        ${originalPrompt}

        ---

        Your Failed Response--
        ${failedResponse}

        ---

        Error Details--
        ${error.message}

        ---

        Correction Request--
        ${correctionMessage}
    `
END FUNCTION