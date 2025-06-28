# V2 Primary Project Planning Document-- High-Performance, LLM-Only Analysis Pipeline

## 1. High-Level Goal

The primary objective of this project is to build a resilient, high-performance, and scalable analysis pipeline. This system will exclusively use a Large Language Model (LLM) for the core analysis task. The architecture, as defined in the V2 specifications, prioritizes data integrity through robust validation, and performance through parallel processing and efficient, non-blocking I/O. The end goal is a fully automated system that can process a large codebase, identify key code entities and their relationships, and reliably ingest this structured data into a Neo4j graph database for analysis.

---

## Sprint 1-- Core Infrastructure & Batching

**Goal--** Establish the foundational infrastructure, including the queuing system and the first worker responsible for discovering files and creating token-aware batches.

### Phase 1.1-- Infrastructure Setup

*   **Task 1.1.1-- Configure Queues**
    *   **Description--** Set up the Redis-backed BullMQ queues required for the pipeline.
    *   **AI-Verifiable End Result--** The `llm-analysis-queue`, `graph-ingestion-queue`, and their corresponding dead-letter queues are created and accessible by the application. A test script successfully adds and reads a message from each queue.

### Phase 1.2-- `FileDiscoveryBatcher` Implementation

*   **Task 1.2.1-- Implement `FileDiscoveryBatcher` Class**
    *   **Description--** Create the `FileDiscoveryBatcher` class structure as defined in `01_FileDiscoveryBatcher_spec.md`.
    *   **Classes & Methods Inventory--**
        *   `FileDiscoveryBatcher`
            *   `constructor(options)`
            *   `async initialize()`
            *   `async run()`
            *   `async discoverFiles()`
            *   `async createBatches(filePaths)`
    *   **AI-Verifiable End Result--** All methods are stubbed, and a unit test successfully instantiates the class with valid options.

*   **Task 1.2.2-- Implement File Discovery Logic**
    *   **Description--** Implement the `discoverFiles` method using `fast-glob` to find all relevant source code files.
    *   **AI-Verifiable End Result--** A unit test running `discoverFiles()` against a mock filesystem returns the expected array of file paths, correctly applying the glob patterns for inclusion and exclusion.

*   **Task 1.2.3-- Implement Batching Logic**
    *   **Description--** Implement the `createBatches` method, including file reading and token counting with the Hugging Face tokenizer.
    *   **AI-Verifiable End Result--** A unit test with a set of mock files demonstrates that `createBatches()` correctly groups files into multiple batches, respecting the `maxTokensPerBatch` limit. A test case with a single file exceeding the limit will produce one batch containing only that file and log a warning.

### Phase 1.3-- `FileDiscoveryBatcher` Testing

*   **Task 1.3.1-- Unit Test `FileDiscoveryBatcher`**
    *   **Description--** Write comprehensive unit tests for the `FileDiscoveryBatcher`.
    *   **AI-Verifiable End Result--** All TDD Anchors from `01_FileDiscoveryBatcher_spec.md` are implemented as passing unit tests. Specifically, a test running the `run()` method with mocked dependencies results in a correctly structured `FileBatch` job being added to a mock `QueueManager`.

---

## Sprint 2-- LLM Analysis & Robust Validation

**Goal--** Implement the core analysis worker that communicates with the LLM and a new, dedicated worker to validate the LLM's output for correctness and schema adherence.

### Phase 2.1-- `LLMAnalysisWorker` Implementation

*   **Task 2.1.1-- Implement `LLMAnalysisWorker` Class**
    *   **Description--** Create the `LLMAnalysisWorker` class structure as defined in `02_LLMAnalysisWorker_spec.md`.
    *   **Classes & Methods Inventory--**
        *   `LLMAnalysisWorker`
            *   `constructor(options)`
            *   `async processJob(job)`
            *   `formatPrompt(batch)`
    *   **AI-Verifiable End Result--** All methods are stubbed, and a unit test successfully instantiates the class.

*   **Task 2.1.2-- Implement Prompt Formatting**
    *   **Description--** Implement the `formatPrompt` method to correctly inject file contents into the prompt template.
    *   **AI-Verifiable End Result--** A unit test passing a sample `FileBatch` to `formatPrompt()` produces a single string that contains all file paths and contents, matching the template exactly.

*   **Task 2.1.3-- Implement LLM Interaction**
    *   **Description--** Implement the core logic in `processJob` to call the LLM client, receive the response, and enqueue the result.
    *   **AI-Verifiable End Result--** In a test environment, when a `FileBatch` job is processed, a mock LLM client is called. The job is completed, and a new `GraphData` job is successfully added to the `graph-ingestion-queue`.

### Phase 2.2-- `ValidationWorker` Implementation

