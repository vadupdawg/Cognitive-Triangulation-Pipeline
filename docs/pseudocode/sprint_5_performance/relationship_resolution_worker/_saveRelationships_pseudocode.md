# Pseudocode for `_saveRelationships(relationshipResults, transaction)`

## Description
This method saves a list of discovered relationships to the graph database using a provided, active transaction. The operations are idempotent, ensuring that creating the same relationship multiple times does not result in duplicate data. This method participates in a larger atomic operation managed by the `processJob` method.

## SPARC Pseudocode Design

```plaintext
FUNCTION _saveRelationships(relationshipResults, transaction)

  -- TDD ANCHOR Test that the function correctly handles an empty relationshipResults list.
  IF relationshipResults IS NULL OR an empty list THEN
    LOG "No relationships to save."
    RETURN
  END IF

  -- TDD ANCHOR Test that the function throws an error if the transaction object is invalid or missing.
  IF transaction IS NULL OR is not a valid transaction object THEN
    THROW new Error("A valid database transaction must be provided.")
  END IF

  -- TDD ANCHOR Test that a valid relationship with a source and target is correctly merged into the database.
  -- TDD ANCHOR Test that relationships are correctly created for different POI types (e.g., FUNCTION, VARIABLE).
  FOR EACH relationship IN relationshipResults
    -- Define queries for idempotency using MERGE
    -- MERGE on source POI (Point of Interest)
    sourceQuery = `
      MERGE (s:POI {
        checksum: $sourceChecksum,
        poi_type: $sourcePoiType,
        name: $sourceName,
        filePath: $sourceFilePath
      })
      RETURN s
    `
    sourceParams = {
      checksum: relationship.source.checksum,
      poiType: relationship.source.poi_type,
      name: relationship.source.name,
      filePath: relationship.source.filePath
    }

    -- MERGE on target POI
    targetQuery = `
      MERGE (t:POI {
        checksum: $targetChecksum,
        poi_type: $targetPoiType,
        name: $targetName,
        filePath: $targetFilePath
      })
      RETURN t
    `
    targetParams = {
      checksum: relationship.target.checksum,
      poiType: relationship.target.poi_type,
      name: relationship.target.name,
      filePath: relationship.target.filePath
    }

    -- MERGE the relationship between the source and target
    relationshipQuery = `
      MATCH (s:POI {checksum: $sourceChecksum, filePath: $sourceFilePath})
      MATCH (t:POI {checksum:<i> </i>$targetChecksum, filePath: $targetFilePath})
      MERGE (s)-[r:RELATES_TO {
        type: $relationshipType,
        explanation: $explanation,
        weight: $weight
      }]->(t)
      RETURN r
    `
    relationshipParams = {
      sourceChecksum: relationship.source.checksum,
      sourceFilePath: relationship.source.filePath,
      targetChecksum: relationship.target.checksum,
      targetFilePath: relationship.target.filePath,
      relationshipType: relationship.type,
      explanation: relationship.explanation,
      weight: relationship.weight
    }

    -- Execute queries within the provided transaction
    -- TDD ANCHOR Test that all three MERGE statements are executed for a single valid relationship.
    transaction.run(sourceQuery, sourceParams)
    transaction.run(targetQuery, targetParams)
    transaction.run(relationshipQuery, relationshipParams)
  ENDFOR

  -- TDD ANCHOR Test that when given 10 relationships, the correct number of queries are run against the transaction.
  LOG "Successfully staged relationship saves within the transaction."

  RETURN

END FUNCTION
```

## Input
- `relationshipResults`: A list of objects, where each object represents a relationship with `source`, `target`, `type`, `explanation`, and `weight`.
- `transaction`: An active database transaction object.

## Output
- None. The method executes database commands within the provided transaction.

## TDD Anchors
1.  **Empty Input**: Test that the function handles a `NULL` or empty `relationshipResults` list gracefully.
2.  **Invalid Transaction**: Test that the function throws an error if the `transaction` object is missing or invalid.
3.  **Happy Path**: Test that a single, valid relationship is correctly translated into three `MERGE` statements and executed on the transaction.
4.  **Batch Processing**: Test that a list of multiple relationships are all correctly processed.
5.  **Idempotency Check**: Run the same relationship list through the function twice and verify that no duplicate nodes or relationships are created in the database after committing both transactions.
6.  **POI Variety**: Test with relationships connecting different types of POIs (e.g., `FUNCTION` to `VARIABLE`, `CLASS` to `FUNCTION`).