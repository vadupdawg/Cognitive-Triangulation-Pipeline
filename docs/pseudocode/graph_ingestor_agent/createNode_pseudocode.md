# GraphIngestorAgent createNode() Method Pseudocode

## 1. Description

This document provides the pseudocode for the `createNode` method of the `GraphIngestorAgent`. This method is responsible for creating a single node in the Neo4j database. It uses a `MERGE` operation to ensure that nodes are not duplicated, making the process idempotent.

## 2. SPARC Framework Compliance

- **Specification**-- The `createNode` method adheres to the specifications defined in [`docs/specifications/graph_ingestor_agent_specs.md`](docs/specifications/graph_ingestor_agent_specs.md).
- **Pseudocode**-- This document.
- **Architecture**-- The architecture will be defined in the Architecture phase.
- **Refinement**-- The implementation will be refined based on this pseudocode.
- **Completion**-- The final implementation will be a result of this process.

## 3. Pseudocode

```plaintext
FUNCTION createNode(session, entity)
    -- **TDD Anchor**
    -- TEST 'should create a new node if it does not exist'
    -- TEST 'should update an existing node with new properties'
    -- TEST 'should handle nodes with different required properties (e.g., File vs. Function)'
    -- TEST 'should correctly use the entity type as the node label'
    -- TEST 'should not create a duplicate node'

    -- **Input**
    -- session-- The active Neo4j session object.
    -- entity-- An object representing the code entity to be created as a node.
    --          It must contain a 'type' property for the label and other properties for matching and setting.

    -- **Output**
    -- None. The method's effect is a `MERGE` operation in the Neo4j database.

    -- **Logic**
    -- 1. Validate the input entity object.
    IF entity IS NULL OR entity.type IS NULL THEN
        LOG "Invalid entity provided to createNode. Entity-- " + entity
        RETURN
    ENDIF

    -- 2. Define the unique properties for the MERGE clause based on entity type.
    --    This is a critical step for idempotency.
    --    - A 'File' is unique by its 'filePath'.
    --    - A 'Function' is unique by its 'name' AND 'filePath'.
    --    - Other types may have different unique constraints.
    merge_properties = {}
    IF entity.type EQUALS "File" THEN
        merge_properties = { filePath-- entity.filePath }
    ELSE IF entity.type EQUALS "Function" OR entity.type EQUALS "Class" OR entity.type EQUALS "Method" THEN
        merge_properties = { name-- entity.name, filePath-- entity.filePath }
    ELSE
        -- Default to name if no other rule matches, but this may need refinement.
        merge_properties = { name-- entity.name }
    ENDIF

    -- 3. Construct the Cypher query using MERGE.
    --    - The label is dynamically set from 'entity.type'.
    --    - The properties for matching are in 'merge_properties'.
    --    - `ON CREATE SET n = $props` sets all properties when the node is first created.
    --    - `ON MATCH SET n += $props` updates the node with new/changed properties if it already exists.
    query = `
        MERGE (n:${entity.type} { ${Object.keys(merge_properties).map(key => `${key}: $${key}`).join(", ")} })
        ON CREATE SET n = $props
        ON MATCH SET n += $props
    `

    -- 4. Prepare the parameters for the query.
    --    - Spread the merge_properties for the MERGE clause.
    --    - Pass the full entity object as 'props' for the SET clause.
    params = { ...merge_properties, props-- entity }


    -- 5. Execute the query against the Neo4j session.
    session.run(query, params)

ENDFUNCTION