# Architectural Decision Records (ADRs)

This document records the key architectural decisions made for the Universal Code Graph V4 project.

---

## ADR-001-- LLM-Only Code Analysis

*   **Status**: Accepted
*   **Context**: The project's core mission is to leverage the semantic understanding of Large Language Models (LLMs) to build a code graph, explicitly avoiding traditional AST parsers. The goal is to prove the viability of an LLM as the single source of truth for code intelligence.
*   **Decision**: The system will use an LLM (specifically, a model from the DeepSeek family) as the **exclusive** engine for analyzing source code files.
*   **Consequences**:
    *   **Pros**: Potentially language-agnostic; can capture semantic relationships difficult to extract from ASTs.
    *   **Cons**: Dependency on an external service; system accuracy is contingent on LLM performance and prompt quality.

---

## ADR-002-- Decoupled Multi-Agent Architecture

*   **Status**: Accepted
*   **Context**: The process of creating the code graph can be broken down into distinct logical phases. To ensure scalability and resilience, these phases should not be tightly coupled.
*   **Decision**: The system will be composed of independent services (agents)-- `ScoutAgent`, `WorkerAgent`, and `GraphIngestorAgent`-- plus a new `ResultCollector` service. These agents are decoupled, communicating indirectly through the shared database and dedicated services.
*   **Consequences**:
    *   **Pros**: **Scalability** (Worker pool can be scaled independently), **Resilience** (errors in one agent don't halt others), **Maintainability**.
    *   **Cons**: Increased operational complexity (more services to deploy and monitor).

---

## ADR-003-- SQLite as a Work Queue and State Store

*   **Status**: Amended
*   **Context**: The decoupled agents need a reliable way to coordinate work. The initial design used SQLite as a comprehensive message bus for all inter-agent communication. However, the **Devil's Advocate Review** identified that using it for high-frequency writes from many concurrent `WorkerAgents` would create a significant performance bottleneck due to SQLite's single-writer limitation.
*   **Decision**: SQLite's role is now more focused. It will continue to serve as the central, transactional store for the `work_queue`, `refactoring_tasks`, `file_state`, and `failed_work` tables. However, it will **no longer receive direct writes** of analysis results from the `WorkerAgent` pool. That responsibility is now offloaded to the `ResultCollector` service (see ADR-005).
*   **Consequences**:
    *   **Pros**:
        *   Maintains zero-overhead, transactional integrity for task queuing and state management.
        *   **Eliminates the primary write-contention bottleneck**, as the high-volume `analysis_results` writes are now handled by a single service.
        *   The `work_queue` claiming mechanism remains atomic and reliable.
    *   **Cons**:
        *   The overall architecture now has more components, slightly increasing complexity.

---

## ADR-004-- Dead-Letter Queue for Error Handling

*   **Status**: Accepted
*   **Context**: A single problematic source file could cause the LLM to fail repeatedly, blocking the pipeline.
*   **Decision**: A `failed_work` table will be implemented in the SQLite database. If a `WorkerAgent` fails to process a task after all retries (including the self-healing attempts from ADR-006), it will move the task's reference into the `failed_work` table.
*   **Consequences**:
    *   **Pros**: **Increased Resilience**, **Fault Isolation**. Supports the "Error Resilience" acceptance tests.
    *   **Cons**: Requires a process to review and handle the items in the dead-letter queue.

---

## ADR-005-- Result Collector Service for Write Scalability

*   **Status**: Newly Accepted
*   **Context**: As identified in the **Devil's Advocate Review**, having hundreds of `WorkerAgents` writing directly to the `analysis_results` table in SQLite would cause a massive write-contention storm, creating a `SQLITE_BUSY` bottleneck and negating the benefits of parallel processing.
*   **Decision**: A new, standalone `ResultCollector` service will be introduced. `WorkerAgents` will not write to SQLite. Instead, they will send their validated JSON results via a lightweight network call (e.g., HTTP POST) to this service. The `ResultCollector`'s sole responsibility is to receive these results, batch them in memory, and perform periodic, bulk `INSERT`s into the `analysis_results` table.
*   **Consequences**:
    *   **Pros**:
        *   **Resolves the write bottleneck**: Transforms an N-to-1 writer contention problem into a highly efficient 1-to-1 write pattern.
        *   Fully decouples the `WorkerAgent`'s core analysis logic from the persistence logic.
        *   Allows the `WorkerAgent` to "fire and forget" results, making it more resilient to temporary database issues.
    *   **Cons**:
        *   Introduces an additional service to build, deploy, and monitor.
        *   Adds a network hop, though this is preferable to a database lock.

---

## ADR-006-- LLM Output Hardening and Self-Healing

*   **Status**: Newly Accepted
*   **Context**: The **Devil's Advocate Review** highlighted the significant risk of relying on an LLM to consistently produce perfectly-formed, valid JSON. Simple retries are insufficient to handle malformed outputs or semantic deviations.
*   **Decision**: The `WorkerAgent`'s architecture will be enhanced with a robust "LLM Response Handler" component that performs a multi-step validation and repair process.
    1.  **JSON Repair**: Automatically fix common syntax errors in the LLM's raw output using a dedicated library.
    2.  **Schema Validation**: Strictly validate the repaired JSON against a formal JSON Schema definition of the data contract.
    3.  **Self-Healing Retry Loop**: If schema validation fails, the agent will not simply retry. It will re-invoke the LLM with a modified prompt that includes the previous error, instructing the LLM to correct its own mistake.
    4.  **Confidence Score**: The LLM will be prompted to include a `confidenceScore` in its output. This metadata will be stored with the analysis results, allowing the `GraphIngestorAgent` to make more informed decisions about ambiguous data.
*   **Consequences**:
    *   **Pros**:
        *   Dramatically increases the reliability and success rate of the LLM analysis step.
        *   Reduces the number of tasks that end up in the `failed_work` queue due to correctable errors.
        *   Provides a mechanism for the system to recover from common LLM failure modes automatically.
        *   The `confidenceScore` adds a valuable layer of metadata for downstream processing and quality control.
    *   **Cons**:
        *   Increases the complexity and logic within the `WorkerAgent`.
        *   The self-healing loop may increase the latency and cost for files that require multiple attempts.