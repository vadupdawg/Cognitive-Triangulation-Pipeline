# Pseudocode-- EntityScout Agent (v2)

This document outlines the detailed, language-agnostic pseudocode for the `EntityScout_v2` class, which is responsible for initiating and orchestrating the Cognitive Triangulation v2 analysis process.

## 1. External Services & Contracts

- **HashingService**: An external, statically-available service that implements the hashing logic defined in `docs/specifications/cognitive_triangulation/hashing_contracts.md`. It provides `createRelationshipHash(poi1, poi2, type)`.

## 2. Helper Functions

### FUNCTION `generateJobId(type, identifier)`
  INPUT-- type (String, e.g., "file", "dir"), identifier (String, e.g., filePath)
  OUTPUT-- A unique string for the job ID.
  
  -- TEST-- `generateJobId` should produce a consistent and unique ID for the same input.
  
  RETURN "job--" + type + "--" + HASH(identifier)
ENDFUNCTION

### FUNCTION `extractPreliminaryPois(filePath)`
  INPUT-- filePath (String)
  OUTPUT-- Array of Preliminary POI objects.

  -- This function performs a lightweight, non-comprehensive scan of a file
  -- to identify potential Points of Interest (POIs). It does NOT perform a
  -- full AST parse or deep semantic analysis. It uses simple patterns
  -- (like regex) to find named entities like functions, classes, or variables.

  -- TEST-- `extractPreliminaryPois` should identify function and class names from a code string.
  -- TEST-- `extractPreliminaryPois` should return an empty array for a file with no identifiable entities.
  -- TEST-- `extractPreliminaryPois` should associate each POI with the correct file path.

  fileContent = Filesystem.readFile(filePath)
  foundPois = []

  -- Example for finding function definitions like "function myFunction(...)"
  functionMatches = findall(/function\s+(\w+)/, fileContent)
  FOR each match in functionMatches
    poi = {
      name-- match[1], -- The captured group (the function name)
      type-- "Function", -- A preliminary type
      filePath-- filePath,
      -- Other lightweight metadata could be added here, e.g., line number
      startLine-- getLineNumber(match)
    }
    foundPois.push(poi)
  ENDFOR

  -- Example for finding class definitions like "class MyClass {...}"
  classMatches = findall(/class\s+(\w+)/, fileContent)
  FOR each match in classMatches
     poi = {
      name-- match[1], -- The captured group (the class name)
      type-- "Class", -- A preliminary type
      filePath-- filePath,
      startLine-- getLineNumber(match)
    }
    foundPois.push(poi)
  ENDFOR
  
  -- More patterns for other languages or entity types would be added here.

  RETURN foundPois
ENDFUNCTION

## 3. Class-- EntityScout_v2

### ATTRIBUTES
  - cacheClient-- An instance of a client for a persistent cache (e.g., Redis).
  - queueManager-- An object capable of enqueuing jobs into different queues.
  - logger-- A logging utility.

### `constructor(cacheClient, queueManager, logger)`
  INPUT-- cacheClient, queueManager, logger
  
  -- TEST-- The constructor should correctly assign dependencies to instance variables.
  
  this.cache = cacheClient
  this.queues = queueManager
  this.logger = logger
END CONSTRUCTOR

---

### METHOD `run(rootPath, runId)`
  INPUT-- rootPath (String), runId (String)
  OUTPUT-- None (asynchronous side effects)
  
  -- TEST-- `run` should handle cases where `rootPath` is invalid or no files are found.
  -- TEST-- `run` should successfully orchestrate the file scanning, manifest generation, caching, and job enqueuing steps.
  
  this.logger.info("EntityScout v2 run initiated for runId-- " + runId)
  
  TRY
    -- 1. Scan for files
    allFilePaths = Filesystem.recursivelyFindFiles(rootPath)
    
    IF allFilePaths is empty THEN
      this.logger.warn("No files found to analyze in path-- " + rootPath)
      RETURN
    ENDIF
    
    -- 2. Generate the manifest
    -- This is the core orchestration logic, now based on preliminary POI scanning.
    manifest = this.generateManifest(runId, allFilePaths)
    
    -- 3. Save the manifest to the cache
    -- TEST-- 'EntityScout v2 should save the manifest to the persistent cache'
    manifestKey = "manifest--" + runId
    manifestJSON = JSON.stringify(manifest)
    this.cache.set(manifestKey, manifestJSON)
    this.logger.info("Run manifest saved to cache with key-- " + manifestKey)
    
    -- 4. Enqueue all jobs defined in the manifest
    -- TEST-- 'EntityScout v2 should enqueue all jobs defined in the manifest'
    this.queues.enqueueBulk([
      ...manifest.jobs.fileAnalysis,
      ...manifest.jobs.directoryResolution,
      ...manifest.jobs.globalResolution
    ])
    this.logger.info("All analysis and resolution jobs have been enqueued for runId-- " + runId)
    
  CATCH error
    this.logger.error("EntityScout v2 run failed for runId-- " + runId, error)
    -- Optionally, re-throw the error to be handled by a higher-level process
    THROW error
  ENDTRY
  
END METHOD

---