*   **Task 2.2.1-- Define `ValidationWorker` Specs**
    *   **Description--** Create a new specification file for the `ValidationWorker`. This worker will consume `GraphData` jobs, perform deep validation against the `04_Job_Data_Models_spec.md` and `05_Neo4j_Schema_spec.md`, and route valid jobs to a new `validated-graph-data-queue` and invalid jobs to a `quarantined-jobs-queue`.
    *   **AI-Verifiable End Result--** A new markdown file `docs/specifications/high_performance_llm_only_pipeline/02a_ValidationWorker_spec.md` is created, defining the class, methods, and TDD anchors.

*   **Task 2.2.2-- Implement `ValidationWorker` Class**
    *   **Description--** Implement the `ValidationWorker` based on the newly created specification.
    *   **Classes & Methods Inventory--**
        *   `ValidationWorker`
            *   `constructor()`
            *   `async processJob(job)`
            *   `validateSchema(graphJson)`
            *   `validateGraphLogic(graphJson)`
    *   **AI-Verifiable End Result--** A unit test successfully instantiates the class.

### Phase 2.3-- Worker Testing

*   **Task 2.3.1-- Unit Test `LLMAnalysisWorker`**
    *   **Description--** Write comprehensive unit tests for the `LLMAnalysisWorker`.
    *   **AI-Verifiable End Result--** All TDD Anchors from `02_LLMAnalysisWorker_spec.md` pass. A test where the mock LLM returns malformed JSON results in the job being moved to the dead-letter queue.

*   **Task 2.3.2-- Unit Test `ValidationWorker`**
    *   **Description--** Write comprehensive unit tests for the `ValidationWorker`.
    *   **AI-Verifiable End Result--** A test with a valid `GraphData` job results in a new job on the `validated-graph-data-queue`. A test with an invalid `GraphData` job (e.g., missing `pois` key, incorrect relationship `type`) results in a job being added to the `quarantined-jobs-queue`.

---

## Sprint 3-- Atomic Ingestion & E2E Testing

**Goal--** Implement the final worker to ingest the validated graph data into Neo4j and perform end-to-end testing of the entire pipeline.

### Phase 3.1-- `GraphIngestionWorker` Implementation

*   **Task 3.1.1-- Implement `GraphIngestionWorker` Class**
    *   **Description--** Create the `GraphIngestionWorker` class structure as defined in `03_GraphIngestionWorker_spec.md`.
    *   **Classes & Methods Inventory--**
        *   `GraphIngestionWorker`
            *   `constructor(options)`
            *   `async processJob(job)`
    *   **AI-Verifiable End Result--** The class is implemented and can be instantiated in a unit test.

*   **Task 3.1.2-- Implement Neo4j Ingestion Logic**
    *   **Description--** Implement the `processJob` method to execute the master `apoc.periodic.iterate` Cypher query.
    *   **AI-Verifiable End Result--** A unit test with a valid `GraphData` job successfully calls a mocked Neo4j `session.run` method with the correct master query and parameters.

### Phase 3.2-- Database and E2E Testing

*   **Task 3.2.1-- Setup Neo4j Indexes**
    *   **Description--** Apply the required unique constraints and recommended indexes to the Neo4j database.
    *   **AI-Verifiable End Result--** Executing the `CREATE CONSTRAINT` and `CREATE INDEX` commands from `05_Neo4j_Schema_spec.md` against the database completes successfully.

*   **Task 3.2.2-- Unit Test `GraphIngestionWorker`**
    *   **Description--** Write comprehensive unit tests for the `GraphIngestionWorker`.
    *   **AI-Verifiable End Result--** All TDD Anchors from `03_GraphIngestionWorker_spec.md` pass. A test where the mock database driver throws an error results in the job being moved to the dead-letter queue.

*   **Task 3.2.3-- End-to-End Test 1 (Happy Path)**
    *   **Description--** Run the entire pipeline against a small, controlled set of source files.
    *   **AI-Verifiable End Result--** 1. `FileDiscoveryBatcher` creates one `FileBatch` job. 2. `LLMAnalysisWorker` processes it and creates one `GraphData` job. 3. `ValidationWorker` processes it and creates one `validated-graph-data` job. 4. `GraphIngestionWorker` processes the final job. 5. A subsequent Cypher query against the Neo4j database returns the expected nodes and relationships.

*   **Task 3.2.4-- End-to-End Test 2 (Failure Path)**
    *   **Description--** Run the pipeline where the `LLMAnalysisWorker` is configured to return malformed JSON.
    *   **AI-Verifiable End Result--** The original `FileBatch` job lands in the `llm-analysis-queue`'s dead-letter queue after the defined number of retries. No data is ingested into Neo4j.
