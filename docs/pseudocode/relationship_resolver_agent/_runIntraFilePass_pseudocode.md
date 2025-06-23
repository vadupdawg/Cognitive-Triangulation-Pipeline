# _runIntraFilePass Method Pseudocode

## 1. Description
This method performs the first pass of relationship discovery, focusing exclusively on relationships contained within a single file. It takes a file analysis report, iterates through its Points of Interest (POIs), and identifies connections (like function calls, variable usage, or class inheritance) between them.

## 2. SPARC Design
- **Specification**-- Analyzes a single file's POIs to find relationships contained entirely within that file.
- **Pseudocode**-- This document.
- **Architecture**-- The method is a private, asynchronous function within the `RelationshipResolver` agent. It's designed to be a pure function, taking a report and returning relationships without side effects.
- **Refinement**-- The logic will use a Map for efficient lookups to avoid O(n^2) complexity.
- **Completion**-- The final implementation will produce an array of `Relationship` objects.

## 3. Method Signature
`FUNCTION _runIntraFilePass(report)`
- **INPUT**-- `report` (Type-- FileAnalysisReport) - An object containing the file path and a list of POIs found in that file. Each POI includes its name, type, and a list of references it makes to other entities.
- **OUTPUT**-- `Promise<Relationship[]>` - A promise that resolves to a list of `Relationship` objects discovered within the file.

## 4. TDD Anchors
- **TEST_HAPPY_PATH**-- Should identify a direct function call relationship between two POIs in the same file.
- **TEST_MULTIPLE_RELATIONSHIPS**-- Should identify multiple relationships from a single source POI to different target POIs in the same file.
- **TEST_NO_RELATIONSHIPS**-- Should return an empty array for a file with POIs that have no internal references.
- **TEST_NO_POIS**-- Should return an empty array for a file analysis report that contains no POIs.
- **TEST_IGNORE_EXTERNAL**-- Should not create a relationship for a reference that points to an entity not found within the same file's POI list.
- **TEST_COMPLEX_CASE**-- Should correctly identify various relationship types (e.g., 'CALLS', 'USES_VARIABLE', 'INHERITS_FROM') if the POI data supports it.

## 5. Pseudocode
```pseudocode
BEGIN FUNCTION _runIntraFilePass(report)
    // 1. Initialization
    foundRelationships = NEW_ARRAY()
    
    // TDD Anchor-- TEST_NO_POIS
    IF report.pois IS NULL OR report.pois IS EMPTY THEN
        RETURN foundRelationships
    END IF

    // 2. Create a lookup map for efficient access to POIs within this file.
    // The key is the POI's unique name or identifier, the value is the POI object itself.
    poiMap = NEW_MAP()
    FOR EACH poi IN report.pois
        poiMap.SET(poi.name, poi)
    END FOR

    // 3. Iterate through each POI to find its relationships to other POIs in the same file.
    FOR EACH sourcePoi IN report.pois
        // TDD Anchor-- TEST_NO_RELATIONSHIPS (for a single POI)
        IF sourcePoi.references IS NULL OR sourcePoi.references IS EMPTY THEN
            CONTINUE // Move to the next POI
        END IF

        // 4. Check each reference made by the current POI.
        FOR EACH reference IN sourcePoi.references
            targetPoiName = reference.name // The name of the entity being referenced

            // 5. Check if the referenced POI exists in the current file.
            // TDD Anchor-- TEST_HAPPY_PATH, TEST_IGNORE_EXTERNAL
            IF poiMap.HAS(targetPoiName) THEN
                // Relationship is internal to the file.
                targetPoi = poiMap.GET(targetPoiName)

                // 6. Construct the Relationship object.
                // TDD Anchor-- TEST_MULTIPLE_RELATIONSHIPS, TEST_COMPLEX_CASE
                newRelationship = NEW Relationship(
                    sourceId-- sourcePoi.id,
                    targetId-- targetPoi.id,
                    type-- reference.type, // e.g., 'CALLS', 'IMPORTS', 'EXTENDS'
                    context-- `Intra-file relationship from ${sourcePoi.name} to ${targetPoi.name}`,
                    filePath-- report.filePath
                )

                // 7. Add the new relationship to our list.
                foundRelationships.PUSH(newRelationship)
            END IF
        END FOR
    END FOR

    // 8. Return all the relationships found within the file.
    RETURN foundRelationships
END FUNCTION