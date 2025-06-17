# Specification-- ScoutAgent

## 1. Overview

The `ScoutAgent` is the entry point for the Universal Code Graph pipeline. Its primary responsibility is to act as an intelligent file discovery service. It recursively scans a target code repository, intelligently filters out irrelevant files and directories, and determines the state of each relevant file relative to the last scan. It identifies new, modified, renamed, and deleted files, and then populates the central SQLite database with tasks for downstream agents to process.

## 2. Core Logic

The agent operates in a series of distinct steps to ensure accurate and efficient change detection.

1.  **Load Previous State**-- On startup, the agent loads a map of `filePath -> contentHash` from the JSON file specified by `SCOUT_STATE_FILE`. If the file doesn't exist or is invalid, it assumes this is a first-time run and starts with an empty state.

2.  **Intelligent Repository Scan**--
    *   The agent performs a full recursive scan of the target repository path.
    *   It applies a comprehensive set of exclusion patterns to ignore common non-source directories (`node_modules`, `.git`, `dist`), build artifacts (`*.o`, `*.pyc`), and test files/directories (`*test*`, `*spec*`).
    *   For every file that is *not* excluded, it calculates the file's SHA-256 content hash.
    *   It builds a `current_file_state` map in memory, storing `filePath -> contentHash` for all discovered files.

3.  **Analyze and Differentiate Changes**-- The agent compares the `current_file_state` with the `previous_file_state` to categorize every change--
    *   **New/Modified Files**-- It iterates through the `current_file_state`. If a file path does not exist in the `previous_file_state`, or if its content hash has changed, it is added to a `files_to_process` list.
    *   **Deleted Files**-- It iterates through the `previous_file_state`. If a file path does not exist in the `current_file_state`, it is added to a `deleted_files` list.
    *   **Renamed Files (Advanced)**-- It performs a smart check to detect renames. It looks for a file in the `deleted_files` list whose hash exactly matches a file in the `files_to_process` list. If a match is found, it's considered a rename. The agent creates a `RENAME` task, and the corresponding entries are removed from the `files_to_process` and `deleted_files` lists to avoid redundant processing.

4.  **Populate Queues**-- The agent opens a transaction to the SQLite database.
    *   For each remaining item in `files_to_process`, it inserts a new row into the `work_queue` table with `status = 'pending'`.
    *   For each remaining item in `deleted_files`, it inserts a new row into the `refactoring_tasks` table with `task_type = 'DELETE'`.
    *   For each detected rename, it inserts a new row into the `refactoring_tasks` table with `task_type = 'RENAME'`, providing both the `old_path` and `new_path`.

5.  **Save Current State**-- After successfully populating the queues, the agent serializes the `current_file_state` map to JSON and overwrites the `SCOUT_STATE_FILE` on disk. This snapshot becomes the `previous_file_state` for the next run.

## 3. Inputs

*   **File System Path**-- The root path of the target code repository to be scanned.
*   **State File**-- The JSON file located at the path specified by the `SCOUT_STATE_FILE` environment variable. This file contains the `filePath -> contentHash` map from the previous run.
*   **SQLite Database**-- The pipeline's central database file, specified by `SQLITE_DB_PATH`.

## 4. Outputs

*   **Database Records (SQLite)**--
    *   New rows in the `work_queue` table for new and modified files.
    *   New rows in the `refactoring_tasks` table for deleted and renamed files.
*   **State File**-- The `scout_state.json` file is overwritten with the `current_file_state` map.
*   **Log Messages**-- Standard output logs detailing the number of new, modified, deleted, and renamed files found.

## 5. Data Structures

*   **`previous_file_state`**-- An in-memory map of `{ [filePath-- string]-- contentHash-- string }`.
*   **`current_file_state`**-- An in-memory map with the same structure as `previous_file_state`, representing the live state of the repository.
*   **`files_to_process`**-- A list of objects, `{ path-- string, hash-- string }`.
*   **`deleted_files`**-- A list of file path strings.
*   **`renamed_files`**-- A list of objects, `{ old_path-- string, new_path-- string }`.

## 6. Error Handling & Resilience

*   **State File Not Found/Invalid**-- If `scout_state.json` cannot be read or parsed, the agent logs a warning and proceeds as if it's a first-time scan, treating all discovered files as new.
*   **File System Errors**-- If a file or directory cannot be read due to permissions issues, it is skipped and an error is logged. The scan continues with the remaining files.
*   **Database Errors**-- If the agent cannot connect to or write to the SQLite database, it will attempt to retry the connection with an exponential backoff strategy before exiting with a failure code.

## 7. Configuration

*   **`SQLITE_DB_PATH`**-- (Required) The file path to the central SQLite database.
*   **`SCOUT_STATE_FILE`**-- (Required) The file path for the JSON state file used to track file hashes between runs.

## 8. Initial Pseudocode Stubs / TDD Anchors

```pseudocode
FUNCTION main(repositoryPath)
    -- Load previous state, handling errors by starting fresh
    previousState = loadPreviousState(SCOUT_STATE_FILE)

    -- Scan repository to get the current state
    currentState = scanRepository(repositoryPath, EXCLUSION_PATTERNS)

    -- Compare states to find all changes
    changes = analyzeChanges(currentState, previousState)
    -- changes contains lists of new, modified, deleted, and renamed files

    -- Connect to the database
    db = connectToDatabase(SQLITE_DB_PATH)

    -- Populate the database queues with the detected changes
    populateQueues(db, changes)

    -- Persist the new state for the next run
    saveCurrentState(SCOUT_STATE_FILE, currentState)

    print("Scout run completed.")
END FUNCTION

FUNCTION analyzeChanges(currentState, previousState)
    -- TDD Anchor-- Test with empty previousState (initial run)
    -- TDD Anchor-- Test with a modified file (hash change)
    -- TDD Anchor-- Test with a new file
    -- TDD Anchor-- Test with a deleted file
    -- TDD Anchor-- Test with a renamed file (hash match between deleted and new)
    -- TDD Anchor-- Test with no changes
END FUNCTION

FUNCTION populateQueues(db, changes)
    -- TDD Anchor-- Test that a new file creates a 'pending' task in work_queue.
    -- TDD Anchor-- Test that a deleted file creates a 'DELETE' task in refactoring_tasks.
    -- TDD Anchor-- Test that a renamed file creates a 'RENAME' task in refactoring_tasks.
END FUNCTION