# Cognitive Triangulation v2 - Testing Strategy (Revised)

This document outlines the revised testing strategy for the Cognitive Triangulation v2 system. The strategy is designed to build high confidence in the system's real-world behavior by strictly adhering to the "No Mocking" principle for all integration and E2E tests.

---

## 1. Guiding Principles (Revised)

-   **Testing Pyramid--** We will follow the classic testing pyramid model.
    -   **Unit Tests (Smallest)--** For pure, stateless logic only.
    -   **Integration Tests (Largest)--** The bulk of our tests, verifying component interactions with real, containerized dependencies.
    -   **E2E Tests (Smallest)--** A few key scenarios to verify the full pipeline.
-   **No Mocking for Integration--** All tests that involve I/O (database, cache, queue) **must** run against real instances of those services, managed via Docker Compose. Mocking is strictly forbidden for these tests as it provides a false sense of security.
-   **State-Based Assertion--** Tests will verify outcomes by inspecting the state of the system (e.g., records in a database, keys in Redis) rather than by spying on function calls.
-   **Automation--** All tests are automated and run in CI/CD.

---

## 2. Unit Testing

-   **Focus--** To verify the correctness of individual, pure, stateless functions. This is the *only* place where mocking is acceptable.
-   **Location--** `tests/unit/`
-   **Tools--** Jest.

### Key Areas for Unit Tests--

-   **`ConfidenceScoringService`--**
    -   Test the `calculateFinalScore` function with various evidence arrays to ensure the arithmetic is correct.
    -   Test that the score is correctly clamped between min and max values.
-   **Pure Logic Helpers--** Any utility function that has no I/O and simply transforms data (e.g., a function that generates a `relationshipHash` from inputs).

---

## 3. Integration Testing (Primary Focus)

-   **Focus--** To verify the contracts and interactions between a component and a live dependency (DB, Cache, Queue). This is the most critical testing layer.
-   **Location--** `tests/integration/`
-   **Tools--** Jest, Docker Compose.

### Key Integration Scenarios (Revised)--

1.  **EntityScout -> Redis Manifest Creation--**
    -   **Run--** Execute the `EntityScout` against a fixture directory.
    -   **Verify--** Connect to a real Redis instance and assert that the `run:<runId>:jobs:files` Set, `run:<runId>:rel_map` Hash, and `run:<runId>:file_to_job_map` Hash are created with the correct members and fields.

2.  **AnalysisWorker -> Redis & Local Outbox--**
    -   **Setup--** Pre-populate Redis with a `file_to_job_map`.
    -   **Run--** Execute a `FileAnalysisWorker` with a job. The LLM call can be stubbed to return a fixed JSON response to make the test deterministic.
    -   **Verify--**
        -   Assert that the `run:<runId>:rel_map` Hash in Redis is updated with the correct `expectedEvidenceCount`.
        -   Assert that a new record appears in the `outbox` table of a real, local SQLite database file.

3.  **Local Outbox -> Sidecar -> Queue -> ValidationWorker -> Primary DB & Redis--**
    -   **Setup--** Seed a local SQLite `outbox` table with an `analysis-finding` event.
    -   **Run--** Start the `TransactionalOutboxPublisher` sidecar and a `ValidationWorker`.
    -   **Verify--**
        -   Assert the event is marked `PUBLISHED` in the outbox DB.
        -   Assert the event is consumed from the BullMQ queue.
        -   Assert a new record exists in the central `relationship_evidence` table.
        -   Assert the `evidence_count:<runId>:<hash>` key in Redis has been incremented to `1`.

4.  **Reconciliation Flow--**
    -   **Setup--** Seed the `relationship_evidence` table with all necessary evidence for a relationship. Set the Redis `evidence_count` to one less than the `expectedEvidenceCount`.
    -   **Run--** Trigger one final `ValidationWorker` to process the last piece of evidence. This should enqueue a `reconcile-relationship` job. Then run a `ReconciliationWorker`.
    -   **Verify--** Assert that a new `VALIDATED` record appears in the final `relationships` table in the primary SQLite DB.

5.  **GraphBuilder -> Neo4j--**
    -   **Setup--** Seed the `relationships` table with `VALIDATED` data.
    -   **Run--** Execute the `GraphBuilderWorker`.
    -   **Verify--** Connect to a real Neo4j instance and assert that the expected `Poi` nodes and `RELATES_TO` edges have been created using `MERGE` (i.e., the test is idempotent).

---

## 4. End-to-End (E2E) Testing

-   **Focus--** To verify the entire pipeline works from start to finish.
-   **Location--** `tests/e2e/`
-   **Tools--** Test runner script, Docker Compose.

### E2E Test Case--

1.  **Setup--** Use Docker Compose to launch the *entire* environment-- all workers, services, Redis, SQLite, Neo4j, and BullMQ.
2.  **Execution--** Trigger the `EntityScout` via the CLI to start a full analysis run on the `tests/fixtures/sample-project/`.
3.  **Validation--** After the run completes, query the final Neo4j database and assert that the graph contains the expected nodes and relationships known to exist in the sample project.
4.  **Teardown--** Ensure the environment is fully torn down to leave a clean state.