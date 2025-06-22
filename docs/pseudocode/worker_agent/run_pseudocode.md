# `WorkerAgent.run` Pseudocode

## 1. Description

This pseudocode describes the main execution loop for the `WorkerAgent`. The `run` method continuously fetches a file that is pending analysis, processes it, and repeats the cycle. The loop terminates when there are no more pending files to be processed.

## 2. SPARC Pseudocode

```plaintext
ASYNC FUNCTION run()
    -- TEST: The loop should terminate when getNextFile() returns null.
    -- TEST: processFile() should be called with the file object returned by getNextFile().
    -- TEST: The loop should continue as long as getNextFile() returns a valid file object.

    -- Inputs: None
    -- Output: None (This function orchestrates the workflow and does not return a value).

    -- Start an infinite loop to continuously check for and process files.
    -- The loop's exit condition is handled internally.
    LOOP indefinitely
        -- Attempt to fetch the next available file from the database.
        -- This method should handle the logic of finding a 'pending' file
        -- and marking it as 'processing' atomically.
        DECLARE fileToProcess AS a file object or null
        SET fileToProcess TO AWAIT this.getNextFile()

        -- Check if a file was returned. If not, it means there are no more
        -- pending files, and the worker can stop.
        IF fileToProcess IS null THEN
            -- Exit the loop.
            BREAK
        END IF

        -- If a file was retrieved, pass it to the processing method.
        -- This method will handle the language-specific parsing and result storage.
        AWAIT this.processFile(fileToProcess)

    END LOOP

END FUNCTION