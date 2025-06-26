# Pseudocode: _saveResults Method (Transactional)

**Purpose:** This method is responsible for persisting the analysis results (POIs and intra-file relationships) to the database within the context of an existing database transaction. It ensures that all write operations are idempotent to handle job retries safely.

**Critique Correction:** This version explicitly requires a `transaction` object to be passed in. It no longer manages the transaction's lifecycle (begin, commit, rollback), as that is now the responsibility of the calling method, `processJob`.

---

### FUNCTION `_saveResults(analysisResults, transaction)`

**INPUTS:**
*   `analysisResults` (Object)-- An object containing lists of POIs and relationships.
    *   `pois` (Array of Objects)
    *   `relationships` (Array of Objects)
*   `transaction` (Object)-- An active database transaction object provided by the caller.

**OUTPUT:**
*   (None) -- Throws an error if any operation fails.

**TDD ANCHORS:**
*   `TEST _saveResults should throw an error if the transaction object is missing or invalid.`
*   `TEST _saveResults should execute an idempotent INSERT/MERGE for each POI using the provided transaction.`
*   `TEST _saveResults should execute an idempotent INSERT/MERGE for each relationship using the provided transaction.`
*   `TEST _saveResults should not commit or rollback the transaction itself.`

---

### Method Logic

1.  **BEGIN**
2.      `-- Validate Inputs`
3.      `IF transaction IS NULL OR isNotValidTransaction(transaction) THEN`
4.          `THROW new Error("A valid database transaction must be provided.")`
5.      `END IF`
6.  
7.      `-- Extract data from the results object`
8.      `pois = analysisResults.pois`
9.      `relationships = analysisResults.relationships`
10. 
11.     `-- Process each Point of Interest (POI)`
12.     `IF pois IS NOT NULL AND pois.length > 0 THEN`
13.         `FOR EACH poi IN pois DO`
14.             `-- The SQL statement MUST be idempotent. Using ON CONFLICT (for SQLite/Postgres)`
15.             `-- or MERGE (for other SQL variants) prevents duplicate data on job retries.`
16.             `poiSql = "INSERT INTO pois (id, name, type, filePath, startLine, endLine) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ..."`
17.             `poiParams = [poi.id, poi.name, poi.type, poi.filePath, poi.startLine, poi.endLine]`
18. 
19.             `-- Execute the query using the transaction passed from the parent`
20.             `transaction.execute(poiSql, poiParams)`
21.         `END FOR`
22.     `END IF`
23. 
24.     `-- Process each intra-file relationship`
25.     `IF relationships IS NOT NULL AND relationships.length > 0 THEN`
26.         `FOR EACH rel IN relationships DO`
27.             `-- This statement must also be idempotent.`
28.             `relSql = "INSERT INTO relationships (id, sourceId, targetId, type) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ..."`
29.             `relParams = [rel.id, rel.sourceId, rel.targetId, rel.type]`
30. 
31.             `-- Execute the query using the same transaction`
32.             `transaction.execute(relSql, relParams)`
33.         `END FOR`
34.     `END IF`
35. 
36. **END**