# AggregationService Pseudocode

**Author**: AI Assistant
**Date**: 2025-06-26
**Version**: 1.1

## 1. Overview

The `AggregationService` is a stateful worker responsible for tracking the completion of file analysis within directories. It listens for `file-analysis-completed` events. When all files within a specific directory have been analyzed, it aggregates the findings (Points of Interest - POIs) and triggers the next stage of the pipeline by publishing a `directory-summary-created` event. This service is crucial for transitioning from file-level analysis to directory-level understanding.

## 2. Dependencies

-   **EventBus**: A message broker for subscribing to and publishing events (e.g., Redis Pub/Sub, RabbitMQ).
-   **StateStore**: A key-value store for maintaining the state of directory processing (e.g., Redis Hashes, in-memory Map). It MUST support atomic operations to prevent race conditions.
-   **Logger**: For logging service activity, warnings, and errors.

## 3. State Management

The service maintains state for each directory it's tracking. The state is stored in the `StateStore` using a key derived from the directory path (e.g., `directory-progress--<directoryPath>`).

**State Object Structure:**

```
{
  "totalFiles"      -- INTEGER,      // Total number of files in the directory
  "processedFiles"  -- INTEGER,      // Counter for files processed so far
  "aggregatedPOIs"  -- [STRING],     // An aggregated list of POIs from all processed files
  "filesProcessed"  -- [STRING]      // List of file paths already processed to handle potential duplicates
}
```

-- TEST State initialization -- Ensure a new directory entry is created correctly with the first file event.
-- TEST State update -- Ensure subsequent file events for the same directory correctly update the state (increment counter, append POIs).
-- TEST Atomicity under concurrency -- Simulate multiple concurrent events for the same new directory and verify the final state is correct (no lost updates).

## 4. Core Logic

### 4.1. Service Initialization

```
FUNCTION initializeAggregationService(eventBus, stateStore, logger)
  INPUT eventBus, stateStore, logger
  OUTPUT none

  -- TEST Initialization -- Ensure the service successfully subscribes to the correct event channel.
  logger.info("AggregationService initializing...")
  eventBus.subscribe("file-analysis-completed", handleFileAnalysisCompleted)
  logger.info("AggregationService subscribed to 'file-analysis-completed' events.")

END FUNCTION
```

### 4.2. Event Handler `handleFileAnalysisCompleted`

This function is the main entry point for the service's logic, triggered by the `EventBus`. It offloads the complex state logic to an atomic operation in the `StateStore`.

```
FUNCTION handleFileAnalysisCompleted(eventData)
  INPUT eventData (contains directoryPath, filePath, totalFiles, pois)
  OUTPUT none

  -- TDD Anchor TEST for valid event data processing
  TRY
    -- 1. Validate and extract data from the event
    -- TEST Event data validation -- Handle missing or malformed event data gracefully.
    directoryPath = eventData.directoryPath
    filePath = eventData.filePath
    totalFiles = eventData.totalFiles
    pois = eventData.pois

    IF directoryPath IS NULL OR filePath IS NULL OR totalFiles IS NULL THEN
      logger.error("Invalid event data received", eventData)
      RETURN
    END IF

    -- 2. Atomically update directory progress state
    -- This delegates the read-modify-write logic to a single, atomic transaction in the StateStore.
    -- TEST State update atomicity -- Verify that concurrent calls for the same directory result in a correct final state.
    -- TEST Idempotency -- Ensure processing the same file event is correctly identified as a duplicate and ignored.
    stateKey = "directory-progress--" + directoryPath
    updatePayload = {
        filePath_to_add: filePath,
        pois_to_add: pois,
        totalFiles_from_event: totalFiles
    }

    atomicUpdateResult = stateStore.atomic_update_directory_state(stateKey, updatePayload)

    -- The atomic operation returns a status and the potentially updated state
    status = atomicUpdateResult.status
    updatedDirectoryState = atomicUpdateResult.newState

    IF status == "DUPLICATE_FILE" THEN
        logger.warn("Duplicate file event received, ignoring.", { filePath, directoryPath })
        RETURN
    ELSEIF status == "ERROR" THEN
        logger.error("Atomic update failed for directory", { directoryPath, error: atomicUpdateResult.error })
        RETURN
    END IF

    logger.info("Updated progress for directory", { directoryPath, progress: updatedDirectoryState.processedFiles + "/" + updatedDirectoryState.totalFiles })

    -- 3. Check for completion
    -- TEST Completion check (incomplete) -- Verify that nothing is triggered when processedFiles < totalFiles.
    IF updatedDirectoryState.processedFiles >= updatedDirectoryState.totalFiles THEN
      logger.info("All files processed for directory", { directoryPath })
      -- TEST Completion check (complete) -- Verify the aggregation and event publishing is triggered when processedFiles == totalFiles.
      triggerDirectorySummary(directoryPath, updatedDirectoryState.aggregatedPOIs)
      
      -- 4. Clean up state after processing
      -- TEST State cleanup -- Ensure the state for a completed directory is removed from the StateStore.
      stateStore.delete(stateKey)
      logger.info("Cleaned up state for completed directory", { directoryPath })
    END IF

  CATCH error
    -- TEST Error handling -- Ensure exceptions during event processing are caught and logged.
    logger.error("Error in handleFileAnalysisCompleted", { error: error, event: eventData })
  END TRY

END FUNCTION
```

