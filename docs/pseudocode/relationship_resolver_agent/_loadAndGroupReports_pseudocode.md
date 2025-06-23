# Pseudocode for _loadAndGroupReports method

**Function**: `_loadAndGroupReports`
**Type**: private async method
**Returns**: `Promise<Map<string, FileAnalysisReport[]>>` -- A promise that resolves to a Map where keys are directory paths and values are arrays of `FileAnalysisReport` objects.

---

### **Purpose**
Loads all `FileAnalysisReport` objects from the data store and groups them by their parent directory.

---

### **Inputs**
None

---

### **Outputs**
- A `Map` where each key is a string representing a parent directory path and the value is an array of `FileAnalysisReport` objects found in that directory.

---

### **TDD Anchors**

- **TEST-HAPPY-PATH-1**: `_loadAndGroupReports` should correctly group multiple reports from the same directory.
- **TEST-HAPPY-PATH-2**: `_loadAndGroupReports` should correctly create separate groups for reports in different directories.
- **TEST-EDGE-CASE-1**: `_loadAndGroupReports` should return an empty Map if no reports exist in the data store.
- **TEST-EDGE-CASE-2**: `_loadAndGroupReports` should handle file paths that do not have a parent directory (e.g., files in the root).
- **TEST-EDGE-CASE-3**: `_loadAndGroupReports` should gracefully handle reports with malformed or missing file paths.

---

### **Logic**

1.  **FUNCTION** `_loadAndGroupReports()`:
2.      **TDD ANCHOR**: [TEST-EDGE-CASE-1]
3.      Initialize `groupedReports` as a new `Map<string, FileAnalysisReport[]>`.
4.
5.      **TRY**:
6.          // Retrieve all analysis reports that are ready for relationship resolution.
7.          // This assumes a data access method `fetchAllCompletedAnalysisReports`.
8.          `allReports` = **AWAIT** `this.db.fetchAllCompletedAnalysisReports()`
9.
10.         **IF** `allReports` is null or empty **THEN**:
11.             **RETURN** `groupedReports`
12.         **END IF**
13.
14.         **FOR EACH** `report` **IN** `allReports`:
15.             **TDD ANCHOR**: [TEST-HAPPY-PATH-1], [TEST-HAPPY-PATH-2]
16.             `filePath` = `report.filePath`
17.
18.             **IF** `filePath` is valid **THEN**:
19.                 **TDD ANCHOR**: [TEST-EDGE-CASE-2]
20.                 `parentDir` = `extractParentDirectory(filePath)`
21.
22.                 // If the parent directory is not yet a key in the map, initialize it.
23.                 **IF** `groupedReports.has(parentDir)` is false **THEN**:
24.                     `groupedReports.set(parentDir, [])`
25.                 **END IF**
26.
27.                 // Add the current report to the array for its parent directory.
28.                 `groupedReports.get(parentDir).push(report)`
29.             **ELSE**:
30.                 **TDD ANCHOR**: [TEST-EDGE-CASE-3]
31.                 // Log a warning or handle the case of a report with an invalid path.
32.                 `log.warn("Skipping report with invalid file path: ", report.id)`
33.             **END IF**
34.         **END FOR**
35.
36.     **CATCH** `error`:
37.         `log.error("Failed to load and group reports: ", error)`
38.         // Re-throw the error or handle it as per the agent's error handling strategy.
39.         **THROW** new `Error("Database error while fetching analysis reports.")`
40.     **END TRY**
41.
42.     **RETURN** `groupedReports`
43. **END FUNCTION**

---
### **Helper Functions**

**Function**: `extractParentDirectory(filePath)`
- **Purpose**: Extracts the parent directory path from a full file path.
- **Input**: `filePath` (string)
- **Output**: `parentDirPath` (string)
- **Logic**:
    1. Find the last occurrence of the path separator ('/' or '\').
    2. If a separator is found, return the substring from the beginning of the path up to that separator.
    3. If no separator is found (e.g., a file in the root), return a representation for the root directory, like '.' or '/'.