# Pseudocode: EntityScout (v2 - Dynamic Manifest)

## Class: EntityScout

**Purpose:** To scan the target directory, identify files and subdirectories, and create initial analysis jobs. This version implements a two-phase dynamic manifest system for improved scalability.

### Properties
- `runId`: STRING - A unique identifier for the current analysis run.
- `config`: OBJECT - Configuration settings for the scan.
- `queueManager`: QueueManager - An instance for interacting with the job queue.
- `cache`: CacheClient - An instance for interacting with the Redis cache.
- `logger`: Logger - For logging information and errors.
- `jobIdCounter`: INTEGER - A counter to generate unique job IDs.

### Constructor
- `new(runId, config)`
  - Initializes `runId` and `config`.
  - Initializes `queueManager`, `cache`, and `logger`.
  - Initializes `jobIdCounter` to 0.

### Main Method: `start()`
- `FUNCTION start()`
  - `logger.info("EntityScout starting for runId: {runId}")`
  - `TRY`
    - `targetPath = config.targetPath`
    - `jobGraph = _createJobGraph(targetPath)`
    - `manifest = _generateManifest(jobGraph)`
    - `_saveManifestToCache(manifest)`
    - `_enqueueInitialJobs(jobGraph.directoryJobs)`
    - `_enqueueGlobalResolutionJob(jobGraph.globalJob)`
    - `logger.info("EntityScout finished job creation.")`
  - `CATCH error`
    - `logger.error("Error during EntityScout execution: {error}")`
  - `END TRY`
- `END FUNCTION`

### Private Method: `_createJobGraph(rootPath)`
- `FUNCTION _createJobGraph(rootPath)`
  - `INPUT`: `rootPath` (STRING)
  - `OUTPUT`: `jobGraph` (OBJECT)
  - `fileJobs = []`
  - `directoryJobs = []`
  - `// Recursively scan directories and files`
  - `items = SCAN_FILESYSTEM(rootPath)`
  - `FOR each item in items`
    - `jobId = "job-" + INCREMENT(jobIdCounter)`
    - `IF item is a DIRECTORY`
      - `dirJob = { jobId: jobId, path: item.path, type: 'directory' }`
      - `ADD dirJob to directoryJobs`
    - `ELSE IF item is a FILE`
      - `fileJob = { jobId: jobId, path: item.path, type: 'file' }`
      - `ADD fileJob to fileJobs`
    - `END IF`
  - `END FOR`
  - `globalJobId = "job-" + INCREMENT(jobIdCounter)`
  - `globalJob = { jobId: globalJobId, type: 'global' }`
  - `RETURN { fileJobs: fileJobs, directoryJobs: directoryJobs, globalJob: globalJob }`
- `END FUNCTION`
- **TDD Anchor:** TEST `_createJobGraph` correctly identifies all files and directories and assigns unique job IDs.

### Private Method: `_generateManifest(jobGraph)`
- `FUNCTION _generateManifest(jobGraph)`
  - `INPUT`: `jobGraph` (OBJECT)
  - `OUTPUT`: `manifest` (OBJECT)
  - `logger.info("Generating Phase 1 manifest for runId: {runId}")`
  - `// Phase 1: Create a simple manifest with only the job graph.`
  - `// The relationshipEvidenceMap will be populated dynamically by workers.`
  - `manifest = {`
    - `runId: this.runId,`
    - `jobGraph: {`
      - `files: jobGraph.fileJobs.map(j -> j.jobId),`
      - `directories: jobGraph.directoryJobs.map(j -> j.jobId),`
      - `global: jobGraph.globalJob.jobId`
    - `},`
    - `relationshipEvidenceMap: {} // Initialized as empty`
  - `}`
  - `RETURN manifest`
- `END FUNCTION`
- **TDD Anchor:** TEST `_generateManifest` creates a manifest with the correct `runId`, a complete `jobGraph`, and an empty `relationshipEvidenceMap`.

### Private Method: `_saveManifestToCache(manifest)`
- `FUNCTION _saveManifestToCache(manifest)`
  - `INPUT`: `manifest` (OBJECT)
  - `manifestKey = "manifest:" + this.runId`
  - `serializedManifest = SERIALIZE_JSON(manifest)`
  - `cache.SET(manifestKey, serializedManifest)`
  - `logger.info("Manifest saved to cache with key: {manifestKey}")`
- `END FUNCTION`
- **TDD Anchor:** TEST `_saveManifestToCache` correctly serializes and stores the manifest in the cache.

### Private Method: `_enqueueInitialJobs(directoryJobs)`
- `FUNCTION _enqueueInitialJobs(directoryJobs)`
  - `INPUT`: `directoryJobs` (ARRAY of OBJECTS)
  - `FOR each job in directoryJobs`
    - `queueManager.addJob('directory-analysis', job)`
  - `END FOR`
- `END FUNCTION`

### Private Method: `_enqueueGlobalResolutionJob(globalJob)`
- `FUNCTION _enqueueGlobalResolutionJob(globalJob)`
  - `INPUT`: `globalJob` (OBJECT)
  - `queueManager.addJob('global-resolution', { runId: this.runId, jobId: globalJob.jobId })`
- `END FUNCTION`