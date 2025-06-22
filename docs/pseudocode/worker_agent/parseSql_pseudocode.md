# `WorkerAgent.parseSql` Pseudocode

## 1. Description

This pseudocode details the logic for parsing SQL schema files (`.sql`). The primary goal is to extract database-level entities like tables and to identify relationships, such as foreign key constraints. This approach uses an Abstract Syntax Tree (AST) for robust and accurate parsing, which is necessary to meet the project's high accuracy requirements.

## 2. SPARC Pseudocode

```plaintext
FUNCTION parseSql(content, filePath)
    -- TEST: Should identify a 'CREATE TABLE' statement and extract the table name.
    -- TEST: Should create a 'Table' entity for each table found.
    -- TEST: Should correctly identify a FOREIGN KEY constraint.
    -- TEST: Should create a 'USES' relationship with valid 'from' and 'to' table objects.
    -- TEST: Should handle SQL files with multiple table definitions.
    -- TEST: Should handle complex SQL formatting and comments gracefully.
    -- TEST: Should return an object with 'entities' and 'relationships' arrays.

    -- Inputs:
    --   content: String -- The SQL script content.
    --   filePath: String -- The path to the file being parsed.

    -- Output:
    --   An object containing two arrays: `entities` and `relationships`.
    --   Example: { entities: [...], relationships: [...] }

    -- Initialization
    DECLARE entities AS new Array()
    DECLARE relationships AS new Array()
    DECLARE ast AS an Abstract Syntax Tree

    -- NOTE: A robust, dedicated SQL parsing library is required to build an AST.
    -- This is critical for meeting the 100% accuracy requirement, as simple
    -- regex-based parsing is too brittle to handle variations in SQL syntax,
    -- comments, and complex definitions.

    -- Step 1: Generate the AST from the source code content.
    TRY
        SET ast TO generateAstFromSql(content)
    CATCH error
        LOG "Failed to parse SQL file " + filePath + ": " + error.message
        RETURN { entities: [], relationships: [] }
    END TRY

    -- Step 2: Traverse the AST to find entities and relationships.
    TRAVERSE ast node by node:
        -- Find 'CREATE TABLE' statements
        IF node is a CreateTableStatement THEN
            DECLARE tableName AS String
            SET tableName TO node.tableName

            -- Add the table as an entity
            -- TEST 'parseSql should create a Table entity with name, schema, and filePath'
            ADD { 
                type: "Table", 
                name: tableName, 
                schema: "main", -- Future enhancement: derive from context
                filePath: filePath 
            } TO entities

            -- Find foreign key constraints within this table's definition
            TRAVERSE node.constraints as constraint:
                IF constraint is a ForeignKeyConstraint THEN
                    DECLARE referencedTable AS String
                    SET referencedTable TO constraint.referencedTable
                    
                    -- TEST 'parseSql should create a USES relationship for a foreign key'
                    ADD {
                        type: "USES",
                        from: { type: "Table", name: tableName, schema: "main" },
                        to: { type: "Table", name: referencedTable, schema: "main" }
                    } TO relationships
                END IF
            END TRAVERSE
        END IF
    END TRAVERSE

    -- Step 3: Return the collected data.
    RETURN { entities: entities, relationships: relationships }

END FUNCTION