# Primary Project Plan-- Simplicity-First Pipeline

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Scoped

---

## 1. Project Overview

This document outlines the primary project plan for implementing the "Simplicity-First" pipeline enhancements. The plan is derived from the detailed specifications in [`llm_client_concurrency_specs.md`](docs/specifications/simple_pipeline_v1/llm_client_concurrency_specs.md) and [`job_batching_specs.md`](docs/specifications/simple_pipeline_v1/job_batching_specs.md).

The project is divided into two sprints, each targeting a distinct performance enhancement. The core principle is to deliver incremental, verifiable improvements to the system's throughput and efficiency.

---

## 2. High-Level Acceptance Tests

The ultimate success of this project is defined by the following high-level outcomes--

1.  **Concurrency Throughput--** The system can successfully process at least four simultaneous LLM requests without deadlocks or errors, demonstrating a significant improvement in throughput.
2.  **Job Queue Reduction--** For any given file processed, the number of jobs created for relationship resolution is exactly one, regardless of the number of Points of Interest (POIs) found within that file.

---

## Sprint 1-- LLM Client Concurrency Enhancement

**Goal--** To replace the basic request queue in `deepseekClient.js` with a robust, semaphore-based concurrency manager to increase API call throughput.

**AI-Verifiable Sprint End Result--** All development tasks are complete, and all specified unit tests for the `Semaphore` and `DeepSeekClient` classes pass successfully, demonstrating that the client can handle up to the configured number of concurrent requests.

### Phase 0: Semaphore Prototyping (Spike)

**Goal:** To build and rigorously test a standalone prototype of the `Semaphore` class to ensure its stability and correctness before full integration. This addresses the risks of subtle concurrency bugs identified in the critique report.

**AI-Verifiable Phase End Result:** A stable, well-tested `Semaphore` class prototype exists and is ready for integration into the `DeepSeekClient`. The prototype has passed a suite of stress tests designed to identify race conditions and edge-case behaviors.

-- **Task** -- **File(s) to Create** -- **AI-Verifiable Task End Result** --
-- --- -- --- -- --- --
-- **Task 0.1: Build Standalone Semaphore Prototype** -- `prototypes/semaphore_spike.js` (New File) -- The file `prototypes/semaphore_spike.js` exists and contains a functional `Semaphore` class that can be tested independently. --
-- **Task 0.2: Implement Rigorous Semaphore Stress Tests** -- `tests/prototypes/semaphore_spike.test.js` (New File) -- The test file exists and contains a comprehensive suite of tests that simulate high-concurrency scenarios, random acquisition/release patterns, and potential timeout conditions to validate the prototype's robustness. --

### Phase 1: Core Development

**AI-Verifiable Phase End Result--** The `Semaphore` class is implemented, and the `DeepSeekClient` class is refactored to use it, with all specified methods and properties created or modified.

-- **Task** -- **File(s) to Modify/Create** -- **AI-Verifiable Task End Result** --
-- --- -- --- -- --- --
-- **Task 1.1: Create Semaphore Utility** -- `src/utils/semaphore.js` (New File) -- The file `src/utils/semaphore.js` exists and contains a `Semaphore` class with a `constructor`, `acquire`, and `release` method as defined in the specification. --
-- **Task 1.2: Refactor DeepSeekClient** -- `src/utils/deepseekClient.js` -- The `DeepSeekClient` class is modified to remove `activeRequests` and `requestQueue`, add a `semaphore` property, and refactor the `constructor` and `createChatCompletion` methods to use the new semaphore logic. The `_scheduleRequest` and `_processQueue` methods are removed. --

### Phase 2: Unit Testing

**AI-Verifiable Phase End Result--** All unit tests defined in the TDD anchors of the `llm_client_concurrency_specs.md` document are implemented and pass successfully.

-- **Task** -- **File(s) to Create** -- **AI-Verifiable Task End Result** --
-- --- -- --- -- --- --
-- **Task 2.1: Write Semaphore Tests** -- `tests/functional/utils/semaphore.test.js` (New File) -- The test file exists and contains passing tests that verify a) acquiring up to the initial count, b) waiting on the (N+1)th acquire, and c) successful release and subsequent acquire. --
-- **Task 2.2: Write DeepSeekClient Tests** -- `tests/functional/utils/deepseekClient.concurrency.test.js` (New File) -- The test file exists and contains passing tests that verify a) the semaphore is initialized correctly, b) `createChatCompletion` acquires and releases the semaphore, c) requests wait when the concurrency limit is hit, and d) the semaphore is released even if a request fails. --

---

## Sprint 2-- Relationship Resolution Job Batching

**Goal--** To refactor the `TransactionalOutboxPublisher` to batch all POIs from a single file analysis into one job, reducing queue congestion.

**AI-Verifiable Sprint End Result--** All development tasks are complete, and all specified unit tests for the `TransactionalOutboxPublisher` and `relationshipResolutionWorker` pass, demonstrating that multiple POIs are processed within a single job.

### Phase 2.1-- Core Development

**AI-Verifiable Phase End Result--** The `TransactionalOutboxPublisher` is refactored to create batched jobs, and the `relationshipResolutionWorker` is refactored to process them.

-- **Task** -- **File(s) to Modify** -- **AI-Verifiable Task End Result** --
-- --- -- --- -- --- --
-- **Task 2.1.1-- Implement Job Batching Logic** -- `src/services/TransactionalOutboxPublisher.js` -- The `publishPoisForAnalysis` method is refactored to accept an array of POIs and create a single job payload containing the entire array, as specified in the `job_batching_specs.md`. --
-- **Task 2.1.2-- Update Worker to Handle Batches** -- `src/workers/relationshipResolutionWorker.js` -- The `processJob` function is refactored to parse the batched job payload, loop through the `pois` array, and process each POI individually, including the specified error handling logic. --

### Phase 2.2-- Unit Testing

**AI-Verifiable Phase End Result--** All unit tests defined in the TDD anchors of the `job_batching_specs.md` document are implemented and pass successfully.

-- **Task** -- **File(s) to Create** -- **AI-Verifiable Task End Result** --
-- --- -- --- -- --- --
-- **Task 2.2.1-- Write Publisher Tests** -- `tests/functional/services/transactionalOutboxPublisher.batching.test.js` (New File) -- The test file exists and contains passing tests that verify a) a single outbox entry is created for multiple POIs, b) the payload contains all original POIs, and c) no entry is created for an empty POI list. --
-- **Task 2.2.2-- Write Worker Tests** -- `tests/functional/workers/relationshipResolutionWorker.batching.test.js` (New File) -- The test file exists and contains passing tests that verify a) the resolver is called for every POI in a batch, b) processing continues if one POI fails, and c) jobs with empty POI arrays are handled gracefully. --

---
**End of Plan**