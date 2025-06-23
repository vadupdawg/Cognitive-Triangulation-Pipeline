# RelationshipResolver.run() Pseudocode

## Description
Orchestrates the three-pass relationship resolution process to identify and verify relationships between points of interest (POIs) across the entire project. It ensures that analysis proceeds from local (intra-file) to intermediate (intra-directory) and finally to global (cross-directory) context, aggregating and refining findings at each distinct stage. This method explicitly manages the sequential execution of each pass, ensuring a decoupled and clear workflow.

## TDD Anchors
- TEST a full run orchestrates the three passes sequentially-- intra-file, intra-directory, and then global.
- TEST the method aggregates relationships from all three distinct passes.
- TEST the final list of relationships is correctly deduplicated to remove redundant entries.
- TEST an error occurring during any pass is caught, logged, and handled gracefully.
- TEST it correctly loads and groups initial POI reports by directory before starting the passes.
- TEST it returns the expected data structure containing the final list of relationships and summary metadata.
- TEST if no reports are found, it returns an empty result set without attempting the passes.

## Pseudocode

```pseudocode
ASYNC FUNCTION run()
  // --- INITIALIZATION ---
  // Announce the start of the process for clarity in logs.
  PRINT "Starting 3-pass relationship resolution orchestration."

  // Initialize collections to hold results from each pass.
  allDiscoveredRelationships = CREATE_LIST()
  intraFilePassResults = CREATE_MAP() // Map directory path to list of enriched reports
  intraDirectorySummaries = CREATE_LIST()

  TRY
    // --- PRE-COMPUTATION: LOAD AND GROUP REPORTS ---
    // Load all POI analysis reports from the database and group them by their parent directory.
    // This provides the foundational data for the first two passes.
    // TEST ANCHOR-- Verifies that reports are loaded and grouped correctly.
    reportsByDirectory = AWAIT this._loadAndGroupReports()

    // Handle case where no reports are available to process.
    IF reportsByDirectory IS EMPTY THEN
      PRINT "No POI reports found to process. Terminating resolution."
      RETURN { relationships-- [], metadata-- { message-- "No reports found." } }
    END IF

    // --- PASS 1: INTRA-FILE ANALYSIS ---
    // Analyze relationships *within* each individual file. This is the most granular pass.
    PRINT "Executing Pass 1: Intra-File Analysis for all files..."
    FOR EACH directory, reports IN reportsByDirectory
      intraFilePassResults[directory] = CREATE_LIST()
      FOR EACH report IN reports
        // Each report contains all POIs for a single file.
        // TEST ANCHOR-- Ensures _runIntraFilePass is called for each file report.
        fileLevelRelationships = AWAIT this._runIntraFilePass(report)
        allDiscoveredRelationships.push(...fileLevelRelationships)

        // Enrich the report with the findings from this pass for use in the next pass.
        report.intraFileRelationships = fileLevelRelationships
        intraFilePassResults[directory].push(report)
      END FOR
    END FOR
    PRINT "Pass 1: Intra-File Analysis complete."

    // --- PASS 2: INTRA-DIRECTORY ANALYSIS ---
    // Analyze relationships *between* files within the same directory, using the results from Pass 1.
    PRINT "Executing Pass 2: Intra-Directory Analysis for all directories..."
    FOR EACH directory, enrichedReports IN intraFilePassResults
      // `enrichedReports` contains the POIs and the intra-file relationships found in Pass 1.
      // TEST ANCHOR-- Ensures _runIntraDirectoryPass is called for each directory.
      directorySummary = AWAIT this._runIntraDirectoryPass(directory, enrichedReports)

      // Aggregate new relationships found at the directory level.
      allDiscoveredRelationships.push(...directorySummary.relationships)
      
      // Collect the summary for the final global pass.
      intraDirectorySummaries.push(directorySummary)
    END FOR
    PRINT "Pass 2: Intra-Directory Analysis complete."

    // --- PASS 3: GLOBAL ANALYSIS ---
    // Analyze relationships *across all directories* using the summaries from Pass 2.
    PRINT "Executing Pass 3: Global Analysis..."
    // TEST ANCHOR-- Ensures _runGlobalPass is called with all directory summaries.
    globalRelationships = AWAIT this._runGlobalPass(intraDirectorySummaries)
    allDiscoveredRelationships.push(...globalRelationships)
    PRINT "Pass 3: Global Analysis complete."

    // --- FINALIZATION ---
    // Consolidate, deduplicate, and prepare the final output.
    PRINT "Finalizing results..."
    // TEST ANCHOR-- Verifies that the final relationship list is properly deduplicated.
    finalUniqueRelationships = DEDUPLICATE(allDiscoveredRelationships, ["sourcePoiId", "targetPoiId", "type"])

    // TEST ANCHOR-- Verifies the method returns the correct final data structure.
    RETURN {
      relationships-- finalUniqueRelationships,
      metadata-- {
        totalRelationshipsFound-- allDiscoveredRelationships.length,
        uniqueRelationships-- finalUniqueRelationships.length,
        directoriesProcessed-- intraDirectorySummaries.length
      }
    }

  CATCH error
    // Log the error for debugging and return a structured error response.
    // TEST ANCHOR-- Ensures any exception during the process is caught and handled.
    LOG_ERROR "An error occurred during relationship resolution-- " + error.stack
    RETURN { 
      relationships-- [], 
      metadata-- { 
        error-- "A critical error occurred in the resolution pipeline.",
        errorMessage-- error.message 
      } 
    }
  END TRY

END FUNCTION