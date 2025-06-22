# `WorkerAgent.processFile` Pseudocode

## 1. Description

This pseudocode outlines the core logic for processing an individual file. It orchestrates the reading of the file's content, selecting the appropriate language-specific parser, executing the analysis, and handling the storage of results and status updates. It includes robust error handling to manage failures during file reading or parsing.

## 2. SPARC Pseudocode

```plaintext
ASYNC FUNCTION processFile(file)
    -- TEST: `processFile` should call the correct language handler based on `file.language`.
    -- TEST: `processFile` should call `saveResult` with the correct data on successful analysis.
    -- TEST: `processFile` should call `updateFileStatus` with 'completed' on success.
    -- TEST: `processFile` should call `updateFileStatus` with 'error' if the language handler is not found.
    -- TEST: `processFile` should call `updateFileStatus` with 'error' if reading the file fails.
    -- TEST: `processFile` should call `updateFileStatus` with 'error' if the handler throws an exception.

    -- Inputs:
    --   file: Object -- A file record from the database, including `id`, `file_path`, and `language`.

    -- Output: None

    TRY
        -- Read the actual content of the file from the filesystem.
        DECLARE content AS String
        SET content TO ReadFileFromDisk(file.file_path)

        -- Select the appropriate parsing function from the languageHandlers map.
        DECLARE handler AS Function
        SET handler TO this.languageHandlers[file.language]

        -- Check if a handler exists for the detected language.
        IF handler IS defined THEN
            -- Execute the language-specific parser.
            DECLARE analysisResult AS Object
            SET analysisResult TO handler(content, file.file_path)

            -- Convert the resulting object to a JSON string for database storage.
            DECLARE resultJson AS String
            SET resultJson TO ConvertToJSON(analysisResult)

            -- Save the structured analysis data to the 'analysis_results' table.
            AWAIT this.saveResult(file.id, 'code_structure', resultJson)

            -- Mark the file as 'completed' in the 'files' table.
            AWAIT this.updateFileStatus(file.id, 'completed')
        ELSE
            -- If no handler is found for the language, log the issue
            -- and mark the file as having an error.
            LOG "No handler found for language: " + file.language + " in file: " + file.file_path
            AWAIT this.updateFileStatus(file.id, 'error')
        END IF

    CATCH error
        -- If any exception occurs during file reading or parsing,
        -- log the error and update the file's status to 'error'.
        LOG "Error processing file " + file.id + ": " + error.message
        AWAIT this.updateFileStatus(file.id, 'error')
    END TRY

END FUNCTION