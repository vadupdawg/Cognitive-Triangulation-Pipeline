# LLMResponseSanitizer Pseudocode

## CLASS LLMResponseSanitizer

### METHOD sanitize(rawResponse as String)

**Description:**
Takes a raw string response from an LLM and attempts to clean and parse it into a valid JSON object. It orchestrates a series of cleaning and fixing operations.

**Inputs:**
- `rawResponse`: The raw string response from the LLM.

**Output:**
- A valid JSON object.

**TDD Anchors:**
- TEST `sanitize` with a perfect JSON string, expecting it to pass through unchanged.
- TEST `sanitize` with a JSON string wrapped in markdown, expecting the JSON to be extracted and parsed successfully.
- TEST `sanitize` with a JSON string containing trailing commas, expecting it to be fixed and parsed successfully.
- TEST `sanitize` with a truncated JSON object, expecting it to be completed and parsed successfully.
- TEST `sanitize` with a string that is completely un-salvageable, expecting an error or specific failure indicator.
- TEST `sanitize` with an empty or whitespace-only string, expecting an error or null output.

**Logic:**
1.  Initialize `cleanedResponse` with `rawResponse`.
2.  `cleanedResponse` = `cleanedResponse`.trim()
3.  `cleanedResponse` = CALL `_extractJsonFromMarkdown(cleanedResponse)`
4.  `cleanedResponse` = CALL `_removeTrailingCommas(cleanedResponse)`
5.  `cleanedResponse` = CALL `_fixTruncatedObject(cleanedResponse)`
6.  TRY to parse `cleanedResponse` as JSON.
7.  IF parsing is successful, RETURN the parsed JSON object.
8.  CATCH parsing error:
9.      -- Log the final failed string and the parsing error for debugging.
10.     -- THROW a new error "Failed to parse LLM response after sanitization."
11. END TRY

---

### HELPER METHOD _extractJsonFromMarkdown(text as String)

**Description:**
Extracts a JSON object from a markdown code block (e.g., ```json ... ```). If no markdown block is found, it returns the original text.

**Inputs:**
- `text`: The string to search for a markdown-enclosed JSON block.

**Output:**
- The extracted JSON string, or the original text if no block is found.

**TDD Anchors:**
- TEST `_extractJsonFromMarkdown` with a string containing a valid ```json ... ``` block.
- TEST `_extractJsonFromMarkdown` with a string containing a ``` ... ``` block without the 'json' identifier.
- TEST `_extractJsonFromMarkdown` with a string that has text before and after the markdown block.
- TEST `_extractJsonFromMarkdown` with a string that has no markdown block, expecting the original string to be returned.
- TEST `_extractJsonFromMarkdown` with a string containing multiple markdown blocks, expecting the first one to be extracted.

**Logic:**
1.  Define a regular expression to find a markdown code block (e.g., `(?s)```(?:json)?\n?(.*?)\n?```).
2.  Search for a match in the input `text` using the regex.
3.  IF a match is found:
4.      RETURN the first captured group (the content inside the block).
5.  ELSE:
6.      RETURN the original `text`.
7.  END IF

---

### HELPER METHOD _removeTrailingCommas(jsonString as String)

**Description:**
Removes trailing commas from JSON objects and arrays to prevent parsing errors.

**Inputs:**
- `jsonString`: A string that is supposed to be a JSON object but may have trailing commas.

**Output:**
- A JSON string with trailing commas removed.

**TDD Anchors:**
- TEST `_removeTrailingCommas` with a trailing comma in an object `{"a":1,}`.
- TEST `_removeTrailingCommas` with a trailing comma in an array `[1,2,3,]`.
- TEST `_removeTrailingCommas` with nested trailing commas.
- TEST `_removeTrailingCommas` with a valid JSON string, expecting no changes.
- TEST `_removeTrailingCommas` with a string that is not JSON, expecting it to pass through without error.

**Logic:**
1.  Use a regular expression to find commas followed by only whitespace before a closing brace `}` or bracket `]`.
2.  Replace all occurrences of this pattern with just the closing brace or bracket.
3.  RETURN the modified string.

---

### HELPER METHOD _fixTruncatedObject(jsonString as String)

**Description:**
Attempts to complete a truncated JSON string by appending the necessary closing braces and brackets.

**Inputs:**
- `jsonString`: A potentially truncated JSON string.

**Output:**
- A potentially fixed JSON string.

**TDD Anchors:**
- TEST `_fixTruncatedObject` with an unclosed object `{"a": 1`.
- TEST `_fixTruncatedObject` with an unclosed array `["a", "b"`.
- TEST `_fixTruncatedObject` with nested unclosed structures `{"a": ["b"}`.
- TEST `_fixTruncatedObject` with a string that is not truncated, expecting no changes.
- TEST `_fixTruncatedObject` with a string ending in an incomplete key or value, expecting it to handle it gracefully (e.g., by not changing it).

**Logic:**
1.  Initialize `openBraces`, `openBrackets` counters to 0.
2.  Initialize `inString` flag to `false`.
3.  Iterate through each character of `jsonString`:
4.      IF character is `"` and the previous character is not an escape `\`:
5.          `inString` = NOT `inString`.
6.      IF NOT `inString`:
7.          IF character is `{`, increment `openBraces`.
8.          IF character is `}`, decrement `openBraces`.
9.          IF character is `[`, increment `openBrackets`.
10.         IF character is `]`, decrement `openBrackets`.
11. END LOOP
12. Initialize `fixedString` with `jsonString`.
13. Append `}` for every positive count in `openBraces`.
14. Append `]` for every positive count in `openBrackets`.
15. RETURN `fixedString`.

END CLASS