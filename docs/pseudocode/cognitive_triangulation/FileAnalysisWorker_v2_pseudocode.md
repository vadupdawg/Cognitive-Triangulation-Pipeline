# Pseudocode-- FileAnalysisWorker (v2)

This document provides the language-agnostic pseudocode for the `FileAnalysisWorker` v2, which is responsible for the initial analysis of a single source code file. It incorporates a primary LLM-based analysis path and a secondary regex-based fallback for resiliency.

## 1. Class-- FileAnalysisWorker

### Dependencies
-   `Logger`-- For structured logging.
-   `FileSystem`-- For reading file content.
-   `LlmClient`-- To perform analysis on file content.
-   `HashingService`-- To create unique hashes for relationships.
-   `ConfidenceScoringService`-- To assign initial scores to relationships.
-   `DatabaseClient`-- To store analysis results.
-   `QueueClient`-- To publish completion events.

---

### 2. Method-- `processJob`

**Purpose**-- Orchestrates the analysis of a single file as dictated by a job from the queue. It handles both successful LLM analysis and failures that trigger a fallback mechanism.

**INPUT**-- `job` (Object)-- Contains `runId` and `filePath`.

```pseudocode
FUNCTION processJob(job)
    // TEST-- processJob correctly extracts job data and initiates logging.
    LOG "Starting file analysis for job:", job.id, "File:", job.data.filePath

    DECLARE runId = job.data.runId
    DECLARE filePath = job.data.filePath
    DECLARE fileContent, analysisResult
    DECLARE isFallback = FALSE

    TRY
        // 1. Read File Content
        fileContent = FileSystem.readFile(filePath)
        // TEST-- processJob throws an error if the file cannot be read.
    CATCH fileReadError
        LOG_ERROR "Failed to read file:", filePath, "Error:", fileReadError
        // Optional-- publish a failure event
        RETURN // End execution for this job
    END TRY

    // 2. Attempt LLM Analysis
    TRY
        LOG "Attempting LLM analysis for file:", filePath
        analysisResult = LlmClient.getAnalysis(fileContent)
        // TEST-- processJob successfully handles a valid LLM response.
    CATCH llmError
        LOG_WARNING "LLM analysis failed for file:", filePath, "Error:", llmError
        LOG "Triggering regex fallback mechanism."
        
        // 3. Trigger Best-Effort Fallback
        // TEST-- processJob triggers regex fallback when LLM client throws an unrecoverable error.
        analysisResult = this.performRegexFallback(fileContent)
        isFallback = TRUE
    END TRY

    // 4. Process POIs and Relationships
    DECLARE poisToSave = analysisResult.pois
    DECLARE relationshipsToSave = []

    // TEST-- processJob correctly processes an empty list of relationships.
    FOR EACH relationship IN analysisResult.relationships
        // 4a. Create unique hash for the relationship
        // TEST-- processJob correctly hashes each relationship using the HashingService.
        DECLARE relationshipHash = HashingService.createRelationshipHash(relationship)
        
        // 4b. Get initial confidence score
        DECLARE initialScore
        IF isFallback THEN
            // TEST-- Relationships from fallback are assigned a very low fixed score.
            initialScore = ConfidenceScoringService.getFixedFallbackScore()
            relationship.parseStatus = 'UNRELIABLE_PARSE'
        ELSE
            initialScore = ConfidenceScoringService.getInitialScoreFromLlm(relationship)
            relationship.parseStatus = 'SUCCESSFUL_PARSE'
        END IF

        // 4c. Augment relationship object
        relationship.hash = relationshipHash
        relationship.initialScore = initialScore
        relationship.status = 'PENDING_VALIDATION'
        relationship.runId = runId
        
        ADD relationship TO relationshipsToSave
    END FOR

    // 5. Save results to the database
    TRY
        // TEST-- processJob saves all POIs and scored relationships to the database in a single transaction.
        DatabaseClient.beginTransaction()
        DatabaseClient.savePois(poisToSave)
        DatabaseClient.saveRelationships(relationshipsToSave)
        DatabaseClient.commitTransaction()
        LOG "Successfully saved analysis for file:", filePath
    CATCH dbError
        LOG_ERROR "Database error saving analysis for file:", filePath, "Error:", dbError
        DatabaseClient.rollbackTransaction()
        // Optional-- publish a failure event
        RETURN // End execution
    END TRY

    // 6. Publish completion event
    // TEST-- processJob publishes the 'file-analysis-completed' event with the correct payload.
    DECLARE eventPayload = {
        runId: runId,
        filePath: filePath,
        status: "completed",
        source: isFallback ? "regex-fallback" : "llm-analysis"
    }
    QueueClient.publish("file-analysis-completed", eventPayload)
    LOG "Published file-analysis-completed event for:", filePath

END FUNCTION
```

---

### 3. Method-- `performRegexFallback`

**Purpose**-- A fallback mechanism to extract basic Points of Interest (POIs) using regular expressions when the primary LLM analysis fails. It is designed for resiliency, not for deep analysis.

**INPUT**-- `fileContent` (String)-- The raw text content of the file.
**OUTPUT**-- `Object`-- `{ pois, relationships }`

```pseudocode
FUNCTION performRegexFallback(fileContent)
    LOG "Executing performRegexFallback."
    DECLARE pois = []
    
    // 1. Apply a series of predefined regex patterns
    // Example patterns-- could be stored in a configuration file
    DECLARE regexPatterns = [
        { type: "FunctionDefinition", pattern: /function\s+(\w+)/g },
        { type: "ClassDeclaration", pattern: /class\s+(\w+)/g },
        { type: "VariableDeclaration", pattern: /const\s+(\w+)/g }
        // ... add more patterns for different languages/constructs
    ]

    // TEST-- performRegexFallback extracts POIs for a known file type (e.g., JavaScript).
    FOR EACH item IN regexPatterns
        DECLARE matches = fileContent.matchAll(item.pattern)
        FOR EACH match IN matches
            DECLARE poi = {
                name: match[1],
                type: item.type,
                sourceFile: "self" // Placeholder, actual path is known in processJob
            }
            ADD poi TO pois
        END FOR
    END FOR

    LOG "Found", pois.length, "POIs via regex fallback."

    // 2. Return structure similar to LLM, but with no relationships
    // TEST-- performRegexFallback returns an empty relationship array.
    RETURN {
        pois: pois,
        relationships: [] 
    }
END FUNCTION