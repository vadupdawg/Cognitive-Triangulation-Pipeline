Refactor and enhance the `QueueManager` located at `src/utils/queueManager.js`.

**Context:**
*   A previous version of `QueueManager` exists, but it must be updated to align with the latest architectural requirements.
*   **Architecture:** [`docs/architecture/sprint_6_queuing/QueueManager_and_FileDiscoveryBatcher_Architecture.md`](docs/architecture/sprint_6_queuing/QueueManager_and_FileDiscoveryBatcher_Architecture.md)
*   **Pseudocode:** [`docs/pseudocode/high_performance_pipeline_v2/QueueManager_pseudocode.md`](docs/pseudocode/high_performance_pipeline_v2/QueueManager_pseudocode.md)
*   **Test File:** [`tests/functional/sprint_6_queuing/queueManager.test.js`](tests/functional/sprint_6_queuing/queueManager.test.js:1)

**Your Task:**
1.  Read the provided architecture, pseudocode, and test files to understand the required changes.
2.  Modify the `QueueManager` implementation in `src/utils/queueManager.js`.
3.  Ensure your implementation correctly handles:
    *   Singleton queue instantiation (`QM-002`).
    *   Standardized worker creation (`QM-003`).
    *   The Dead-Letter Queue (DLQ) strategy for permanently failed jobs (`QM-004`).
    *   Resilient Redis connection configuration (`QM-005`).
    *   Graceful shutdown of all connections (`QM-007`).
4.  Your primary objective is to make all tests in `tests/functional/sprint_6_queuing/queueManager.test.js` pass. Run the tests to validate your 