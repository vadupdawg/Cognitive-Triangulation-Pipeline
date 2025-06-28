# Test Plan-- QueueManager and FileDiscoveryBatcher

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Initial Draft
**Author--** Spec-To-TestPlan Converter

## 1. Introduction and Scope

This document outlines the granular testing strategy for the `QueueManager` utility and the `FileDiscoveryBatcher` worker fleet. The tests defined herein are derived directly from the revised architecture document (`QueueManager_and_FileDiscoveryBatcher_Architecture.md`) and are designed to verify the correctness, resilience, and scalability of these critical components.

The scope of this plan covers all functional and non-functional requirements specified in the architecture, including singleton instantiation, connection resilience, Dead-Letter Queue (DLQ) mechanics, fail-fast configuration validation, and the full two-phase data flow of the `FileDiscoveryBatcher`.

These granular tests serve as the foundation for ensuring the system's stability and are a prerequisite for higher-level integration and end-to-end acceptance tests.

### AI Verifiable Goal

The successful creation of this test plan document at `docs/test-plans/sprint_6_queuing/QueueManager_and_FileDiscoveryBatcher_Test_Plan.md` is the AI-verifiable outcome for this task. The subsequent implementation and passing of the tests described within will serve as the AI-verifiable outcome for the development phase.

---

## 2. Test Strategy

### 2.1. Testing Philosophy-- London School of TDD

We will strictly adhere to the **London School of Test-Driven Development (TDD)**, also known as "Interaction-Based Testing" or "Outside-In" TDD.

-   **Focus on Behavior, Not State--** Tests will verify the *observable behavior* of a unit by checking the messages it sends to its collaborators. We will not test the internal state of a unit directly. This ensures that tests are not brittle and that implementation details can be refactored without breaking the test suite.
-   **Mocking Collaborators--** All external dependencies (collaborators) of the Unit Under Test (UUT) will be replaced with mock objects (e.g., using `jest.mock`). This isolates the UUT, allowing for focused, deterministic, and fast-running tests. For example, when testing the `QueueManager`, the `bullmq` and `ioredis` libraries will be mocked. When testing the `FileDiscoveryBatcher`, the `QueueManager` itself will be a mock.

### 2.2. Recursive Testing (Regression Strategy)

A multi-tiered regression strategy will be implemented to provide rapid feedback while ensuring system-wide stability. Tests will be tagged to facilitate selective execution at different stages of the development lifecycle.

-   **Tier 1-- Pre-Commit (`unit`)--**
    -   **Trigger--** Git pre-commit hook.
    -   **Scope--** Executes all tests tagged as `unit` for the modules that have been changed.
    -   **Goal--** Provide immediate feedback to the developer and prevent broken code from entering the repository. These tests must be extremely fast.

-   **Tier 2-- Pull Request (`integration`)--**
    -   **Trigger--** Creating or updating a pull request.
    -   **Scope--** Executes all `unit` and `integration` tests for the entire project.
    -   **Goal--** Verify that changes do not introduce regressions in other parts of the system. This is a crucial quality gate before merging to the main branch.

-   **Tier 3-- Post-Merge/Nightly (`e2e`)--**
    -   **Trigger--** Merging to the main branch or a nightly schedule.
    -   **Scope--** Executes the full test suite, including end-to-end (E2E) and performance tests.
    -   **Goal--** Validate the health and performance of the fully integrated application in a production-like environment.

---

## 3. Test Environment and Data

-   **Framework--** Jest
-   **Mocking Library--** Jest's built-in mocking capabilities (`jest.mock`, `jest.spyOn`).
-   **Test Data--**
    -   A mock file system structure will be created using a library like `mock-fs` to simulate the `TARGET_DIRECTORY` for the `FileDiscoveryBatcher`.
    -   Sample job payloads, configurations, and error objects will be defined as constants within the test files.

---

## 4. `QueueManager` Test Cases

**UUT--** `QueueManager` Class

### 4.1. Configuration and Instantiation

| Test Case ID | Description | Collaborators to Mock | Interactions to Test | Observable Outcome | Regression Tags |
| --- | --- | --- | --- | --- | --- |
| **QM-001** | **Fail-Fast on Invalid Config--** Should exit the process if configuration is invalid. | `zod` (or schema validator), `process.exit` | 1. The schema validator's `safeParse` method is called with the process environment. <br> 2. `process.exit` is called with a status code of `1`. | The test process confirms that `process.exit` was called. | `unit` |
| **QM-002** | **Singleton Queue Instantiation--** `getQueue` should return the same queue instance for the same name. | `bullmq.Queue` | 1. `new Queue(queueName)` is called only once for the first `getQueue` call. <br> 2. Subsequent calls to `getQueue` with the same name do not trigger the constructor. | The test verifies that the object reference returned by two consecutive calls to `getQueue` is identical. | `unit` |
| **QM-003** | **Standardized Worker Creation--** `createWorker` should instantiate a BullMQ Worker with correct options. | `bullmq.Worker` | 1. `new Worker(queueName, processor, options)` is called. <br> 2. The `options` object passed to the constructor matches the standardized reliability settings. | The test asserts that the mock `Worker` constructor was called with the expected arguments. | `unit` |

### 4.2. Resilience and Error Handling

