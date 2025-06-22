# `WorkerAgent.saveResult` Pseudocode

## 1. Description

This pseudocode details the logic for saving the structured analysis result of a file into the `analysis_results` table in the database. This function is responsible for creating a new record that links the analysis data to the original file and the worker that processed it.

## 2. SPARC Pseudocode

```plaintext
ASYNC FUNCTION saveResult(fileId, analysisType, result)
    -- TEST: A new record should be inserted into the 'analysis_results' table.
    -- TEST: The inserted record should have the correct 'file_id'.
    -- TEST: The inserted record should have the correct 'worker_id'.
    -- TEST: The inserted record should have the correct 'analysis_type'.
    -- TEST: The inserted record should have the correct 'result' (JSON string).
    -- TEST: The 'processed' column for the new record should be initialized to 0 (false).

    -- Inputs:
    --   fileId: Integer -- The ID of the file this analysis result belongs to.
    --   analysisType: String -- The type of analysis performed (e.g., 'code_structure').
    --   result: String -- The structured analysis data, formatted as a JSON string.

    -- Output: None

    -- Define the SQL query for inserting a new record.
    -- Using placeholders (?) is a security best practice to prevent SQL injection.
    DECLARE sqlQuery AS String
    SET sqlQuery TO "INSERT INTO analysis_results (file_id, worker_id, analysis_type, result, processed) VALUES (?, ?, ?, ?, 0)"

    -- Define the parameters to be bound to the SQL query.
    -- The 'processed' status is hardcoded to 0, indicating it has not yet been ingested by the GraphIngestorAgent.
    DECLARE params AS Array
    SET params TO [fileId, this.workerId, analysisType, result]

    -- Execute the insertion query against the database.
    AWAIT this.db.execute(sqlQuery, params)

END FUNCTION