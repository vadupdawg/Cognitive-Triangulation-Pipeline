# Production End-to-End (E2E) Test Plan - Sprint 5 Performance

## 1. Overview

This document outlines the End-to-End (E2E) test plan for the code analysis pipeline. The primary goal of this plan is to verify the correctness and robustness of the entire system by testing its components against live infrastructure services.

This plan explicitly **avoids all mocking**. All tests will be executed against real, running instances of Redis, SQLite, and Neo4j to ensure that the interactions between services are validated in a production-like environment. Each task within this plan is designed with an AI-verifiable completion criterion, enabling automated validation of the pipeline's behavior.

## 2. Test Strategy

### 2.1. Approach

The strategy is to treat each major component of the pipeline (`EntityScout`, `FileAnalysisWorker`, `TransactionalOutboxPublisher`, `GraphBuilder`) as a black box. We will provide a controlled input, execute the component, and then inspect the state of the backend data stores (Redis, SQLite, Neo4j) to verify the outcome.

### 2.2. Scope

This plan covers the full data flow:
1.  Initial file discovery and job creation (`EntityScout` -> Redis).
2.  File content analysis and data persistence (`FileAnalysisWorker` -> SQLite).
3.  Asynchronous event publishing (`TransactionalOutboxPublisher` -> Redis).
4.  Final graph construction from persisted data (`GraphBuilder` -> Neo4j).

### 2.3. Key Verification Points

- **Data Integrity**: Ensure data is correctly transformed and passed between components.
- **Dependency Management**: Verify that parent-child job relationships are correctly established in Redis.
- **Atomicity & Idempotency**: Confirm that re-running a process does not lead to duplicate data or corrupt state.
- **State Transitions**: Validate that records (e.g., in the outbox) are correctly updated after being processed.

## 3. Test Environment & Prerequisites

### 3.1. Required Services

- A running instance of **Redis**, accessible to all pipeline components.
- A running instance of **Neo4j**, accessible to the `GraphBuilder`.
- A file-based **SQLite** database, accessible to the relevant workers and services.

### 3.2. Test Data

- A controlled, version-controlled set of source code files located at `tests/test-data/e2e-project/` will be used as the input for `EntityScout`.

### 3.3. Tooling & Automation

- The test runner must have command-line access to `redis-cli`, `sqlite3`, and `cypher-shell` (or equivalent clients) to perform setup, teardown, and verification steps.
- Each verification step is designed to be a script that returns a success or failure code, making it AI-verifiable.

## 4. Test Cases

---

### **Test Case E2E-01: `EntityScout` -> Redis Job Creation**

- **Objective**: To verify that `EntityScout` correctly scans a directory and creates a hierarchy of jobs in the Redis queues.
- **AI-Verifiable Goal**: The successful creation and verification of job hierarchy in Redis queues.

**Setup**:
1.  Execute `redis-cli FLUSHDB` to clear all queues and data from the Redis instance.
2.  **AI Verification**: A script runs `redis-cli DBSIZE` and asserts the result is `0`.

**Action**:
1.  Execute the `EntityScout` agent from the command line, pointing it to the test data directory: `node src/agents/EntityScout.js --path ./tests/test-data/e2e-project`.
2.  **AI Verification**: The process exits with code `0`.

**Verification**:
1.  A verification script will connect to Redis and perform the following assertions:
    - The `resolve-global` queue contains exactly one job.
    - The `resolve-directory` queue contains the expected number of directory jobs.
    - The `analyze-file` queue contains the expected number of file analysis jobs.
    - Fetch the `resolve-global` job and confirm it has no `parentId`.
    - Fetch a sample `resolve-directory` job and assert its `parentId` matches the `resolve-global` job ID.
    - Fetch a sample `analyze-file` job and assert its `parentId` matches the corresponding `resolve-directory` job ID.
2.  **AI Verification**: The verification script exits with code `0`.

**Teardown**:
1.  Execute `redis-cli FLUSHDB`.

---

### **Test Case E2E-02: `FileAnalysisWorker` -> SQLite Data Persistence**

- **Objective**: To verify that the `FileAnalysisWorker` correctly processes a job from Redis and persists the extracted Points of Interest (POIs) and relationships into the SQLite database idempotently.
- **AI-Verifiable Goal**: The successful creation and verification of POIs and relationships in the SQLite database.

**Setup**:
1.  Delete and re-initialize the SQLite database file to ensure a clean state.
2.  Execute `redis-cli FLUSHDB`.
3.  Manually add a single, well-defined `analyze-file` job to the `file-analysis-queue` in Redis. The job data should correspond to a specific file in the test data set.
4.  **AI Verification**: A script confirms the SQLite file is new and the specific job exists in Redis.