### 4.3. `StateStore` Atomic Operation

This section describes the logic that must be implemented as a single, indivisible operation within the `StateStore` (e.g., via a Lua script in Redis or a database transaction).

```
FUNCTION atomic_update_directory_state(stateKey, updatePayload)
  -- This function MUST be executed atomically.
  INPUT stateKey (STRING), updatePayload (OBJECT: {filePath_to_add, pois_to_add, totalFiles_from_event})
  OUTPUT OBJECT: {status, newState}

  -- 1. Get current state
  directoryState = GET(stateKey)

  -- 2. Initialize state if it does not exist
  IF directoryState IS NULL THEN
    directoryState = {
      "totalFiles"      -- updatePayload.totalFiles_from_event,
      "processedFiles"  -- 0,
      "aggregatedPOIs"  -- [],
      "filesProcessed"  -- []
    }
  END IF

  -- 3. Check for duplicate file processing to ensure idempotency
  IF updatePayload.filePath_to_add IN directoryState.filesProcessed THEN
    RETURN {status: "DUPLICATE_FILE", newState: directoryState}
  END IF

  -- 4. Update the state
  directoryState.processedFiles += 1
  directoryState.aggregatedPOIs.append_all(updatePayload.pois_to_add)
  directoryState.filesProcessed.append(updatePayload.filePath_to_add)

  -- 5. Save the updated state
  SET(stateKey, directoryState)

  -- 6. Return success and the new state
  RETURN {status: "SUCCESS", newState: directoryState}
END FUNCTION
```

### 4.4. Function `triggerDirectorySummary`

This function is called when a directory is fully processed. It constructs the summary prompt and publishes the completion event.

```
FUNCTION triggerDirectorySummary(directoryPath, aggregatedPOIs)
  INPUT directoryPath (STRING), aggregatedPOIs (LIST of STRINGS)
  OUTPUT none

  -- 1. Construct the summary prompt
  -- TEST Prompt construction -- Verify the prompt is correctly formatted and includes all POIs.
  prompt = "Based on the following points of interest from multiple files, provide a concise summary of the directory's overall purpose, key entities, and relationships: \n\n"
  
  uniquePOIs = unique(flatten(aggregatedPOIs)) -- Flatten list of lists and get unique POIs
  prompt += "- " + uniquePOIs.join("\n- ")
  
  logger.info("Constructed summary prompt for directory", { directoryPath })

  -- 2. Create the event payload for the next stage
  -- TEST Event payload creation -- Ensure the published event has the correct structure and data.
  outputEventData = {
    "directoryPath"  -- directoryPath,
    "summaryPrompt"  -- prompt,
    "aggregatedPOIs" -- uniquePOIs
  }

  -- 3. Publish the event
  -- TEST Event publishing -- Verify the 'directory-summary-created' event is published correctly.
  eventBus.publish("directory-summary-created", outputEventData)
  logger.info("Published 'directory-summary-created' event for", { directoryPath })

END FUNCTION
```

## 5. Helper Functions

```
FUNCTION flatten(listOfLists)
    -- Helper to flatten a list of lists into a single list
    RETURN [item FOR sublist IN listOfLists FOR item IN sublist]
END FUNCTION

FUNCTION unique(list)
    -- Helper to get unique items from a list
    RETURN a new list with unique items from the input list
END FUNCTION