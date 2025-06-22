# Worker Agent Specifications

This document provides the detailed specifications for the `WorkerAgent`, revised to perform precise, language-specific analysis based on the ground truth report.

## 1. Overview

The `WorkerAgent` is responsible for performing deep, language-specific analysis of individual code files. Instead of relying on a generic AI, it uses dedicated parsers to identify and extract a structured representation of the code's entities and relationships. It fetches a file from the database, applies the correct parser based on the file's language, and stores the resulting structured JSON back in the database for later ingestion into the graph.

## 2. Class-- `WorkerAgent`

### Properties

-   `db` -- Object -- An instance of the SQLite database connection client.
-   `workerId` -- String -- A unique identifier for this worker instance.
-   `languageHandlers` -- Object -- A map of language names to their corresponding parsing methods.

### Constructor

-   **`constructor(db, workerId)`**
    -   **Parameters**
        -   `db` -- Object -- The database client instance.
        -   `workerId` -- String -- The ID for this worker.
    -   **Purpose** -- Initializes the `WorkerAgent` and maps languages to their handlers.
    -   **TDD Anchor/Pseudocode**
        ```
        function constructor(db, workerId) --
            this.db = db
            this.workerId = workerId
            this.languageHandlers = {
                'JavaScript'-- this.parseJavaScript,
                'Python'-- this.parsePython,
                'Java'-- this.parseJava,
                'SQL'-- this.parseSql
            }
        end function
        ```

### Core Methods

#### `run()`

-   **Signature** -- `async run()`
-   **Purpose** -- The main execution loop. It continuously fetches and processes a pending file until none are left.
-   **TDD Anchor/Pseudocode**
    ```
    async function run() --
        while (true) --
            fileToProcess = await this.getNextFile()
            if (!fileToProcess) then break
            await this.processFile(fileToProcess)
        end while
    end function
    ```

#### `getNextFile()`

-   **Signature** -- `async getNextFile()`
-   **Return Type** -- `Promise<Object | null>`
-   **Purpose** -- Atomically fetches a single 'pending' file from the `files` table and updates its status to 'processing'.
-   **TDD Anchor/Pseudocode**
    ```
    async function getNextFile() --
        // Begin transaction
        file = this.db.get("SELECT * FROM files WHERE status = 'pending' LIMIT 1")
        if file --
            this.db.run("UPDATE files SET status = 'processing', worker_id = ? WHERE id = ?", this.workerId, file.id)
        end if
        // End transaction
        return file
    end function
    ```

#### `processFile(file)`

-   **Signature** -- `async processFile(file)`
-   **Purpose** -- The core processing logic. It reads the file's content, invokes the appropriate language handler, and saves the structured result.
-   **TDD Anchor/Pseudocode**
    ```
    TEST 'processFile should call the correct language handler'
    TEST 'processFile should update file status to completed on success'
    TEST 'processFile should update file status to error on failure'

    async function processFile(file) --
        try --
            content = readFile(file.file_path)
            handler = this.languageHandlers[file.language]
            if handler --
                analysisResult = handler(content, file.file_path)
                await this.saveResult(file.id, 'code_structure', JSON.stringify(analysisResult))
                await this.updateFileStatus(file.id, 'completed')
            else --
                // No handler for this language
                await this.updateFileStatus(file.id, 'error')
            end if
        catch error --
            await this.updateFileStatus(file.id, 'error')
        end try
    end function
    ```

---

## 3. Language-Specific Parsers

These methods are responsible for parsing the source code and extracting entities and relationships. They should return an object with two keys-- `entities` and `relationships`.

#### `parseJavaScript(content, filePath)`

-   **Purpose** -- Extracts entities and relationships from JavaScript files.
-   **TDD Anchors**
    -   `TEST 'should identify all function declarations and expressions'`
    -   `TEST 'should identify all class declarations'`
    -   `TEST 'should identify all require() statements as IMPORTS relationships'`
    -   `TEST 'should identify all module.exports as EXPORTS relationships'`
    -   `TEST 'should identify all function calls as CALLS relationships'`
-   **Pseudocode**
    ```
    function parseJavaScript(content, filePath) --
        entities = []
        relationships = []
        ast = parseToAST(content) // Use a library like Acorn or Babel

        // Find Classes
        traverse ast for ClassDeclaration nodes --
            className = node.id.name
            entities.push({ type-- 'Class', name-- className, filePath-- filePath })
        end traverse

        // Find Functions
        traverse ast for FunctionDeclaration or FunctionExpression nodes --
            functionName = node.id ? node.id.name : 'anonymous'
            entities.push({ type-- 'Function', name-- functionName, signature-- ..., filePath-- filePath })
        end traverse

        // Find Imports (require)
        traverse ast for CallExpression nodes where callee.name is 'require' --
            importedModule = node.arguments[0].value
            // Logic to resolve path and create IMPORTS relationship
            relationships.push({ from-- filePath, to-- resolvedPath, type-- 'IMPORTS' })
        end traverse

        // Find Exports (module.exports)
        traverse ast for AssignmentExpression nodes where left is module.exports --
            // Logic to identify exported entity (function, class, variable)
            relationships.push({ from-- filePath, to-- exportedEntityName, type-- 'EXPORTS' })
        end traverse

        // Find Function Calls
        traverse ast for CallExpression nodes --
            calleeName = node.callee.name
            // Logic to create CALLS relationship
            relationships.push({ from-- currentFunction, to-- calleeName, type-- 'CALLS' })
        end traverse

        return { entities, relationships }
    end function
    ```