**Action**:
1.  Execute the `FileAnalysisWorker` process: `node src/workers/FileAnalysisWorker.js`. The worker should pick up the job and exit upon completion.
2.  **AI Verification**: The process exits with code `0`.

**Verification**:
1.  A verification script will connect to SQLite and:
    - Query the `points_of_interest` table and assert that the expected POIs (classes, functions, etc.) have been created.
    - Query the `relationships` table and assert that the expected intra-file relationships have been created.
2.  Run the `FileAnalysisWorker` process a second time.
3.  The verification script runs again and asserts that the row counts in `points_of_interest` and `relationships` have **not** changed, confirming idempotency.
4.  **AI Verification**: The verification script exits with code `0`.

**Teardown**:
1.  Delete the SQLite database file.
2.  Execute `redis-cli FLUSHDB`.

---

### **Test Case E2E-03: `TransactionalOutboxPublisher` -> Redis Event Forwarding**

- **Objective**: To verify that the `TransactionalOutboxPublisher` correctly polls the SQLite `outbox` table and publishes pending events as jobs to the appropriate Redis queue.
- **AI-Verifiable Goal**: The successful transfer of an event from the SQLite outbox to a Redis queue.

**Setup**:
1.  Delete and re-initialize the SQLite database file, ensuring the `outbox` table is empty.
2.  Clear the target Redis queue (e.g., `relationship-resolution-queue`).
3.  Directly insert a record into the `outbox` table with `status = 'PENDING'` and a defined `payload`.
4.  **AI Verification**: A script confirms the state of the SQLite table and Redis queue.

**Action**:
1.  Execute the `TransactionalOutboxPublisher` service: `node src/services/TransactionalOutboxPublisher.js`.
2.  **AI Verification**: The process starts successfully. For testing, it can be run for a short duration and then terminated.

**Verification**:
1.  A verification script will:
    - Connect to Redis and assert that a new job corresponding to the outbox event has been added to the target queue.
    - Connect to SQLite and assert that the status of the original record in the `outbox` table has been updated to `PROCESSED`.
2.  **AI Verification**: The verification script exits with code `0`.

**Teardown**:
1.  Delete the SQLite database file.
2.  Execute `redis-cli FLUSHDB`.

---

### **Test Case E2E-04: `GraphBuilder` -> Neo4j Graph Creation**

- **Objective**: To verify that the `GraphBuilder` agent correctly processes data from SQLite and constructs the corresponding graph of nodes and relationships in Neo4j idempotently.
- **AI-Verifiable Goal**: The successful creation and verification of the code graph in Neo4j.

**Setup**:
1.  Execute a Cypher query to delete all nodes and relationships from Neo4j: `MATCH (n) DETACH DELETE n`.
2.  Delete and re-initialize the SQLite database.
3.  Run a seeding script to populate the SQLite `points_of_interest` and `relationships` tables with a known, complete, and valid data set.
4.  **AI Verification**: A script confirms Neo4j is empty and SQLite is seeded correctly.

**Action**:
1.  Execute the `GraphBuilder` agent: `node src/agents/GraphBuilder.js`.
2.  **AI Verification**: The process exits with code `0`.

**Verification**:
1.  A verification script will connect to Neo4j and run Cypher queries to:
    - Assert that the total count of nodes matches the number of POIs seeded in SQLite.
    - Assert that the total count of relationships matches the number of relationships seeded in SQLite.
    - Query for specific, known nodes and relationships to validate the structure.
2.  Run the `GraphBuilder` agent a second time.
3.  The verification script runs again and asserts that the node and relationship counts have **not** changed, confirming idempotency.
4.  **AI Verification**: The verification script exits with code `0`.

**Teardown**:
1.  Execute `MATCH (n) DETACH DELETE n` in Neo4j.
2.  Delete the SQLite database file.

## 5. Recursive Testing Strategy (Regression)

This E2E test suite is the final gatekeeper before deploying changes. It serves as a comprehensive regression test for the entire pipeline.

- **Triggers**: The full E2E suite will be automatically executed by a CI/CD pipeline job upon:
    - Any merge to the `main` or `develop` branches.
    - Any commit that modifies files within `src/agents/`, `src/workers/`, `src/services/`, or the database schemas.
- **Environment**: Tests will run in a dedicated, containerized integration environment that mirrors the production setup to ensure consistency.
- **Failure Policy**: A failure in any test case within this suite must block the associated merge or deployment.
- **AI-Verifiable Workflow**: The entire CI/CD process, from trigger to execution and reporting, is an AI-verifiable workflow defined in the pipeline configuration (e.g., `Jenkinsfile`, GitHub Actions YAML).