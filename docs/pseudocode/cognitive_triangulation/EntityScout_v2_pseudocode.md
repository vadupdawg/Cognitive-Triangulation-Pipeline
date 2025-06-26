# Pseudocode-- EntityScout Agent (v2)

This document provides the detailed, language-agnostic pseudocode for the `EntityScout` v2 agent. It serves as a logical blueprint for implementation, focusing on the creation of the `runManifest` and the orchestration of analysis jobs.

## 1. Overview

**Purpose**: To initialize a code analysis run by scanning a directory, generating a comprehensive `runManifest` that defines all jobs and potential relationships, and enqueuing the initial analysis tasks.

## 2. Dependencies

-- **Service** -- **Purpose**
-- --- -- ---
-- `FileSystem` -- To recursively scan directories and read files.
-- `QueueService` -- To enqueue jobs for worker agents (e.g., BullMQ).
-- `CacheService` -- To store the generated `runManifest` (e.g., Redis).
-- `Logger` -- For structured, asynchronous logging.
-- `HashingService` -- To create deterministic hashes for relationships based on file paths.

## 3. Class-- EntityScout

```pseudocode
CLASS EntityScout

    // --- Properties ---
    PRIVATE fileSystem
    PRIVATE queueService
    PRIVATE cacheService
    PRIVATE logger
    PRIVATE hashingService

    // --- Constructor ---
    FUNCTION constructor(fs, queue, cache, logger, hasher)
        // TEST--Constructor should correctly assign all dependency services.
        this.fileSystem = fs
        this.queueService = queue
        this.cacheService = cache
        this.logger = logger
        this.hashingService = hasher
    END FUNCTION

    // --- Main Public Method ---
    // The primary entry point for starting an analysis run.
    PUBLIC ASYNC FUNCTION run(rootPath, runId)
        // INPUT-- rootPath (String), runId (String)
        // OUTPUT-- Promise<void>
        // TEST run--Should throw an error if rootPath is invalid or not accessible.
        // TEST run--Should throw an error if runId is null or empty.

        this.logger.info(`Starting EntityScout run ${runId} for path ${rootPath}`)

        TRY
            // 1. Discover all files and group them by their parent directory.
            // TEST _scanAndGroupFiles--Handles deeply nested directories.
            // TEST _scanAndGroupFiles--Handles directories with no files.
            // TEST _scanAndGroupFiles--Ignores specified file types or directories.
            allFilesByDirectory = this._scanAndGroupFiles(rootPath)

            // 2. Generate the run manifest, which is the master plan for the analysis.
            runManifest = this._generateManifest(runId, allFilesByDirectory)
            // TEST _generateManifest--Ensures manifest is correctly structured with all required fields.

            // 3. Persist the manifest to the cache for the ValidationCoordinator.
            manifestKey = `manifest:${runId}`
            AWAIT this.cacheService.set(manifestKey, runManifest)
            // TEST cacheService--Ensures manifest is saved correctly and can be retrieved.
            this.logger.info(`Run manifest for ${runId} saved to cache key ${manifestKey}`)

            // 4. Create and enqueue all jobs defined in the manifest.
            AWAIT this._enqueueJobs(runManifest, allFilesByDirectory)
            // TEST _enqueueJobs--Verifies that all jobs in the manifest's jobGraph are enqueued.

            this.logger.info(`Successfully enqueued all initial jobs for run ${runId}`)

        CATCH error
            this.logger.error(`EntityScout run ${runId} failed-- ${error.message}`)
            // TEST run--Failure at any step should be caught, logged, and should not leave partial state.
            // Re-throw the error to be handled by the caller.
            THROW error
        END TRY
    END FUNCTION

    // --- Helper Method-- File Scanning ---
    PRIVATE FUNCTION _scanAndGroupFiles(rootPath)
        // INPUT-- rootPath (String)
        // OUTPUT-- Map<String, List<String>> where key is directory path and value is a list of file paths.
        
        filesByDirectory = new Map()
        allFiles = this.fileSystem.recursiveFind(rootPath, { filter-- "*.js,*.py,*.java" }) // Example filter

        FOR EACH filePath IN allFiles
            directoryPath = this.fileSystem.getParentDirectory(filePath)
            IF NOT filesByDirectory.has(directoryPath)
                filesByDirectory.set(directoryPath, [])
            END IF
            filesByDirectory.get(directoryPath).push(filePath)
        END FOR

        RETURN filesByDirectory
    END FUNCTION

    // --- Helper Method-- Manifest Generation ---
    PRIVATE FUNCTION _generateManifest(runId, filesByDirectory)
        // INPUT-- runId (String), filesByDirectory (Map)
        // OUTPUT-- A structured runManifest object.

        manifest = {
            runId-- runId,
            jobGraph-- {
                "analyze-file"-- [],
                "resolve-directory"-- [],
                "resolve-global"-- []
            },
            relationshipEvidenceMap-- {}
        }

        allFilePaths = []
        
        // 1. Create job IDs for File Analysis and Directory Resolution jobs.
        // TEST--Ensures a unique job ID is created for every file and directory.
        fileJobs = new Map() // Maps filePath to jobId
        FOR EACH directoryPath, files IN filesByDirectory
            // Create Directory Resolution Job
            dirJobId = `resolve-directory:${runId}:${this.hashingService.hash(directoryPath)}`
            manifest.jobGraph["resolve-directory"].push(dirJobId)

            FOR EACH filePath IN files
                // Create File Analysis Job
                fileJobId = `analyze-file:${runId}:${this.hashingService.hash(filePath)}`
                manifest.jobGraph["analyze-file"].push(fileJobId)
                fileJobs.set(filePath, fileJobId)
                allFilePaths.push(filePath)
            END FOR
        END FOR

        // 2. Create the single Global Resolution job.
        globalJobId = `resolve-global:${runId}`
        manifest.jobGraph["resolve-global"].push(globalJobId)
        // TEST--Ensures exactly one global resolution job is created per run.

        // 3. Pre-calculate all potential relationships and map them to the jobs that will provide evidence.
        // This is the core of the evidence contract.
        // TEST--Relationship hash calculation is consistent and order-invariant.
        // TEST--Evidence map correctly includes all relevant job IDs for a given relationship.
        FOR i FROM 0 TO allFilePaths.length - 1
            filePath1 = allFilePaths[i]
            jobId1 = fileJobs.get(filePath1)
            dir1 = this.fileSystem.getParentDirectory(filePath1)
            // Find dir1's job ID from the manifest
            dirJobId1 = manifest.jobGraph["resolve-directory"].find(id => id.includes(this.hashingService.hash(dir1)))


            // Intra-file relationships (a file with itself)
            relationshipHash = this.hashingService.createRelationshipHash(filePath1, filePath1)
            IF NOT manifest.relationshipEvidenceMap[relationshipHash]
                manifest.relationshipEvidenceMap[relationshipHash] = []
            END IF
            manifest.relationshipEvidenceMap[relationshipHash].push(jobId1, dirJobId1, globalJobId)

            // Inter-file (cross-file) relationships
            FOR j FROM i + 1 TO allFilePaths.length - 1
                filePath2 = allFilePaths[j]
                jobId2 = fileJobs.get(filePath2)
                dir2 = this.fileSystem.getParentDirectory(filePath2)
                dirJobId2 = manifest.jobGraph["resolve-directory"].find(id => id.includes(this.hashingService.hash(dir2)))

                relationshipHash = this.hashingService.createRelationshipHash(filePath1, filePath2)
                IF NOT manifest.relationshipEvidenceMap[relationshipHash]
                    manifest.relationshipEvidenceMap[relationshipHash] = []
                END IF

                // Add file analysis jobs
                manifest.relationshipEvidenceMap[relationshipHash].push(jobId1, jobId2)
                
                // Add directory resolution jobs (avoid duplicates if in same dir)
                IF dirJobId1 IS NOT NULL AND NOT manifest.relationshipEvidenceMap[relationshipHash].includes(dirJobId1)
                    manifest.relationshipEvidenceMap[relationshipHash].push(dirJobId1)
                END IF
                IF dirJobId2 IS NOT NULL AND dirJobId1 != dirJobId2 AND NOT manifest.relationshipEvidenceMap[relationshipHash].includes(dirJobId2)
                     manifest.relationshipEvidenceMap[relationshipHash].push(dirJobId2)
                END IF

                // Add the global resolution job
                manifest.relationshipEvidenceMap[relationshipHash].push(globalJobId)
            END FOR
        END FOR
        
        // De-duplicate evidence lists
        FOR EACH key IN manifest.relationshipEvidenceMap
             manifest.relationshipEvidenceMap[key] = UNIQUE(manifest.relationshipEvidenceMap[key])
        END FOR

        RETURN manifest
    END FUNCTION

    // --- Helper Method-- Job Enqueueing ---
    PRIVATE ASYNC FUNCTION _enqueueJobs(runManifest, filesByDirectory)
        // INPUT-- runManifest (Object), filesByDirectory (Map)
        // OUTPUT-- Promise<void>
        
        // Enqueue File Analysis Jobs
        // TEST--Ensures job data payload is correct for file analysis workers.
        FOR EACH jobId IN runManifest.jobGraph["analyze-file"]
            // Extract filePath from jobId or have a map from generation step
            filePath = this._getFilePathFromJobId(jobId) // Assumes a reverse lookup mechanism
            jobData = { runId-- runManifest.runId, filePath-- filePath }
            AWAIT this.queueService.add("analyze-file", jobData, { jobId-- jobId })
        END FOR

        // Enqueue Directory Resolution Jobs
        // TEST--Ensures job data payload is correct for directory resolution workers.
        FOR EACH jobId IN runManifest.jobGraph["resolve-directory"]
            directoryPath = this._getDirectoryPathFromJobId(jobId) // Assumes reverse lookup
            containedFiles = filesByDirectory.get(directoryPath)
            jobData = { runId-- runManifest.runId, directoryPath-- directoryPath, files-- containedFiles }
            AWAIT this.queueService.add("resolve-directory", jobData, { jobId-- jobId })
        END FOR

        // Enqueue Global Resolution Job
        // TEST--Ensures job data payload is correct for the global resolution worker.
        jobId = runManifest.jobGraph["resolve-global"][0]
        allFiles = filesByDirectory.values().flatten()
        jobData = { runId-- runManifest.runId, allFiles-- allFiles }
        AWAIT this.queueService.add("resolve-global", jobData, { jobId-- jobId })
    END FUNCTION

END CLASS