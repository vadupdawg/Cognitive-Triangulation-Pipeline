# Pseudocode for `_loadAllPois` Method (Database Version)

This document outlines the detailed logic for the `_loadAllPois` method of the `GraphBuilder` agent, refactored to use a central database.

## Method Signature

`_loadAllPois() -- returns Promise<Map<string, POI>>`

## Purpose

Loads all `FileAnalysisReport` data from a central SQLite database. It then extracts every Point of Interest (POI) from these reports and organizes them into a single map, using the Unique POI Identifier (UPID) as the key for fast lookups. This approach replaces the brittle file-based system with a robust, database-driven one.

## Dependencies

-   `config.database`-- A configuration object with details for connecting to the SQLite database.
-   SQLite database driver -- To connect to and query the database.
-   JSON parser -- To parse the JSON content stored in database records.

## Data Structures

-   `POI`-- A Point of Interest object, which must contain a `upid` property (string).
-   `FileAnalysisReport`-- An object that contains a `pois` property, which is an array of `POI` objects. This is stored as a JSON string in the database.
-   `poiMap`-- A Map where keys are `UPID` strings and values are `POI` objects.

---

## Pseudocode

```plaintext
FUNCTION _loadAllPois()

  // TDD ANCHOR-- TEST behavior when the method is called
  // AI Verifiable End Result-- A Map is returned containing all POIs from the database, keyed by UPID.

  // 1. Initialization
  DEFINE poiMap AS a new Map<string, POI>
  DEFINE dbConnection AS null

  // 2. Database Connection and Query Execution
  TRY
    // TDD ANCHOR-- TEST behavior when database connection fails
    dbConnection = connectToDatabase(config.database)

    // TDD ANCHOR-- TEST behavior when the database query fails
    DEFINE query AS "SELECT analysis_json FROM file_analysis_reports"
    DEFINE records AS executeQuery(dbConnection, query)

    // 3. Process each database record
    // TDD ANCHOR-- TEST behavior when the database table is empty
    IF records is empty THEN
      LOG "No POI reports found in the database."
      // The function will naturally return an empty map after the FINALLY block.
    END IF

    FOR EACH record in records
      // TDD ANCHOR-- TEST behavior with a malformed or unreadable JSON string in a record
      TRY
        // 3a. Parse the JSON content from the record
        DEFINE reportJson AS record.analysis_json
        IF reportJson is null or empty THEN
          LOG "Warning-- Found a record with null or empty analysis_json. Skipping."
          CONTINUE
        END IF
        
        DEFINE report AS parseJson(reportJson)

        // 3b. Validate the report structure
        // TDD ANCHOR-- TEST behavior with valid JSON but missing the 'pois' array
        IF report has property "pois" AND report.pois is an Array THEN
          // 3c. Extract POIs and add them to the map
          FOR EACH poi IN report.pois
            // TDD ANCHOR-- TEST behavior when a POI object is missing a 'upid'
            IF poi has property "upid" AND poi.upid is not null or empty THEN
              // TDD ANCHOR-- TEST behavior for handling duplicate UPIDs (last one wins)
              poiMap.set(poi.upid, poi)
            ELSE
              LOG "Warning-- Found a POI without a UPID in a database record."
            END IF
          END FOR
        ELSE
          LOG "Warning-- Database record's JSON is missing a 'pois' array."
        END IF

      CATCH parseError
        LOG "Error parsing JSON from a database record."
        LOG parseError
        // Continue to the next record, do not stop the whole process
        CONTINUE
      END TRY
    END FOR

  CATCH dbError
    LOG "A database error occurred while loading POIs."
    LOG dbError
    // In case of a connection or query error, return an empty map.
    // The poiMap will be empty at this point.
    RETURN poiMap
  FINALLY
    // 4. Ensure database connection is closed
    IF dbConnection is not null THEN
      CLOSE dbConnection
    END IF
  END TRY

  // 5. Return the completed map
  // TDD ANCHOR-- TEST behavior to verify the final map contains the correct number of POIs
  LOG "Successfully loaded " + poiMap.size + " POIs from the database."
  RETURN poiMap

END FUNCTION