| Test Case ID | Description | Collaborators to Mock | Interactions to Test | Observable Outcome | Regression Tags |
| --- | --- | --- | --- | --- | --- |
| **QM-004** | **DLQ on Permanent Failure--** Should enqueue an enriched job to the DLQ when a job permanently fails. | `bullmq.Queue` (for both source and DLQ) | 1. A `failed` event listener is attached to the source queue instance. <br> 2. When the listener is invoked with a "permanently failed" error, `getQueue(DLQ_NAME)` is called. <br> 3. `add` is called on the DLQ instance with a new payload. | The test verifies that the `add` method on the mocked DLQ was called with a payload containing the original job data plus `errorStack`, `workerId`, and `timestamp`. | `unit`, `integration` |
| **QM-005** | **Connection Resilience Config--** Should configure the Redis connection with exponential backoff. | `ioredis` | 1. The `ioredis` constructor is called with an options object. | The test asserts that the `retryStrategy` and `maxRetriesPerRequest` options within the connection config match the defined exponential backoff and jitter algorithm. | `unit` |
| **QM-006** | **Circuit Breaker Activation--** Should "trip" the circuit breaker after repeated connection failures. | `ioredis` (or circuit breaker lib) | 1. Simulate N consecutive connection failures. <br> 2. Attempt another connection. | The test verifies that the N+1 connection attempt fails immediately without attempting to connect, and that the circuit breaker state is "open". | `unit` |
| **QM-007** | **Graceful Shutdown--** `closeConnections` should close all active queues and the Redis connection. | `bullmq.Queue`, `ioredis` | 1. Call `getQueue` multiple times to create several queue instances. <br> 2. Call `closeConnections()`. | The test verifies that the `close()` method is called once on every mocked queue instance and on the main Redis connection instance. | `unit`, `integration` |

---

## 5. `FileDiscoveryBatcher` Test Cases

### 5.1. Phase 1-- Path Producer

**UUT--** The Path Producer process/function.

| Test Case ID | Description | Collaborators to Mock | Interactions to Test | Observable Outcome | Regression Tags |
| --- | --- | --- | --- | --- | --- |
| **FDB-P1-001** | **Fail-Fast on Invalid Config--** Should exit if `TARGET_DIRECTORY` is not configured. | `zod`, `process.exit` | 1. The schema validator is called. <br> 2. `process.exit` is called. | The test confirms that `process.exit` was called. | `unit` |
| **FDB-P1-002** | **Directory Scanning--** Should scan the target directory for files. | `fast-glob` (or file scanner), `fs.statSync` | 1. The `fast-glob` function is called with `TARGET_DIRECTORY`. <br> 2. `fs.statSync` is called for each path returned by the scanner. | The test verifies that the scanner function was called with the correct path from the configuration. | `unit` |
| **FDB-P1-003** | **Enqueues File Path Jobs--** Should enqueue a job for each discovered file. | `QueueManager`, mock `bullmq.Queue` | 1. `QueueManager.getQueue` is called with the `PATH_DISCOVERY_QUEUE` name. <br> 2. The `add` method of the mock queue is called for each file found. | The test asserts that `queue.add` was called N times (for N files) with the correct job payload-- `{ filePath, fileSize }`. | `unit`, `integration` |
| **FDB-P1-004** | **Handles Empty Directory--** Should run to completion without error if the directory is empty. | `fast-glob`, `QueueManager` | 1. `fast-glob` returns an empty array. | The test verifies that `queue.add` is never called and the process exits gracefully. | `unit` |

### 5.2. Phase 2-- Batching Worker

**UUT--** The `FileDiscoveryBatcher` worker's processor function.

| Test Case ID | Description | Collaborators to Mock | Interactions to Test | Observable Outcome | Regression Tags |
| --- | --- | --- | --- | --- | --- |
| **FDB-P2-001** | **Fail-Fast on Invalid Config--** Should exit if required config (`MAX_BATCH_TOKENS`, etc.) is missing. | `zod`, `process.exit` | 1. The schema validator is called. <br> 2. `process.exit` is called. | The test confirms that `process.exit` was called. | `unit` |
| **FDB-P2-002** | **Job Consumption and File Reading--** Should process a job and read the corresponding file. | `fs/promises`, `tokenizer` | 1. The processor function is invoked with a job `{ filePath, fileSize }`. <br> 2. `fs.readFile` is called with `job.data.filePath`. | The test verifies that the file system was instructed to read the correct file. | `unit` |
| **FDB-P2-003** | **Batch Accumulation--** Should add a file's tokens to an in-memory batch without enqueuing if the threshold is not met. | `fs/promises`, `tokenizer`, `QueueManager` | 1. Process a job whose token count is less than `MAX_BATCH_TOKENS`. | The test verifies that `QueueManager.getQueue` for the `ANALYSIS_QUEUE` is **not** called. | `unit`, `integration` |
| **FDB-P2-004** | **Batch Completion and Enqueuing--** Should enqueue a completed batch when token count exceeds `MAX_BATCH_TOKENS`. | `fs/promises`, `tokenizer`, `QueueManager`, mock `bullmq.Queue` | 1. Process one or more jobs, where the cumulative token count exceeds `MAX_BATCH_TOKENS`. <br> 2. `QueueManager.getQueue` is called with `ANALYSIS_QUEUE`. <br> 3. The `add` method on the mock queue is called. | The test asserts that `queue.add` was called with a payload containing an array of file data, and that the in-memory batch is subsequently cleared. | `unit`, `integration` |
| **FDB-P2-005** | **Handles File Read Error--** Should fail the job gracefully if a file cannot be read. | `fs/promises` | 1. The `fs.readFile` mock is configured to throw an error. | The test asserts that the processor function throws an exception, allowing BullMQ's retry mechanism to handle it. | `unit` |
