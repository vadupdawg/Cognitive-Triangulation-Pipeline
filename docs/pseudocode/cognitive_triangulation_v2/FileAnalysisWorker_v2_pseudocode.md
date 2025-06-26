# Pseudocode: FileAnalysisWorker (v2 - Dynamic Manifest)

## Class: FileAnalysisWorker

**Purpose:** To analyze a single file, identify entities (classes, functions, variables), and detect potential relationships with other entities. This version dynamically updates the run manifest with discovered relationship evidence.

### Properties
- `cache`: CacheClient - An instance for interacting with the Redis cache.
- `logger`: Logger - For logging information and errors.
- `llmClient`: LLMClient - A client for making calls to a Large Language Model.

### Constructor
- `new()`
  - Initializes `cache`, `logger`, and `llmClient`.

### Main Method: `process(job)`
- `FUNCTION process(job)`
  - `INPUT`: `job` (OBJECT) containing `runId`, `jobId`, `filePath`.
  - `logger.info("FileAnalysisWorker processing job {job.jobId} for file {job.filePath}")`
  - `TRY`
    - `fileContent = READ_FILE(job.filePath)`
    - `// Use LLM to find entities and potential relationships`
    - `analysisResult = _analyzeFileContent(fileContent, job.filePath)`
    - `// Process findings and update manifest`
    - `_processAnalysisFindings(job.runId, job.jobId, analysisResult.findings)`
    - `logger.info("Finished processing file {job.filePath}")`
    - `RETURN { success: TRUE }`
  - `CATCH error`
    - `logger.error("Error in FileAnalysisWorker for job {job.jobId}: {error}")`
    - `RETURN { success: FALSE, error: error }`
  - `END TRY`
- `END FUNCTION`
- **TDD Anchor:** TEST `process` successfully completes for a valid file analysis job.
- **TDD Anchor:** TEST `process` handles errors gracefully (e.g., file not found).

### Private Method: `_analyzeFileContent(content, filePath)`
- `FUNCTION _analyzeFileContent(content, filePath)`
  - `INPUT`: `content` (STRING), `filePath` (STRING)
  - `OUTPUT`: `analysisResult` (OBJECT)
  - `prompt = CREATE_LLM_PROMPT(content, filePath)`
  - `rawResponse = llmClient.generate(prompt)`
  - `sanitizedResponse = SANITIZE_LLM_RESPONSE(rawResponse)`
  - `RETURN sanitizedResponse`
- `END FUNCTION`
- **TDD Anchor:** TEST `_analyzeFileContent` generates a valid LLM prompt and correctly parses the response.

### Private Method: `_processAnalysisFindings(runId, sourceJobId, findings)`
- `FUNCTION _processAnalysisFindings(runId, sourceJobId, findings)`
  - `INPUT`: `runId` (STRING), `sourceJobId` (STRING), `findings` (ARRAY of OBJECTS)
  - `manifestKey = "manifest:" + runId`
  - `FOR each finding in findings`
    - `// A finding represents a potential relationship between two entities`
    - `// e.g., { entityA: {...}, entityB: {...}, relationship: "CALLS" }`
    - `// Determine the job IDs expected to provide evidence`
    - `targetJobId = _getJobIdForEntity(finding.entityB)`
    - `involvedJobIds = [sourceJobId, targetJobId]`
    - `relationshipHash = CREATE_RELATIONSHIP_HASH(finding.entityA, finding.entityB, finding.relationship)`
    - `// Atomically add the new relationship to the manifest's map`
    - `_updateManifestRelationshipMap(manifestKey, relationshipHash, involvedJobIds)`
    - `// Emit the finding for the ValidationCoordinator`
    - `EMIT_EVENT('analysis-finding', { runId: runId, jobId: sourceJobId, finding: { ...finding, relationshipHash: relationshipHash } })`
  - `END FOR`
- `END FUNCTION`
- **TDD Anchor:** TEST `_processAnalysisFindings` correctly identifies target job IDs and emits findings.

### Private Method: `_getJobIdForEntity(entity)`
- `FUNCTION _getJobIdForEntity(entity)`
  - `INPUT`: `entity` (OBJECT)
  - `OUTPUT`: `jobId` (STRING) or `NULL`
  - `// This is a placeholder for logic that maps an entity to its corresponding job ID.`
  - `// In a real implementation, this might involve another cache lookup or`
  - `// parsing the manifest's jobGraph.`
  - `// For now, assume it can resolve the job ID from the entity's file path.`
  - `RETURN "job-for-" + entity.filePath`
- `END FUNCTION`

### Private Method: `_updateManifestRelationshipMap(manifestKey, hash, jobIds)`
- `FUNCTION _updateManifestRelationshipMap(manifestKey, hash, jobIds)`
  - `INPUT`: `manifestKey` (STRING), `hash` (STRING), `jobIds` (ARRAY of STRINGS)
  - `logger.info("Atomically updating manifest for relationship {hash}")`
  - `// This operation must be atomic to prevent race conditions.`
  - `// HSETNX sets the field in a hash only if the field does not yet exist.`
  - `// It's ideal for this "just-in-time" manifest population.`
  - `serializedJobIds = SERIALIZE_JSON(jobIds)`
  - `cache.HSETNX("relationshipEvidenceMap", hash, serializedJobIds)`
- `END FUNCTION`
- **TDD Anchor:** TEST `_updateManifestRelationshipMap` correctly uses an atomic cache operation (like HSETNX) to add a new relationship hash and its associated job IDs to the manifest.
- **TDD Anchor:** TEST `_updateManifestRelationshipMap` does NOT overwrite an existing relationship hash entry.
