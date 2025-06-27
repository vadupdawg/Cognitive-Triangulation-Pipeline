# Cognitive Triangulation v2 - Directory Structure (Revised)

This document proposes a directory structure for implementing the revised Cognitive Triangulation v2 system. The structure remains modular, reflecting the new and updated components.

```
src/
--+-- agents/
--  --  --  -- EntityScout.js
--+-- workers/
--  --  --  -- FileAnalysisWorker.js
--  --  --  -- DirectoryResolutionWorker.js
--  --  --  -- ValidationWorker.js          // New-- handles evidence ingestion
--  --  --  -- ReconciliationWorker.js      // New-- handles final validation
--  --  --  -- GraphBuilderWorker.js
--+-- services/
--  --  --  -- ConfidenceScoringService.js
--  --  --  -- TransactionalOutboxPublisher.js // Runs as a sidecar
--+-- utils/
--  --  --  -- cacheClient.js         // Redis connection and helpers
--  --  --  -- dbClient.js            // SQLite connection and helpers
--  --  --  -- graphClient.js         // Neo4j connection and helpers
--  --  --  -- llmClient.js           // Client for interacting with the LLM
--  --  --  -- logger.js              // Centralized logging configuration
--  --  --  -- queueManager.js        // BullMQ setup and job management
--+-- config/
--  --  --  -- index.js               // Exports all configuration
--  --  --  -- database.js            // Database connection details
--  --  --  -- queue.js               // Queue names and connection details
--  --  --  -- llm.js                 // LLM API keys and model details
--+-- main.js                        // Main entry point to start the application/services
--+-- cli.js                         // Command-line interface to trigger runs

tests/
--+-- unit/
--  --  --  -- agents/
--  --  --  -- workers/
--  --  --  --  --  -- ValidationWorker.test.js
--  --  --  --  --  -- ReconciliationWorker.test.js
--  --  --  -- services/
--+-- integration/
--  --  --  -- pipeline.test.js       // Tests interactions between multiple components
--  --  --  -- outbox.test.js         // Tests worker -> sidecar -> queue flow
--+-- e2e/
--  --  --  -- full_run.test.js       // End-to-end test for a full analysis run
--+-- fixtures/
--  --  --  -- sample-project/        // A sample project to be used for testing

docs/
--+-- architecture/
--  --  --  -- cognitive_triangulation_v2/
--  --  --  --  --  -- 01_system_overview.md
--  --  --  --  --  -- ...
--+-- ...

scripts/
--+-- setup-db.js                    // Script to initialize database schema
--+-- run-analysis.js                // Helper script to start an analysis run
```

---

## Directory Breakdown (Revised)

-   **`src/`**-- Contains all the main application source code.
    -   **`agents/`**-- Houses the high-level orchestrating components like `EntityScout`.
    -   **`workers/`**-- Contains all BullMQ workers. The original `ValidationCoordinator` has been replaced by the stateless `ValidationWorker` and `ReconciliationWorker`.
    -   **`services/`**-- Holds other standalone services. The `TransactionalOutboxPublisher` is designed to be run as a sidecar process on each compute node.
    -   **`utils/`**, **`config/`**, **`main.js` / `cli.js`**-- (No change in purpose).

-   **`tests/`**-- Contains all tests, mirroring the `src` directory structure.
    -   **`unit/`**-- Tests for individual modules. New tests for the `ValidationWorker` and `ReconciliationWorker` will be added here.
    -   **`integration/`**-- Tests verifying the interaction between components and real services. Scenarios will be updated to test the new data-driven validation flow and the local outbox sidecar pattern.
    -   **`e2e/`**-- End-to-end tests for the full pipeline.
    -   **`fixtures/`**-- Test data and sample projects.

-   **`docs/`** & **`scripts/`**-- (No change in purpose).