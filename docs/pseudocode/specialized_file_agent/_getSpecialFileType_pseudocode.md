# Pseudocode for `_getSpecialFileType` Method

## Objective

This document outlines the logic for the `_getSpecialFileType` method within the `SpecializedFileAgent`. The method's purpose is to identify if a given file path corresponds to a "special" file type based on a predefined set of prioritized patterns. This revision clarifies that matching should be performed on the full filename, not an ambiguous "basename."

## Method Signature

`FUNCTION _getSpecialFileType(filePath)`

## Parameters

-   `filePath` (String) -- The full path to the file being analyzed.

## Returns

-   (String) -- The type of the special file (e.g., "config", "manifest") if a match is found.
-   (null) -- If the file does not match any special file patterns or if the input is invalid.

## Constants

-   `SPECIAL_FILE_PATTERNS` (Array of Objects) -- A prioritized list of rules for identifying special files. Each object contains a `pattern` (regex or string) and a `type` (string).
    -   Example -- `[{ pattern: "package.json", type: "manifest" }, { pattern: /\.config\.js$/, type: "config" }]`

## Pseudocode

```pseudocode
FUNCTION _getSpecialFileType(filePath):
  // TDD ANCHOR -- TEST('should handle null or undefined filePath gracefully')
  IF filePath is null or not a string:
      RETURN null
  END IF

  // Step 1: Explicitly extract the full filename (e.g., 'app.config.js') from the full path.
  // This avoids ambiguity with directory names or partial names.
  fileName = extractFileNameFromPath(filePath)

  // Step 2: Input validation on the extracted filename.
  // TDD ANCHOR -- TEST('should return null for an empty or null filename after extraction')
  IF fileName is null or empty:
      RETURN null
  END IF

  // Step 3: Iterate through the patterns in their prioritized order.
  // The first pattern that matches wins, ensuring specificity (e.g., 'package.json' is not a generic 'json' file).
  FOR each rule in SPECIAL_FILE_PATTERNS:
    // The matching logic must be robust enough for both exact strings and regular expressions.
    IF rule.pattern matches fileName:
      // TDD ANCHOR -- TEST('should return "manifest" for exact match "package.json" due to priority')
      // TDD ANCHOR -- TEST('should return "config" for a filename with multiple dots like "app.config.js"')
      // TDD ANCHOR -- TEST('should prioritize specific patterns over general ones, e.g., package.json is not "config"')
      RETURN rule.type // First match wins
    END IF
  END FOR

  // Step 4: If no pattern matches after checking all rules, it's not a special file.
  // TDD ANCHOR -- TEST('should return null for a non-special file like "my_component.js"')
  RETURN null
END FUNCTION

// Helper function to be implemented separately
FUNCTION extractFileNameFromPath(filePath):
  // Logic to extract the filename from a path, e.g., by splitting by '/' or '\' and taking the last part.
END FUNCTION
```

## TDD Anchors Summary

-   **Graceful Failure** -- `TEST('should handle null or undefined filePath gracefully')`
-   **Invalid Filename** -- `TEST('should return null for an empty or null filename after extraction')`
-   **Multi-dot Filename** -- `TEST('should return "config" for a filename with multiple dots like "app.config.js"')`
-   **Exact Match Priority** -- `TEST('should return "manifest" for exact match "package.json" due to priority')`
-   **Non-Special File** -- `TEST('should return null for a non-special file like "my_component.js"')`
-   **Pattern Specificity** -- `TEST('should prioritize specific patterns over general ones, e.g., package.json is not "config"')`