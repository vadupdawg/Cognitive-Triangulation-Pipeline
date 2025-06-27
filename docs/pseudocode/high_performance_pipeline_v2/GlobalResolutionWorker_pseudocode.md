# Pseudocode- GlobalResolutionWorker

**Purpose-** This document outlines the pseudocode for the `GlobalResolutionWorker`. This worker identifies potential relationships between code directories by comparing their analysis summaries and publishes these candidates with a deterministic, unique ID.

## 1. Overview

The `GlobalResolutionWorker` listens for `directory-summary-created` events. It maintains a cache of these summaries. Upon receiving a new summary, it compares it against all cached summaries to find cross-directory relationships (e.g., two files sharing a function name). When a link is found, it generates a deterministic `relationship_id` and publishes a `global-relationship-candidate` event containing this ID for downstream validation.

---

## 2. Constants and Configuration

```plaintext
CONSTANT DIRECTORY_SUMMARY_EVENT = "directory-summary-created"
CONSTANT RELATIONSHIP_CANDIDATE_EVENT = "global-relationship-candidate"
```

---

## 3. Data Structures

### DirectorySummary
A data object representing the analyzed contents of a single directory.
```plaintext
STRUCTURE DirectorySummary
  STRING directoryPath
  STRING directoryHash
  LIST of FileSummary fileSummaries
END STRUCTURE
```

### FileSummary
A data object representing the analyzed contents of a single file, acting as a "node".
```plaintext
STRUCTURE FileSummary
  STRING id // Unique identifier, e.g., the full file path
  STRING fileHash
  LIST of STRING entitiesFound  // e.g., function names, class names
  LIST of STRING keywords
END STRUCTURE
```

### GlobalRelationshipCandidate
A data object representing a potential link between two files.
```plaintext
STRUCTURE GlobalRelationshipCandidate
  STRING relationship_id       // Deterministically generated ID
  STRING relationship_type     // e.g., "SHARED_ENTITY", "COMMON_KEYWORD"
  FileSummary source_node
  FileSummary target_node
  STRING linking_element     // The specific entity or keyword that forms the link
  INTEGER expected_evidence_count // How many pieces of evidence are expected for this relationship
  FLOAT confidence_score      // Initial confidence from this worker
END STRUCTURE
```

### GlobalStateCache
A key-value store to hold directory summaries.
```plaintext
STRUCTURE GlobalStateCache
  MAP of <STRING directoryHash, DirectorySummary summary>
END STRUCTURE
```
*   **TEST TDD Anchor-** Test that the cache can correctly store and retrieve `DirectorySummary` objects.

---

## 4. Pseudocode

### CLASS GlobalResolutionWorker

#### Properties
```plaintext
PRIVATE EventBus eventBus
PRIVATE GlobalStateCache stateCache
```

#### Constructor
```plaintext
FUNCTION constructor(eventBus)
  SET this.eventBus = eventBus
  SET this.stateCache = NEW GlobalStateCache()
  CALL this.initializeListener()
END FUNCTION
```
*   **TEST TDD Anchor-** Test that the worker instance is created with an empty cache and `initializeListener` is called.

#### `initializeListener`
```plaintext
FUNCTION initializeListener()
  this.eventBus.subscribe(DIRECTORY_SUMMARY_EVENT, this.handleNewDirectorySummary)
END FUNCTION
```
*   **TEST TDD Anchor-** Test that the worker correctly subscribes to the `DIRECTORY_SUMMARY_EVENT`.

#### `handleNewDirectorySummary`
The core event handler for processing incoming directory summaries.
```plaintext
FUNCTION handleNewDirectorySummary(newSummary)
  // TEST TDD Anchor- Test that the handler gracefully ignores a summary if it's already in the cache.
  IF this.stateCache.contains(newSummary.directoryHash) THEN
    LOG "Info- Duplicate summary received, skipping."
    RETURN
  END IF

  // Compare the new summary against all existing summaries in the cache
  FOR EACH existingSummary in this.stateCache.values()
    IF newSummary.directoryPath != existingSummary.directoryPath THEN
      SET candidates = findRelationships(newSummary, existingSummary)
      
      FOR EACH candidate in candidates
        this.eventBus.publish(RELATIONSHIP_CANDIDATE_EVENT, candidate)
        // TEST TDD Anchor- Test that a `global-relationship-candidate` event is published for each found candidate.
      END FOR
    END IF
  END FOR

  // Add the new summary to the cache for future comparisons
  this.stateCache.add(newSummary.directoryHash, newSummary)
  // TEST TDD Anchor- Test that the new summary is successfully added to the stateCache after processing.
END FUNCTION
```

#### `findRelationships`
Compares two directory summaries and identifies relationship candidates.
```plaintext
FUNCTION findRelationships(summaryA, summaryB)
  SET relationshipCandidates = NEW LIST of GlobalRelationshipCandidate

  FOR EACH fileA in summaryA.fileSummaries
    FOR EACH fileB in summaryB.fileSummaries
      
      // Compare entities
      FOR EACH entityA in fileA.entitiesFound
        IF fileB.entitiesFound.contains(entityA) THEN
          STRING relationshipType = "SHARED_ENTITY"

          // TDD Anchor- TEST that the deterministic ID is generated correctly.
          STRING rel_id = generateDeterministicRelationshipId(fileA, fileB, relationshipType)

          SET candidate = NEW GlobalRelationshipCandidate(
            relationship_id = rel_id,
            relationship_type = relationshipType,
            source_node = fileA,
            target_node = fileB,
            linking_element = entityA,
            expected_evidence_count = 2, // e.g., one for each file analysis, plus this global one.
            confidence_score = 0.75 // This worker's confidence in the candidate
          )
          relationshipCandidates.add(candidate)
          // TEST TDD Anchor- Test that a relationship is identified when two files share the same entity name.
        END IF
      END FOR
      
    END FOR
  END FOR
  
  // TEST TDD Anchor- Test that no relationships are returned if there are no commonalities.
  RETURN relationshipCandidates
END FUNCTION
```

## 5. Shared Helper Functions

```pseudocode
// This function is conceptually shared across workers that deal with relationships.
// It MUST be identical to the one used by ValidationWorker.
FUNCTION generateDeterministicRelationshipId(nodeA, nodeB, relationshipType)
    // TDD Anchor- TEST that nodeA and nodeB IDs are correctly ordered alphabetically
    // Assumes nodeA and nodeB are objects with an 'id' property (e.g., file path)
    LIST<STRING> node_ids = [nodeA.id, nodeB.id]
    SORT node_ids alphabetically

    // TDD Anchor- TEST that the concatenated string is formed correctly regardless of initial node order
    STRING combined_key = node_ids[0] + "--" + node_ids[1] + "--" + relationshipType

    // TDD Anchor- TEST that the hash function produces a consistent, expected output for a given key
    RETURN "SHA256(" + combined_key + ")" // Represents a stable hashing algorithm
END FUNCTION