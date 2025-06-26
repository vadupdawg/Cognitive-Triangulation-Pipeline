# Pseudocode: ValidationCoordinator (v2 - Dynamic Manifest)

## Class: ValidationCoordinator

**Purpose:** To listen for analysis findings, validate them against the run manifest, and store confirmed findings. This version is adapted for a dynamic manifest that is updated by workers during the run.

### Properties
- `runId`: STRING - The ID of the analysis run this coordinator is managing.
- `cache`: CacheClient - An instance for interacting with the Redis cache.
- `db`: DatabaseClient - An instance for writing to the persistent database.
- `logger`: Logger - For logging information and errors.
- `manifest`: OBJECT - An in-memory copy of the run manifest.
- `eventListeners`: MAP - A map to manage event listeners.
- `pendingEvidence`: MAP - A map to track received evidence for each relationship hash.

### Constructor
- `new(runId)`
  - Initializes `runId`, `cache`, `db`, and `logger`.
  - Initializes `pendingEvidence` as an empty map.
  - Initializes `eventListeners` as an empty map.

### Main Method: `start()`
- `FUNCTION start()`
  - `logger.info("ValidationCoordinator starting for runId: {runId}")`
  - `TRY`
    - `this.manifest = _loadManifestFromCache()`
    - `_setupEventListeners()`
    - `logger.info("ValidationCoordinator is running and listening for events.")`
  - `CATCH error`
    - `logger.error("Failed to start ValidationCoordinator: {error}")`
  - `END TRY`
- `END FUNCTION`

### Private Method: `_loadManifestFromCache()`
- `FUNCTION _loadManifestFromCache()`
  - `manifestKey = "manifest:" + this.runId`
  - `logger.info("Loading manifest from cache: {manifestKey}")`
  - `serializedManifest = cache.GET(manifestKey)`
  - `IF serializedManifest IS NULL`
    - `THROW new Error("Manifest not found in cache for runId: {this.runId}")`
  - `END IF`
  - `this.manifest = PARSE_JSON(serializedManifest)`
  - `RETURN this.manifest`
- `END FUNCTION`
- **TDD Anchor:** TEST `_loadManifestFromCache` successfully loads and parses a valid manifest from the cache.
- **TDD Anchor:** TEST `_loadManifestFromCache` throws an error if the manifest is not found.

### Private Method: `_setupEventListeners()`
- `FUNCTION _setupEventListeners()`
  - `// Listen for 'analysis-finding' events from workers`
  - `LISTEN_FOR_EVENT('analysis-finding', this.handleAnalysisEvent)`
- `END FUNCTION`

### Event Handler: `handleAnalysisEvent(event)`
- `FUNCTION handleAnalysisEvent(event)`
  - `INPUT`: `event` (OBJECT) containing `runId`, `jobId`, `finding`.
  - `IF event.runId IS NOT this.runId`
    - `RETURN // Ignore events from other runs`
  - `END IF`
  - `relationshipHash = event.finding.relationshipHash`
  - `// CRITICAL: Check if the hash is in the manifest. If not, reload.`
  - `IF this.manifest.relationshipEvidenceMap[relationshipHash] IS UNDEFINED`
    - `logger.info("Relationship hash {relationshipHash} not in local manifest. Reloading from cache.")`
    - `_loadManifestFromCache()`
    - `// TEST TDD Anchor: Ensure coordinator reloads manifest for an unknown hash.`
  - `END IF`
  - `expectedJobs = this.manifest.relationshipEvidenceMap[relationshipHash]`
  - `IF expectedJobs IS UNDEFINED`
    - `logger.warn("Received finding for untracked relationship hash: {relationshipHash}")`
    - `RETURN`
  - `END IF`
  - `// Record the evidence`
  - `IF pendingEvidence[relationshipHash] IS UNDEFINED`
    - `pendingEvidence[relationshipHash] = []`
  - `END IF`
  - `ADD event.finding to pendingEvidence[relationshipHash]`
  - `// Check if all evidence has been received`
  - `IF LENGTH(pendingEvidence[relationshipHash]) IS EQUAL TO LENGTH(expectedJobs)`
    - `_validateAndStoreRelationship(relationshipHash)`
  - `END IF`
- `END FUNCTION`
- **TDD Anchor:** TEST `handleAnalysisEvent` correctly reloads the manifest when a new `relationshipHash` is encountered.
- **TDD Anchor:** TEST `handleAnalysisEvent` correctly aggregates evidence for a known relationship.
- **TDD Anchor:** TEST `handleAnalysisEvent` calls `_validateAndStoreRelationship` when all expected evidence arrives.

### Private Method: `_validateAndStoreRelationship(hash)`
- `FUNCTION _validateAndStoreRelationship(hash)`
  - `INPUT`: `hash` (STRING)
  - `evidence = pendingEvidence[hash]`
  - `// Perform confidence scoring and validation based on all pieces of evidence`
  - `confidenceScore = CALCULATE_CONFIDENCE(evidence)`
  - `IF confidenceScore > SOME_THRESHOLD`
    - `confirmedRelationship = CREATE_CONFIRMED_RELATIONSHIP(evidence)`
    - `db.saveRelationship(confirmedRelationship)`
    - `logger.info("Confirmed and stored relationship for hash: {hash}")`
  - `ELSE`
    - `logger.info("Relationship for hash {hash} did not meet confidence threshold.")`
  - `END IF`
  - `// Clean up memory`
  - `DELETE pendingEvidence[hash]`
- `END FUNCTION`
- **TDD Anchor:** TEST `_validateAndStoreRelationship` saves a high-confidence relationship to the database.
- **TDD Anchor:** TEST `_validateAndStoreRelationship` discards a low-confidence relationship.