#### `parsePython(content, filePath)`

-   **Purpose** -- Extracts entities and relationships from Python files.
-   **TDD Anchors**
    -   `TEST 'should identify all function and method definitions'`
    -   `TEST 'should identify all class definitions'`
    -   `TEST 'should identify import and from...import statements as IMPORTS'`
    -   `TEST 'should identify class inheritance as EXTENDS'`
-   **Pseudocode**
    ```
    function parsePython(content, filePath) --
        entities = []
        relationships = []
        ast = parseToAST(content) // Use a library like Python's `ast` module

        // Find Classes and Inheritance
        traverse ast for ClassDef nodes --
            className = node.name
            entities.push({ type-- 'Class', name-- className, filePath-- filePath })
            for base in node.bases --
                relationships.push({ from-- className, to-- base.id, type-- 'EXTENDS' })
            end for
        end traverse

        // Find Functions
        traverse ast for FunctionDef nodes --
            functionName = node.name
            entities.push({ type-- 'Function', name-- functionName, signature-- ..., filePath-- filePath })
        end traverse

        // Find Imports
        traverse ast for Import or ImportFrom nodes --
            // Logic to extract module names and create IMPORTS relationships
        end traverse

        return { entities, relationships }
    end function
    ```

#### `parseJava(content, filePath)`

-   **Purpose** -- Extracts entities and relationships from Java files.
-   **TDD Anchors**
    -   `TEST 'should identify all class and interface definitions'`
    -   `TEST 'should identify all method definitions'`
    -   `TEST 'should identify import statements as IMPORTS'`
    -   `TEST 'should identify class inheritance via extends as EXTENDS'`
-   **Pseudocode**
    ```
    function parseJava(content, filePath) --
        // Use a Java AST parser library
        // Similar logic to Python and JavaScript for identifying classes, methods, and imports.
        // Pay special attention to identifying method calls and class instantiations.
        return { entities-- [], relationships-- [] }
    end function
    ```

#### `parseSql(content, filePath)`

-   **Purpose** -- Extracts entities from SQL schema files.
-   **TDD Anchors**
    -   `TEST 'should identify CREATE TABLE statements as Table entities'`
    -   `TEST 'should identify FOREIGN KEY constraints as USES relationships'`
-   **Pseudocode**
    ```
    function parseSql(content, filePath) --
        entities = []
        relationships = []

        // Use regex or a simple SQL parser
        // Find all "CREATE TABLE [tableName] (...)"
        matches = findRegex(content, /CREATE TABLE (\w+)/g)
        for match in matches --
            tableName = match[1]
            entities.push({ type-- 'Table', name-- tableName, schema-- 'main' })
        end for

        // Find all "FOREIGN KEY(...) REFERENCES [otherTable](...)"
        fk_matches = findRegex(content, /FOREIGN KEY\s*\(.*?\)\s*REFERENCES\s*(\w+)/g)
        for fk_match in fk_matches --
            referencedTable = fk_match[1]
            // We need to know which table the FK is in to create the relationship
            // This requires a more stateful parser.
            // relationships.push({ from-- currentTable, to-- referencedTable, type-- 'USES' })
        end for

        // Assume one database for now
        entities.push({ type-- 'Database', name-- 'polyglot_test.db' })

        return { entities, relationships }
    end function
    ```

---

## 4. Helper Methods

#### `saveResult(fileId, analysisType, result)`

-   **Signature** -- `async saveResult(fileId, analysisType, result)`
-   **Purpose** -- Saves the structured analysis result to the `analysis_results` table.
-   **TDD Anchor/Pseudocode**
    ```
    async function saveResult(fileId, analysisType, result) --
        this.db.run(
            'INSERT INTO analysis_results (file_id, worker_id, analysis_type, result, processed) VALUES (?, ?, ?, ?, 0)',
            fileId, this.workerId, analysisType, result
        )
    end function
    ```

#### `updateFileStatus(fileId, status)`

-   **Signature** -- `async updateFileStatus(fileId, status)`
-   **Purpose** -- Updates the status of a file in the `files` table.
-   **TDD Anchor/Pseudocode**
    ```
    async function updateFileStatus(fileId, status) --
        this.db.run('UPDATE files SET status = ? WHERE id = ?', status, fileId)
    end function