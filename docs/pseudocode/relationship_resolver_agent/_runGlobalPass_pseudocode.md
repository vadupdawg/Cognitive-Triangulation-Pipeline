# Pseudocode for `RelationshipResolver._runGlobalPass`

This document outlines the logic for the `_runGlobalPass` method, which is the third and final pass of the relationship resolution process. Its purpose is to identify relationships between Points of Interest (POIs) that span across different directories.

## Method Signature

`private async _runGlobalPass(dirSummaries-- DirectoryAnalysisSummary[])-- Promise<Relationship[]>`

## SPARC Pseudocode

```
FUNCTION _runGlobalPass(dirSummaries)
  -- Purpose-- Pass 3-- The final pass. Analyzes the summaries of all directories
  -- to find the remaining cross-directory relationships.
  -- INPUT-- dirSummaries-- An array of DirectoryAnalysisSummary objects.
  -- Each summary contains the directory path and a text summary of its contents and potential relationships.
  -- OUTPUT-- A Promise that resolves to an array of Relationship objects connecting POIs across different directories.

  -- TDD ANCHOR-- TEST behavior when input array has fewer than two summaries.
  -- It should not call the LLM and should return an empty array immediately.
  IF dirSummaries IS NULL OR dirSummaries.length < 2 THEN
    LOG "Skipping global pass-- not enough directories to compare."
    RETURN an empty array
  END IF

  -- Initialize a list to hold the relationships found in this pass.
  LET crossDirectoryRelationships = []

  -- TDD ANCHOR-- TEST the prompt generation logic.
  -- Ensure it correctly formats the summaries and provides clear instructions to the LLM.
  LET prompt = buildGlobalPassPrompt(dirSummaries)

  TRY
    -- TDD ANCHOR-- TEST the happy path where the LLM identifies one or more valid cross-directory relationships.
    -- Make an asynchronous call to the LLM with the generated prompt.
    LET llmResponse = AWAIT this.llmClient.generate(prompt)

    -- TDD ANCHOR-- TEST the behavior with a malformed or non-JSON response from the LLM.
    -- The sanitizer should handle the error gracefully and return an empty array.
    LET sanitizedResponse = LLMResponseSanitizer.sanitize(llmResponse, "RelationshipArraySchema")

    -- TDD ANCHOR-- TEST the behavior when the LLM returns a valid but empty list of relationships.
    IF sanitizedResponse IS NOT NULL AND sanitizedResponse.length > 0 THEN
      -- The response is expected to be an array of Relationship objects.
      crossDirectoryRelationships = sanitizedResponse
    END IF

  CATCH error
    -- TDD ANCHOR-- TEST the error handling when the LLM client throws an exception.
    -- The method should log the error and return an empty array, not crash.
    LOG "Error during _runGlobalPass-- " + error.message
    -- On failure, return an empty array to prevent downstream issues.
    RETURN an empty array
  END TRY

  RETURN crossDirectoryRelationships
END FUNCTION

FUNCTION buildGlobalPassPrompt(dirSummaries)
  -- Purpose-- Constructs the prompt for the LLM for the global pass.
  -- INPUT-- dirSummaries-- The array of DirectoryAnalysisSummary objects.
  -- OUTPUT-- A string representing the complete prompt.

  LET promptHeader = "You are an expert software architect. Your task is to analyze the following directory summaries from a codebase. Identify and list all high-confidence relationships (e.g., function calls, class inheritance, object instantiation, data dependencies) that exist *between* different directories. Focus exclusively on cross-directory connections. Do not list relationships contained within a single directory."

  LET promptBody = ""
  FOR EACH summary IN dirSummaries
    promptBody += "--- DIRECTORY SUMMARY ---\n"
    promptBody += "Directory Path-- " + summary.directoryPath + "\n"
    promptBody += "Summary-- \n" + summary.summaryText + "\n\n"
  END FOR

  LET promptFooter = "Based on the summaries above, provide a JSON array of relationship objects. Each object must have 'sourceFile', 'targetFile', 'type', and a 'description'. Ensure 'sourceFile' and 'targetFile' are in different directories."

  RETURN promptHeader + "\n\n" + promptBody + "\n" + promptFooter
END FUNCTION
```

## Data Structures

### DirectoryAnalysisSummary
-   `directoryPath`-- string-- The absolute or relative path to the directory.
-   `summaryText`-- string-- An AI-generated summary of the directory's contents, key entities, and potential internal relationships.

### Relationship
-   `sourceFile`-- string-- The path to the source file of the relationship.
-   `targetFile`-- string-- The path to the target file of the relationship.
-   `type`-- string-- The type of relationship (e.g., 'CALLS', 'IMPLEMENTS', 'IMPORTS').
-   `description`-- string-- A natural language description of the relationship.