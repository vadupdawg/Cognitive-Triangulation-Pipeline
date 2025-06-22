# `WorkerAgent.parseJava` Pseudocode

## 1. Description

This pseudocode details the logic for parsing Java source code. It relies on traversing an Abstract Syntax Tree (AST) to identify key entities like classes, interfaces, and methods. It also discovers relationships such as package imports, class inheritance (`extends`), and interface implementation (`implements`).

## 2. SPARC Pseudocode

```plaintext
FUNCTION parseJava(content, filePath)
    -- TEST: Should identify a simple class definition.
    -- TEST: Should identify a simple interface definition.
    -- TEST: Should create an IMPORTS relationship with a valid 'from' and 'to' object structure.
    -- TEST: Should create an EXTENDS relationship with valid 'from' and 'to' class objects.
    -- TEST: Should create an IMPLEMENTS relationship with valid 'from' and 'to' objects.
    -- TEST: Should return an object with 'entities' and 'relationships' arrays.

    -- Inputs:
    --   content: String -- The Java source code.
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
        LOG "Failed to parse Java file " + filePath + ": " + error.message
        RETURN { entities: [], relationships: [] }
    END TRY

    -- Step 2: Traverse the AST to find entities and relationships.
    TRAVERSE ast node by node:
        -- Find Class and Interface Declarations
        IF node is a ClassDeclaration OR node is an InterfaceDeclaration THEN
            DECLARE entityType AS String
            SET entityType TO (node is a ClassDeclaration) ? "Class" : "Interface"
            DECLARE entityName AS String
            SET entityName TO node.name
            ADD { type: entityType, name: entityName, filePath: filePath } TO entities

            -- Check for inheritance (extends)
            IF node has an 'extends' clause THEN
                FOR each extendedType in node.extendsList:
                    DECLARE extendedName AS String
                    SET extendedName TO extendedType.name
                    ADD {
                        type: "EXTENDS",
                        from: { type: entityType, name: entityName, filePath: filePath },
                        to: { type: "Class", name: extendedName, filePath: "..." } -- Note: filePath may be unknown
                    } TO relationships
                END FOR
            END IF

            -- Check for implementation (implements)
            IF node has an 'implements' clause THEN
                FOR each implementedType in node.implementsList:
                    DECLARE implementedName AS String
                    SET implementedName TO implementedType.name
                    ADD {
                        type: "IMPLEMENTS",
                        from: { type: entityType, name: entityName, filePath: filePath },
                        to: { type: "Interface", name: implementedName, filePath: "..." } -- Note: filePath may be unknown
                    } TO relationships
                END FOR
            END IF
        END IF

        -- Find Method Declarations
        IF node is a MethodDeclaration THEN
            DECLARE methodName AS String
            SET methodName TO node.name
            ADD { type: "Method", name: methodName, signature: "...", filePath: filePath } TO entities
        END IF

        -- Find Imports
        IF node is an ImportDeclaration THEN
            DECLARE importName AS String
            SET importName TO node.name
            -- The relationship is from the file to the imported package/class.
            ADD {
                type: "IMPORTS",
                from: { type: "File", filePath: filePath },
                to: { type: "Package", name: importName } -- Or Class, if not a wildcard import
            } TO relationships
        END IF
        
    END TRAVERSE

    -- Step 3: Return the collected data.
    RETURN { entities: entities, relationships: relationships }

END FUNCTION