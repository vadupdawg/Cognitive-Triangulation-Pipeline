# Pseudocode: DirectoryResolutionWorker (v2 - Dynamic Manifest)

## Class: DirectoryResolutionWorker

**Purpose:** To analyze a directory, identify its contents (files and subdirectories), and create the next level of analysis jobs. It also identifies potential relationships between directory-level entities and dynamically updates the run manifest.

### Properties
- `cache`: CacheClient - An instance for interacting with the Redis cache.
- `logger`: Logger - For logging information and errors.
- `queueManager`: QueueManager - An instance for interacting with the job queue.
- `llmClient`: LLMClient - A client for making calls to a Large Language Model.

### Constructor
- `new()`
  - Initializes `cache`, `logger`, `queueManager`, and `llmClient`.

### Main Method: `process(job)`
- `FUNCTION process(job)`
  - `INPUT`: `job` (OBJECT) containing `runId`, `jobId`, `path`.
  - `logger.info("DirectoryResolutionWorker processing job {job.jobId} for path {job.path}")`
  - `TRY`
    - `// 1. Enqueue analysis jobs for child items`
    - `childItems = SCAN_FILESYSTEM(job.path)`
    - `_enqueueChildJobs(job.runId, childItems)`
    - `// 2. Analyze directory for higher-level relationships (e.g., module imports)`
    - `analysisResult = _analyzeDirectory(job.path, childItems)`
    - `// 3. Process findings and update manifest`
    - `_processAnalysisFindings(job.runId, job.jobId, analysisResult.findings)`
    - `logger.info("Finished processing directory {job.path}")`
    - `RETURN { success: TRUE }`
  - `CATCH error`
    - `logger.error("Error in DirectoryResolutionWorker for job {job.jobId}: {error}")`
    - `RETURN { success: FALSE, error: error }`
  - `END TRY`
- `END FUNCTION`

### Private Method: `_enqueueChildJobs(runId, childItems)`
- `FUNCTION _enqueueChildJobs(runId, childItems)`
  - `INPUT`: `runId` (STRING), `childItems` (ARRAY of OBJECTS)
  - `FOR each item in childItems`
    - `IF item.type is 'file'`
      - `jobData = { runId: runId, filePath: item.path }`
      - `queueManager.addJob('file-analysis', jobData)`
    - `ELSE IF item.type is 'directory'`
      - `jobData = { runId: runId, path: item.path }`
      - `queueManager.addJob('directory-analysis', jobData)`
    - `END IF`
  - `END FOR`
- `END FUNCTION`
- **TDD Anchor:** TEST `_enqueueChildJobs` correctly creates file and directory jobs for all child items.

### Private Method: `_analyzeDirectory(path, childItems)`
- `FUNCTION _analyzeDirectory(path, childItems)`
  - `INPUT`: `path` (STRING), `childItems` (ARRAY)
  - `OUTPUT`: `analysisResult` (OBJECT)
  - `// This function would use an LLM to find relationships at a directory level,`
  - `// such as how `index.js` might export modules from other files in the same directory.`
  - `prompt = CREATE_DIRECTORY_LLM_PROMPT(path, childItems)`
  - `rawResponse = llmClient.generate(prompt)`
  - `sanitizedResponse = SANITIZE_LLM_RESPONSE(rawResponse)`
  - `RETURN sanitizedResponse`
- `END FUNCTION`

### Private Method: `_processAnalysisFindings(runId, sourceJobId, findings)`
- `FUNCTION _processAnalysisFindings(runId, sourceJobId, findings)`
  - `INPUT`: `runId` (STRING), `sourceJobId` (STRING), `findings` (ARRAY of OBJECTS)
  - `manifestKey = "manifest:" + runId`
  - `FOR each finding in findings`
    - `targetJobId = _getJobIdForEntity(finding.entityB)`
    - `involvedJobIds = [sourceJobId, targetJobId]`
    - `relationshipHash = CREATE_RELATIONSHIP_HASH(finding.entityA, finding.entityB, finding.relationship)`
    - `// Atomically add the new relationship to the manifest's map`
    - `_updateManifestRelationshipMap(manifestKey, relationshipHash, involvedJobIds)`
    - `// Emit the finding for the ValidationCoordinator`
    - `EMIT_EVENT('analysis-finding', { runId: runId, jobId: sourceJobId, finding: { ...finding, relationshipHash: relationshipHash } })`
  - `END FOR`
- `END FUNCTION`

### Private Method: `_getJobIdForEntity(entity)`
- `FUNCTION _getJobIdForEntity(entity)`
  - `// Placeholder function, same as in FileAnalysisWorker`
  - `RETURN "job-for-" + entity.filePath`
- `END FUNCTION`

### Private Method: `_updateManifestRelationshipMap(manifestKey, hash, jobIds)`
- `FUNCTION _updateManifestRelationshipMap(manifestKey, hash, jobIds)`
  - `INPUT`: `manifestKey` (STRING), `hash` (STRING), `jobIds` (ARRAY of STRINGS)
  - `logger.info("Atomically updating manifest for relationship {hash}")`
  - `serializedJobIds = SERIALIZE_JSON(jobIds)`
  - `// Use an atomic operation to prevent race conditions`
  - `cache.HSETNX("relationshipEvidenceMap", hash, serializedJobIds)`
- `END FUNCTION`
- **TDD Anchor:** TEST `_updateManifestRelationshipMap` correctly uses an atomic cache operation to add a new relationship hash and its associated job IDs to the manifest.
