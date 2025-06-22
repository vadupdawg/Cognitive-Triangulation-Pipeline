# `WorkerAgent.parsePython` Pseudocode

## 1. Description

This pseudocode details the logic for parsing Python source code. It uses an Abstract Syntax Tree (AST), a native capability in Python, to identify key entities like classes and functions, and to discover relationships such as imports and class inheritance.

## 2. SPARC Pseudocode

```plaintext
FUNCTION parsePython(content, filePath)
    -- TEST: Should identify a simple function definition.
    -- TEST: Should identify a simple class definition.
    -- TEST: Should create an IMPORTS relationship with a valid 'from' and 'to' object structure.
    -- TEST: Should create an EXTENDS relationship with a valid 'from' and 'to' class objects.
    -- TEST: Should correctly identify methods within a class.
    -- TEST: Should return an object with 'entities' and 'relationships' arrays.

    -- Inputs:
    --   content: String -- The Python source code.
    --   filePath: String -- The path to the file being parsed.

    -- Output:
    --   An object containing two arrays: `entities` and `relationships`.
    --   Example: { entities: [...], relationships: [...] }

    -- Initialization
    DECLARE entities AS new Array()
    DECLARE relationships AS new Array()
    DECLARE ast AS an Abstract Syntax Tree

    -- Step 1: Generate the AST from the source code content.
    TRY
        SET ast TO generateAST(content)
    CATCH error
        LOG "Failed to parse Python file " + filePath + ": " + error.message
        RETURN { entities: [], relationships: [] }
    END TRY

    -- Step 2: Traverse the AST to find entities and relationships.
    TRAVERSE ast node by node:
        -- Find Class Definitions and Inheritance
        IF node is a ClassDef THEN
            DECLARE className AS String
            SET className TO node.name
            ADD { type: "Class", name: className, filePath: filePath } TO entities

            -- Check for base classes (inheritance)
            FOR each base in node.bases:
                DECLARE baseName AS String
                SET baseName TO GetIdentifierName(base)
                ADD {
                    type: "EXTENDS",
                    from: { type: "Class", name: className, filePath: filePath },
                    to: { type: "Class", name: baseName, filePath: "..." } -- Note: filePath for base class may be unknown without resolving imports
                } TO relationships
            END FOR
        END IF

        -- Find Function and Method Definitions
        IF node is a FunctionDef THEN
            DECLARE functionName AS String
            SET functionName TO node.name
            ADD { type: "Function", name: functionName, signature: "...", filePath: filePath } TO entities
        END IF

        -- Find Imports
        IF node is an Import THEN
            FOR each alias in node.names:
                DECLARE moduleName AS String
                SET moduleName TO alias.name
                ADD {
                    type: "IMPORTS",
                    from: { type: "File", filePath: filePath },
                    to: { type: "File", filePath: moduleName + ".py" } -- Simplification, needs resolution
                } TO relationships
            END FOR
        END IF

        -- Find 'from ... import' statements
        IF node is an ImportFrom THEN
            DECLARE fromModule AS String
            SET fromModule TO node.module
            ADD {
                type: "IMPORTS",
                from: { type: "File", filePath: filePath },
                to: { type: "File", filePath: fromModule + ".py" } -- Simplification, needs resolution
            } TO relationships
        END IF
    END TRAVERSE

    -- Step 3: Return the collected data.
    RETURN { entities: entities, relationships: relationships }

END FUNCTION