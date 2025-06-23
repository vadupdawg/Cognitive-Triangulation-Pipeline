# Pseudocode for `_runIntraDirectoryPass` Method

## Method-- `_runIntraDirectoryPass(directoryPath, reports)`

**Purpose--** Pass 2-- Analyzes all POIs within a single directory to find relationships between files in that directory.

**Inputs--**
-   `directoryPath`-- STRING-- The absolute path of the directory being analyzed.
-   `reports`-- ARRAY of `FileAnalysisReport`-- A list of all analysis reports for the files within the specified directory.

**Output--**
-   `Promise<DirectoryAnalysisSummary>`-- A promise that resolves to an object containing the identified relationships and a semantic summary of the directory.

---

### **BEGIN**

1.  **FUNCTION** `_runIntraDirectoryPass`(directoryPath, reports) -- ASYNC
2.      `// TDD Anchor-- TEST behavior when fewer than two reports are provided`
3.      **IF** `reports` is NULL OR the length of `reports` < 2 **THEN**
4.          Log a warning-- "Intra-directory analysis requires at least two files. Skipping."
5.          **RETURN** a new `DirectoryAnalysisSummary` with empty `relationships` and empty `summary`.
6.      **END IF**
7.  
8.      `// Initialize a helper for LLM interactions`
9.      `llmClient` = new `LLMClient`()
10. 
11.     `// TDD Anchor-- TEST prompt construction for correctness and clarity`
12.     `// Build a context string from all the reports for the LLM prompt.`
13.     `contextString` = ""
14.     **FOR EACH** `report` **IN** `reports`
15.         `contextString` += "File-- " + `report.filePath` + "\n"
16.         `contextString` += "POIs--\n" + `report.pois` (formatted as a string) + "\n\n"
17.     **END FOR**
18. 
19.     `// Construct the prompt for the LLM`
20.     `prompt` = `_buildIntraDirectoryPrompt(contextString)`
21. 
22.     `// Initialize variables for the results`
23.     `parsedResponse` = NULL
24.     `directoryRelationships` = []
25.     `semanticSummary` = ""
26. 
27.     `// TDD Anchor-- TEST LLM call and response handling, including errors`
28.     **TRY**
29.         `// Call the LLM to analyze the relationships`
30.         `llmResponse` = **AWAIT** `llmClient.generate`(prompt)
31. 
32.         `// TDD Anchor-- TEST parsing of a valid LLM JSON response`
33.         `parsedResponse` = `JSON.parse`(`llmResponse`)
34. 
35.         `// Validate and extract data from the response`
36.         **IF** `parsedResponse` AND `parsedResponse.relationships` **THEN**
37.             `directoryRelationships` = `parsedResponse.relationships`
38.         **END IF**
39. 
40.         **IF** `parsedResponse` AND `parsedResponse.summary` **THEN**
41.             `semanticSummary` = `parsedResponse.summary`
42.         **END IF**
43. 
44.     **CATCH** `error`
45.         `// TDD Anchor-- TEST graceful failure on LLM error or invalid JSON`
46.         Log an error-- "Failed to analyze intra-directory relationships for " + `directoryPath`
47.         Log the `error`
48.         `// Return an empty summary on failure to avoid halting the entire process`
49.         **RETURN** new `DirectoryAnalysisSummary` with empty `relationships` and `summary`.
50.     **END TRY**
51. 
52.     `// TDD Anchor-- TEST creation of the final DirectoryAnalysisSummary object`
53.     `finalSummary` = new `DirectoryAnalysisSummary`({
54.         `directoryPath`-- `directoryPath`,
55.         `relationships`-- `directoryRelationships`,
56.         `summary`-- `semanticSummary`
57.     })
58. 
59.     **RETURN** `finalSummary`
60. 
61. **END FUNCTION**

---

### **HELPER FUNCTION** `_buildIntraDirectoryPrompt(context)`

**Purpose--** Constructs the specific prompt to send to the LLM for intra-directory analysis.

**Inputs--**
-   `context`-- STRING-- The formatted string containing POIs from all files in the directory.

**Output--**
-   `STRING`-- The complete prompt.

---

### **BEGIN**

1.  **FUNCTION** `_buildIntraDirectoryPrompt`(context)
2.      `// This prompt guides the LLM to act as a software architect and identify connections`
3.      `promptTemplate` = """
4.      As an expert software architect, your task is to analyze the following points of interest (POIs) from files within a single directory.
5.      Based on the provided information (imports, exports, function calls, class definitions, etc.), identify all direct relationships *between* these files.
6.      Additionally, provide a concise, high-level semantic summary of the directory's overall purpose or functionality.
7.  
8.      **Directory Content--**
9.      {context}
10. 
11.     **Instructions--**
12.     1.  List all relationships you find. A relationship must include a source file, a target file, and a clear description of the connection.
13.     2.  Provide a semantic summary of the directory's role (e.g., 'Contains API route handlers', 'Manages database models').
14.     3.  Format your output as a single JSON object with two keys-- "relationships" (an array of objects) and "summary" (a string).
15. 
16.     **JSON Output Example--**
17.     {
18.       "relationships"-- [
19.         {
20.           "source"-- "path/to/fileA.js",
21.           "target"-- "path/to/fileB.js",
22.           "description"-- "fileA.js imports the 'processData' function from fileB.js."
23.         }
24.       ],
25.       "summary"-- "This directory contains the core business logic for data processing."
26.     }
27.     """
28. 
29.     `// Replace the placeholder with the actual context`
30.     `finalPrompt` = `promptTemplate`.replace("{context}", context)
31.     **RETURN** `finalPrompt`
32. 
33. **END FUNCTION**