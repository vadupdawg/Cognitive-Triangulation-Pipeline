# Primary Project Planning Document-- High-Performance, LLM-Only Analysis Pipeline

## 1. High-Level Goal

The primary objective of this project is to build a high-performance, scalable, and modular analysis pipeline. This system will scan a target codebase, use a Large Language Model (LLM) to analyze source code files in parallel, identify code entities (POIs) and their relationships, and ingest this structured data into a Neo4j graph database. The architecture must be resilient and decoupled, using a message queue to manage the flow of work between independent, concurrent services.

## Sprint 1-- Foundational Setup and File Discovery

### Phase 1-- Project Initialization and Core Dependencies

*   **Task 1.1-- Setup Project Structure and Dependencies**
    *   **Classes to Build--** None.
    *   **Functions to Build--** None.
    *   **AI-Verifiable End Result--** A `package.json` file is created with all necessary dependencies (`bullmq`, `ioredis`, `@huggingface/tokenizers`, `fast-glob`, `neo4j-driver`, etc.) installed. A basic directory structure for `src/workers`, `src/utils`, and `tests` is in place.

*   **Task 1.2-- Implement QueueManager Utility**
    *   **Classes to Build--** `QueueManager`
    *   **Functions to Build--** `constructor()`, `addJob()`, `getQueue()`
    *   **AI-Verifiable End Result--** Unit tests for the `QueueManager` pass successfully. Tests must verify that it can connect to a mock Redis instance, create BullMQ `Queue` objects, and add a job to a specified queue with the correct data.

*   **Task 1.3-- Implement Neo4j Driver Utility**
    *   **Classes to Build--** None (a module exporting a driver instance).
    *   **Functions to Build--** A function that initializes and exports a singleton Neo4j driver instance.
    *   **AI-Verifiable End Result--** A test script successfully connects to a test Neo4j database instance using the exported driver, confirming configuration is correct.

### Phase 2-- File Discovery and Batching Implementation

*   **Task 2.1-- Implement `FileDiscoveryBatcher` Class Structure**
    *   **Classes to Build--** `FileDiscoveryBatcher`
    *   **Functions to Build--** `constructor()`, `initialize()`
    *   **AI-Verifiable End Result--** Unit tests for the `FileDiscoveryBatcher` constructor and `initialize` method pass successfully. The tests must verify that class properties are set correctly from options and that the tokenizer is loaded from a mock file without errors.

*   **Task 2.2-- Implement `FileDiscoveryBatcher` File Scanning Logic**
    *   **Classes to Build--** `FileDiscoveryBatcher`
    *   **Functions to Build--** `discoverFiles()`
    *   **AI-Verifiable End Result--** A unit test successfully validates the `discoverFiles` method. The test will mock `fast-glob` to return a predefined list of file paths and assert that the method returns the exact same list.

*   **Task 2.3-- Implement `FileDiscoveryBatcher` Batching Logic**
    *   **Classes to Build--** `FileDiscoveryBatcher`
    *   **Functions to Build--** `createBatches()`
    *   **AI-Verifiable End Result--** Unit tests for `createBatches` pass. One test must confirm that a list of files is correctly split into multiple batches when the token limit is exceeded. Another test must confirm that a single file exceeding the limit is placed in its own batch.

*   **Task 2.4-- Implement `FileDiscoveryBatcher` Main `run` Method**
    *   **Classes to Build--** `FileDiscoveryBatcher`
    *   **Functions to Build--** `run()`
    *   **AI-Verifiable End Result--** An integration test for the `run` method passes. The test will mock file system reads and the `QueueManager`. It will verify that `discoverFiles` and `createBatches` are called, and that the `QueueManager.addJob` method is invoked with a correctly structured `FileBatch` job payload.

## Sprint 2-- LLM Analysis and Graph Ingestion

### Phase 1-- LLM Analysis Worker Implementation

*   **Task 1.1-- Implement `LLMAnalysisWorker` Class Structure and Prompt Formatting**
    *   **Classes to Build--** `LLMAnalysisWorker`
    *   **Functions to Build--** `constructor()`, `formatPrompt()`
    *   **AI-Verifiable End Result--** Unit tests for the `LLMAnalysisWorker` constructor and `formatPrompt` method pass. The tests must verify that the prompt template is loaded and that the `formatPrompt` function correctly injects multiple file contents into the template string.

*   **Task 1.2-- Implement `LLMAnalysisWorker` Job Processing Logic**
    *   **Classes to Build--** `LLMAnalysisWorker`
    *   **Functions to Build--** `processJob()`
    *   **AI-Verifiable End Result--** A unit test for `processJob` passes. The test will use a mock LLM client that returns a valid JSON graph string. It must verify that `QueueManager.addJob` is called with a correctly structured `GraphData` payload. A second test must provide a malformed JSON response and verify that the job is moved to a failed state.

### Phase 2-- Graph Ingestion Worker Implementation

*   **Task 2.1-- Implement `GraphIngestionWorker` Class Structure**
    *   **Classes to Build--** `GraphIngestionWorker`
    *   **Functions to Build--** `constructor()`
    *   **AI-Verifiable End Result--** A unit test for the `GraphIngestionWorker` constructor passes, verifying that it correctly initializes a `neo4jDriver` instance with the provided credentials.

*   **Task 2.2-- Implement `GraphIngestionWorker` Job Processing Logic**
    *   **Classes to Build--** `GraphIngestionWorker`
    *   **Functions to Build--** `processJob()`
    *   **AI-Verifiable End Result--** Unit tests for `processJob` pass. One test must verify that the `neo4jDriver`'s `session.run` method is called with the master `apoc.periodic.iterate` Cypher query and the correct `pois` and `relationships` parameters. A second test must simulate a database error and verify the job is moved to a failed state. A third test must provide a malformed `GraphData` job and verify the database is NOT called and the job fails.

## Sprint 3-- End-to-End Integration and Testing

### Phase 1-- System Integration

*   **Task 1.1-- Create Main Application Entrypoint**
    *   **Classes to Build--** None.
    *   **Functions to Build--** A main script (`main.js` or similar).
    *   **AI-Verifiable End Result--** An application entrypoint script is created that can launch the `FileDiscoveryBatcher`, `LLMAnalysisWorker`, and `GraphIngestionWorker` as concurrent processes or threads.

*   **Task 1.2-- Configure Neo4j Database Schema**
    *   **Classes to Build--** None.
    *   **Functions to Build--** None.
    *   **AI-Verifiable End Result--** A script or manual process is executed against the Neo4j database that successfully creates the unique constraint for `POI.id` and the recommended indexes on `POI.type` and `POI.filePath`. The `SHOW CONSTRAINTS` and `SHOW INDEXES` Cypher queries confirm their existence.

### Phase 2-- End-to-End Testing

*   **Task 2.1-- Full Pipeline E2E Test**
    *   **Classes to Build--** None.
    *   **Functions to Build--** A test suite file.
    *   **AI-Verifiable End Result--** A full end-to-end test passes successfully. The test will--
        1.  Point the `FileDiscoveryBatcher` to a small, controlled directory of 2-3 test files.
        2.  Run all three workers concurrently.
        3.  Use a mock LLM that returns a predictable, hardcoded `GraphData` JSON for the given test files.
        4.  After the pipeline runs, execute a Cypher query against the test Neo4j database to verify that the exact nodes and relationships from the mock LLM response have been created.
        5.  Clean up the database after the test.