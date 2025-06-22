# Scout Agent Specifications

This document provides the detailed specifications for the `ScoutAgent`, revised to align with the analysis of the `polyglot-test` directory.

## 1. Overview

The `ScoutAgent` is responsible for scanning the codebase, identifying all relevant files, determining their programming language, and populating the `files` table in the SQLite database. It acts as the entry point for the analysis pipeline.

## 2. Class-- `ScoutAgent`

### Properties

-   `db` -- Object -- An instance of the SQLite database connection client.
-   `repoPath` -- String -- The absolute path to the root of the repository to be scanned.

### Constructor

-   **`constructor(db, repoPath)`**
    -   **Parameters**
        -   `db` -- Object -- The database client instance.
        -   `repoPath` -- String -- The path to the repository.
    -   **Purpose** -- Initializes the `ScoutAgent` with a database connection and the repository path.

### Methods

#### `run()`

-   **Signature** -- `async run()`
-   **Return Type** -- `Promise<void>`
-   **Purpose** -- The main execution method for the agent. It orchestrates the process of scanning the repository, identifying files, and saving them to the database.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'run should call discoverFiles and saveFilesToDb'
    function run() --
        const files = this.discoverFiles(this.repoPath)
        this.saveFilesToDb(files)
    end function
    ```

#### `discoverFiles(directory)`

-   **Signature** -- `discoverFiles(directory)`
-   **Parameters**
    -   `directory` -- String -- The directory to scan for files.
-   **Return Type** -- `Array<Object>` -- An array of file objects, where each object contains `filePath`, `language`, and `checksum`.
-   **Purpose** -- Recursively scans a directory to find all files, ignoring specified patterns (e.g., `.git`, `node_modules`). For each file, it determines the language and calculates a checksum.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'discoverFiles should return a list of file paths'
    TEST 'discoverFiles should ignore git and node_modules'
    TEST 'discoverFiles should correctly identify file languages'

    function discoverFiles(directory) --
        allFiles = []
        items = readDirectory(directory)
        for each item in items --
            fullPath = joinPath(directory, item)
            if isDirectory(fullPath) and not shouldIgnore(fullPath) --
                allFiles.push(...this.discoverFiles(fullPath))
            else if isFile(fullPath) --
                language = this.detectLanguage(fullPath)
                if language != 'unknown' --
                    content = readFile(fullPath)
                    checksum = this.calculateChecksum(content)
                    allFiles.push({ filePath-- fullPath, language-- language, checksum-- checksum })
                end if
            end if
        end for
        return allFiles
    end function
    ```

#### `detectLanguage(filePath)`

-   **Signature** -- `detectLanguage(filePath)`
-   **Parameters**
    -   `filePath` -- String -- The path to the file.
-   **Return Type** -- `String` -- The detected programming language (e.g., 'JavaScript', 'Python', 'Java', 'SQL').
-   **Purpose** -- Determines the programming language of a file based on its extension.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'detectLanguage should return JavaScript for .js files'
    TEST 'detectLanguage should return Python for .py files'
    TEST 'detectLanguage should return Java for .java files'
    TEST 'detectLanguage should return SQL for .sql files'
    TEST 'detectLanguage should return unknown for unknown extensions'

    function detectLanguage(filePath) --
        extension = getFileExtension(filePath)
        switch (extension) --
            case '.js'-- return 'JavaScript'
            case '.py'-- return 'Python'
            case '.java'-- return 'Java'
            case '.sql'-- return 'SQL'
            default-- return 'unknown'
        end switch
    end function
    ```

#### `calculateChecksum(content)`

-   **Signature** -- `calculateChecksum(content)`
-   **Parameters**
    -   `content` -- String -- The content of the file.
-   **Return Type** -- `String` -- The SHA-256 checksum of the content.
-   **Purpose** -- Calculates the SHA-256 checksum of the file content to track changes.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'calculateChecksum should return a valid SHA-256 hash'
    function calculateChecksum(content) --
        hash = createHash('sha256')
        hash.update(content)
        return hash.digest('hex')
    end function
    ```

#### `saveFilesToDb(files)`

-   **Signature** -- `async saveFilesToDb(files)`
-   **Parameters**
    -   `files` -- Array<Object> -- An array of file objects to save.
-   **Return Type** -- `Promise<void>`
-   **Purpose** -- Inserts or updates file records in the `files` table. If a file exists, it checks the checksum to see if it was modified.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'saveFilesToDb should insert new files'
    TEST 'saveFilesToDb should update existing files if checksum is different'
    TEST 'saveFilesToDb should not update existing files if checksum is the same'

    async function saveFilesToDb(files) --
        for each file in files --
            existingFile = this.db.get('SELECT id, checksum FROM files WHERE file_path = ?', file.filePath)
            if existingFile --
                if existingFile.checksum != file.checksum --
                    this.db.run('UPDATE files SET checksum = ?, last_modified = CURRENT_TIMESTAMP, status = "pending" WHERE id = ?', file.checksum, existingFile.id)
                end if
            else --
                this.db.run('INSERT INTO files (file_path, language, checksum, status) VALUES (?, ?, ?, ?)', file.filePath, file.language, file.checksum, 'pending')
            end if
        end for
    end function