# Pseudocode for GraphBuilder._loadProjectSummary

**Function:** `_loadProjectSummary`
**Type:** `private async`

## 1. Purpose

Loads the project analysis summary from the central SQLite database. It queries the `project_analysis_summaries` table, parses the JSON content of the single expected record, and returns the resulting `ProjectAnalysisSummary` object. This approach replaces a brittle file-based data handoff with a more robust database dependency.

## 2. Inputs

-   **`this.config.db`**: OBJECT - The database configuration object, containing details needed to connect to the SQLite database.

## 3. Output

-   **Success**: `Promise<ProjectAnalysisSummary>` - A promise that resolves to the parsed `ProjectAnalysisSummary` object.
-   **Failure**: `Promise<Error>` - A promise that rejects with an error if the database connection fails, the query fails, no summary is found, or the data cannot be parsed.

## 4. TDD Anchors

-   **TEST-LPS-01**: Should successfully connect to the DB, retrieve the summary, parse it, and return the `ProjectAnalysisSummary` object.
-   **TEST-LPS-02**: Should throw an error if the database connection cannot be established.
-   **TEST-LPS-03**: Should throw an error if the `project_analysis_summaries` table is empty or the query returns no results.
-   **TEST-LPS-04**: Should throw an error if the retrieved record's content is not valid JSON.
-   **TEST-LPS-05**: Should throw an error if the database configuration (`this.config.db`) is missing or incomplete.

## 5. Logic

```pseudocode
FUNCTION _loadProjectSummary() -- ASYNC

    -- TDD Anchor-- TEST-LPS-05
    IF this.config.db IS NULL OR NOT CONFIGURED
        LOG "Error-- Database configuration is missing."
        THROW new Error("Database configuration is missing.")
    END IF

    db_connection = NULL

    TRY
        -- TDD Anchor-- TEST-LPS-02
        LOG "Connecting to the database..."
        db_connection = GET_DATABASE_CONNECTION(this.config.db)

        sql_query = "SELECT summary_json FROM project_analysis_summaries LIMIT 1"
        LOG "Executing query to fetch project summary."

        -- TDD Anchor-- TEST-LPS-03
        result = EXECUTE_QUERY(db_connection, sql_query)

        IF result IS NULL OR result.rows.length IS 0
            LOG "Error-- No project analysis summary found in the database."
            THROW new Error("Project analysis summary not found.")
        END IF

        summary_json_string = result.rows[0].summary_json

        -- TDD Anchor-- TEST-LPS-04
        parsedSummary = JSON.PARSE(summary_json_string)

        -- TDD Anchor-- TEST-LPS-01
        LOG "Successfully loaded and parsed project summary from database."
        RETURN parsedSummary

    CATCH connectionError
        LOG "Error-- Database connection failed-- ", connectionError.message
        THROW new Error("Failed to connect to the database.")

    CATCH queryError
        LOG "Error-- Failed to query project summary-- ", queryError.message
        THROW new Error("Failed to query project summary from the database.")

    CATCH jsonParseError
        LOG "Error-- Failed to parse project summary from database. Invalid JSON."
        THROW new Error("Failed to parse project summary. Invalid JSON.")

    CATCH otherError
        LOG "An unexpected error occurred while loading the project summary-- ", otherError.message
        THROW otherError

    FINALLY
        IF db_connection IS NOT NULL
            CLOSE_DATABASE_CONNECTION(db_connection)
            LOG "Database connection closed."
        END IF
    END TRY

END FUNCTION
```

## 6. Dependencies

-   **Database Driver**: A module or library to connect to and query the SQLite database (e.g., `sqlite3`).
-   **Config Object**: Requires `this.config.db` to be correctly configured.

## 7. Data Structures

-   **`ProjectAnalysisSummary`**: A JSON object with a defined structure, likely containing file paths, languages, and other metadata. Example structure--
    ```json
    {
      "files"-- {
        "/path/to/file1.js"-- { "language"-- "JavaScript", "checksum"-- "abc..." },
        "/path/to/file2.py"-- { "language"-- "Python", "checksum"-- "def..." }
      },
      "projectRoot"-- "/path/to/project"
    }