### METHOD `generateManifest(runId, filePaths)`
  INPUT-- runId (String), filePaths (Array of Strings)
  OUTPUT-- A Manifest object.
  
  -- TEST-- 'generateManifest should produce a manifest with POI-level relationship hashes'
  -- TEST-- 'The relationshipEvidenceMap should correctly map a specific POI-to-POI relationship hash to its expected job IDs'
  -- TEST-- 'generateManifest should handle files with no preliminary POIs gracefully'

  -- Initialization
  fileJobs = []
  dirJobs = []
  globalJob = NULL
  relationshipEvidenceMap = {}
  filesByDir = {}
  dirJobIdMap = {}
  fileJobIdMap = {}
  preliminaryPoisByFile = {}

  -- Step 1-- Group files by directory and create file-level jobs
  FOR each filePath in filePaths
    jobId = generateJobId("file", filePath)
    fileJobIdMap[filePath] = jobId
    
    fileJob = {
      queueName-- "analyze-file",
      jobId-- jobId,
      data-- { runId-- runId, filePath-- filePath }
    }
    fileJobs.push(fileJob)
    
    dirPath = getDirectory(filePath)
    IF filesByDir[dirPath] does not exist THEN
      filesByDir[dirPath] = []
    ENDIF
    filesByDir[dirPath].push(filePath)
  ENDFOR
  
  -- Step 2-- Create directory-level and global jobs
  FOR each dirPath in keys(filesByDir)
    jobId = generateJobId("dir", dirPath)
    dirJobIdMap[dirPath] = jobId
    
    dirJob = {
      queueName-- "resolve-directory",
      jobId-- jobId,
      data-- { runId-- runId, dirPath-- dirPath, filePaths-- filesByDir[dirPath] }
    }
    dirJobs.push(dirJob)
  ENDFOR
  
  globalJobId = generateJobId("global", runId)
  globalJob = {
    queueName-- "resolve-global",
    jobId-- globalJobId,
    data-- { runId-- runId, allFilePaths-- filePaths }
  }

  -- Step 3-- Perform preliminary POI extraction for all files
  -- TEST-- 'The scout should extract preliminary POIs from files before generating relationship hashes'
  FOR each filePath in filePaths
    -- This is a lightweight scan, not a full analysis.
    preliminaryPoisByFile[filePath] = extractPreliminaryPois(filePath)
  ENDFOR

  -- Step 4-- Generate potential relationships between POIs and map them to relevant jobs
  -- TEST-- 'A relationship between POIs in two different files should map to 2 file jobs, 2 dir jobs (if different), and 1 global job'
  -- TEST-- 'An intra-file relationship should map to 1 file job, 1 dir job, and 1 global job'
  FOR i from 0 to length(filePaths) - 1
    sourceFilePath = filePaths[i]
    sourcePois = preliminaryPoisByFile[sourceFilePath]
    IF sourcePois is empty THEN CONTINUE

    FOR j from i to length(filePaths) - 1
      targetFilePath = filePaths[j]
      targetPois = preliminaryPoisByFile[targetFilePath]
      IF targetPois is empty THEN CONTINUE

      FOR each sourcePoi in sourcePois
        FOR each targetPoi in targetPois
          -- For intra-file checks, avoid comparing a POI with itself.
          IF sourceFilePath == targetFilePath AND sourcePoi is the same as targetPoi THEN
            CONTINUE
          ENDIF
          
          -- Assume a generic relationship type for this preliminary scan.
          -- The actual relationship type will be determined by the analysis workers.
          RELATIONSHIP_TYPE_POTENTIAL = "potential_dependency"

          -- Use the official hashing service as defined in the system contracts.
          relationshipHash = HashingService.createRelationshipHash(sourcePoi, targetPoi, RELATIONSHIP_TYPE_POTENTIAL)

          -- This array lists every job that MUST provide an opinion on this relationship
          expectedEvidenceProviders = []
          
          -- Add file-level jobs
          expectedEvidenceProviders.push(fileJobIdMap[sourceFilePath])
          IF sourceFilePath != targetFilePath THEN
            expectedEvidenceProviders.push(fileJobIdMap[targetFilePath])
          ENDIF
          
          -- Add directory-level jobs
          sourceDirPath = getDirectory(sourceFilePath)
          targetDirPath = getDirectory(targetFilePath)
          expectedEvidenceProviders.push(dirJobIdMap[sourceDirPath])
          IF sourceDirPath != targetDirPath THEN
            expectedEvidenceProviders.push(dirJobIdMap[targetDirPath])
          ENDIF
          
          -- Add the global job
          expectedEvidenceProviders.push(globalJobId)
          
          -- Assign the unique list of providers to the map
          relationshipEvidenceMap[relationshipHash] = UNIQUE(expectedEvidenceProviders)
        ENDFOR
      ENDFOR
    ENDFOR
  ENDFOR

  -- Step 5-- Assemble the final manifest object
  manifest = {
    runId-- runId,
    jobs-- {
      fileAnalysis-- fileJobs,
      directoryResolution-- dirJobs,
      globalResolution-- [globalJob]
    },
    jobGraph-- {
      "analyze-file"-- fileJobs.map(j -> j.jobId),
      "resolve-directory"-- dirJobs.map(j -> j.jobId),
      "resolve-global"-- [globalJobId]
    },
    relationshipEvidenceMap-- relationshipEvidenceMap
  }
  
  RETURN manifest
END METHOD