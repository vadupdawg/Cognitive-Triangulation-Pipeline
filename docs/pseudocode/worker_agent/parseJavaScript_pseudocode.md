# `WorkerAgent.parseJavaScript` Pseudocode

## 1. Description

This pseudocode details the logic for parsing JavaScript source code to extract key structural elements. It uses an Abstract Syntax Tree (AST) to identify entities like classes and functions, and to discover relationships such as imports, exports, and function calls.

## 2. SPARC Pseudocode

```plaintext
FUNCTION parseJavaScript(content, filePath)
    -- TEST: Should identify a simple function declaration.
    -- TEST: Should identify a simple class declaration.
    -- TEST: Should create an IMPORTS relationship with a valid 'from' and 'to' object structure.
    -- TEST: Should create an EXPORTS relationship with a valid 'from' and 'to' object structure.
    -- TEST: Should create a CALLS relationship with valid 'from' and 'to' function objects.
    -- TEST: Should handle anonymous functions gracefully.
    -- TEST: Should return an object with 'entities' and 'relationships' arrays.

    -- Inputs:
    --   content: String -- The JavaScript source code.
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
        LOG "Failed to parse JavaScript file " + filePath + ": " + error.message
        RETURN { entities: [], relationships: [] }
    END TRY

    -- Step 2: Traverse the AST to find entities and relationships.
    TRAVERSE ast node by node:
        -- Find Class Declarations
        IF node is a ClassDeclaration THEN
            DECLARE className AS String
            SET className TO node.id.name
            ADD { type: "Class", name: className, filePath: filePath } TO entities
        END IF

        -- Find Function Declarations and Expressions
        IF node is a FunctionDeclaration OR node is a FunctionExpression THEN
            DECLARE functionName AS String
            IF node.id is present THEN
                SET functionName TO node.id.name
            ELSE
                SET functionName TO "anonymous"
            END IF
            ADD { type: "Function", name: functionName, signature: "...", filePath: filePath } TO entities
        END IF

        -- Find Imports (CommonJS 'require')
        IF node is a CallExpression AND node.callee.name is "require" THEN
            DECLARE importedModule AS String
            SET importedModule TO node.arguments[0].value
            DECLARE resolvedPath AS String
            SET resolvedPath TO ResolveModulePath(importedModule, filePath)
            
            ADD { 
                type: "IMPORTS",
                from: { type: "File", filePath: filePath },
                to: { type: "File", filePath: resolvedPath }
            } TO relationships
        END IF

        -- Find Exports (CommonJS 'module.exports')
        IF node is an AssignmentExpression AND node.left represents "module.exports" THEN
             DECLARE exportedEntityName AS String
             SET exportedEntityName TO GetIdentifierName(node.right)
             -- Assuming the exported entity is a function or class defined in this file.
             ADD { 
                 type: "EXPORTS",
                 from: { type: "File", filePath: filePath },
                 to: { type: "Function", name: exportedEntityName, filePath: filePath } -- Or "Class"
             } TO relationships
        END IF

        -- Find Function Calls
        IF node is a CallExpression THEN
            DECLARE calleeName AS String
            SET calleeName TO GetCalleeName(node.callee)
            
            DECLARE currentFunction AS String
            SET currentFunction TO GetCurrentFunctionScope(node)

            IF currentFunction IS NOT null AND calleeName IS NOT null THEN
                 ADD { 
                     type: "CALLS",
                     from: { type: "Function", name: currentFunction, filePath: filePath },
                     to: { type: "Function", name: calleeName, filePath: filePath } -- filePath may differ for imported functions
                 } TO relationships
            END IF
        END IF
    END TRAVERSE

    -- Step 3: Return the collected data.
    RETURN { entities: entities, relationships: relationships }

END FUNCTION