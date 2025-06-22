# GraphIngestorAgent createRelationship() Method Pseudocode

## 1. Description

This document provides the pseudocode for the `createRelationship` method of the `GraphIngestorAgent`. This method creates a directed relationship between two existing nodes in the Neo4j database. It uses `MATCH` to find the start and end nodes and `MERGE` to create the relationship, ensuring idempotency.

## 2. SPARC Framework Compliance

- **Specification**-- The `createRelationship` method adheres to the specifications defined in [`docs/specifications/graph_ingestor_agent_specs.md`](docs/specifications/graph_ingestor_agent_specs.md).
- **Pseudocode**-- This document.
- **Architecture**-- The architecture will be defined in the Architecture phase.
- **Refinement**-- The implementation will be refined based on this pseudocode.
- **Completion**-- The final implementation will be a result of this process.

## 3. Pseudocode

```plaintext
FUNCTION createRelationship(session, relationship)
    -- **TDD Anchor**
    -- TEST 'should create a relationship between two existing nodes'
    -- TEST 'should not create a duplicate relationship'
    -- TEST 'should handle relationships with different node types (e.g., Function-CALLS-Function, File-IMPORTS-File)'
    -- TEST 'should fail gracefully if one or both nodes do not exist'
    -- TEST 'should correctly use the relationship type as the relationship label'
    -- TEST 'should set properties on the relationship if provided'

    -- **Input**
    -- session-- The active Neo4j session object.
    -- relationship-- An object defining the relationship, containing 'from', 'to', and 'type' properties.
    --          'from' and 'to' are objects that uniquely identify the start and end nodes.
    --          Example-- { from-- { type-- 'Function', name-- 'a', ... }, to-- { ... }, type-- 'CALLS', properties-- { line-- 10 } }

    -- **Output**
    -- None. The method's effect is a `MERGE` operation in the Neo4j database.

    -- **Logic**
    -- 1. Validate the input relationship object.
    IF relationship IS NULL OR relationship.from IS NULL OR relationship.to IS NULL OR relationship.type IS NULL THEN
        LOG "Invalid relationship object provided-- " + relationship
        RETURN
    ENDIF

    -- 2. Extract the 'from', 'to', and 'type' details from the relationship object.
    from_node_def = relationship.from
    to_node_def = relationship.to
    rel_type = relationship.type
    rel_props = relationship.properties OR {} -- Optional properties for the relationship itself

    -- 3. Define the unique properties for matching the 'from' and 'to' nodes.
    --    This logic must be consistent with createNode().
    FUNCTION getMatchProperties(node_def)
        IF node_def.type EQUALS "File" THEN
            RETURN { filePath-- node_def.filePath }
        ELSE IF node_def.type EQUALS "Function" OR node_def.type EQUALS "Class" OR node_def.type EQUALS "Method" THEN
            RETURN { name-- node_def.name, filePath-- node_def.filePath }
        ELSE
            RETURN { name-- node_def.name }
        ENDIF
    ENDFUNCTION

    from_match_props = getMatchProperties(from_node_def)
    to_match_props = getMatchProperties(to_node_def)

    -- 4. Construct the Cypher query.
    --    - Use MATCH to find the start (a) and end (b) nodes.
    --    - Use MERGE to create the relationship `(a)-[r]->(b)`. This prevents duplicates.
    --    - Use `ON CREATE SET r = $props` to add any properties to the relationship when it's first created.
    query = `
        MATCH (a:${from_node_def.type} { ${Object.keys(from_match_props).map(key => `${key}: $from_${key}`).join(", ")} })
        MATCH (b:${to_node_def.type} { ${Object.keys(to_match_props).map(key => `${key}: $to_${key}`).join(", ")} })
        MERGE (a)-[r:${rel_type}]->(b)
        ON CREATE SET r = $props
        ON MATCH SET r += $props
    `

    -- 5. Prepare the parameters for the query, prefixing to avoid conflicts.
    params = {}
    FOR EACH key, value IN from_match_props
        params['from_' + key] = value
    ENDFOR
    FOR EACH key, value IN to_match_props
        params['to_' + key] = value
    ENDFOR
    params['props'] = rel_props

    -- 6. Execute the query.
    session.run(query, params)

ENDFUNCTION