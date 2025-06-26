# Specification: GraphBuilder Trigger Mechanism

**Sprint:** 5 - Performance Refactoring
**Component:** Orchestration Logic (BullMQ Job Dependencies)
**Purpose:** To define the precise, reliable mechanism that triggers the final graph build process after all parallel analysis jobs have completed successfully.

---

## 1. Functional Requirements

*   The final graph build process must only be triggered **once** per complete run.
*   The trigger must occur only after **all** `analyze-file` jobs for that run have **completed successfully**.
*   The system must use BullMQ's native **job dependency** feature. The unreliable "sentinel job" pattern is explicitly forbidden.

---

## 2. User Story / Use Case

*   **As a** System Orchestrator,
*   **I want** to ensure that the final graph build process runs exactly once and only after all file analysis tasks have successfully finished,
*   **So that** a complete, accurate, and deterministic knowledge graph is generated without race conditions or missing data.

---

## 3. Workflow / Sequence of Events

1.  **Parent Job Creation (`EntityScout`)**:
    *   At the start of a run, `EntityScout` creates a single parent job named `graph-build-finalization` in the `graph-build-queue`.
    *   This job is created with a unique `runId` but remains in a `waiting` state as it does not yet have its dependencies fulfilled.

2.  **Child Job Creation & Dependency Linking (`EntityScout`)**:
    *   For every file discovered, `EntityScout` creates an `analyze-file` job.
    *   The `jobId` of each new `analyze-file` job is programmatically added to the dependency list of the parent `graph-build-finalization` job.

3.  **Parallel Processing (`FileAnalysisWorker`)**:
    *   In parallel, multiple `FileAnalysisWorker` instances consume and process the `analyze-file` jobs.
    *   BullMQ internally tracks the state of each of these dependency jobs.

4.  **Trigger Activation (BullMQ Internal Logic)**:
    *   Once the very last `analyze-file` job dependency reports its status as `completed`, BullMQ automatically moves the parent `graph-build-finalization` job from the `waiting` state to the `runnable` state.

5.  **Execution (`GraphBuilderWorker`)**:
    *   A worker process (e.g., `GraphBuilderWorker`) consuming from the `graph-build-queue` picks up the now-runnable `graph-build-finalization` job.
    *   The worker instantiates the `GraphBuilder` agent.
    *   It calls the `GraphBuilder.run()` method, which proceeds to load all data from the database (which has been fully and correctly populated by the now-completed `FileAnalysisWorker` processes) and builds the final graph.

---

## 4. Edge Cases and Constraints

*   **Dependency Failure:** If any of the `analyze-file` child jobs fail (i.e., exhaust all retries and are moved to the DLQ), the parent `graph-build-finalization` job will **never** become runnable. It will remain in the `waiting` state indefinitely. This is the desired behavior, as it prevents an incomplete graph build. A separate monitoring process should be in place to detect and alert on such stalled parent jobs.
*   **Idempotency:** The `GraphBuilder`'s logic must remain idempotent. While the dependency mechanism prevents accidental triggers, idempotency is still crucial for manual recovery scenarios.