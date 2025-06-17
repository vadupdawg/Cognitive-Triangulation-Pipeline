# Key Research Questions

This document outlines the central questions that guide the research for the Universal Code Graph V3 project. These questions are derived from the project plan and the defined research scope.

## 1. SQLite as a Message Bus/Work Queue

*   **Concurrency and Performance**:
    *   What are the practical limits of concurrent writes to a single SQLite database in WAL mode before performance degrades unacceptably?
    *   How does the `UPDATE ... RETURNING` pattern for atomic job claiming perform under high contention from multiple workers?
    *   What are the specific `PRAGMA` settings (e.g., `journal_mode`, `synchronous`, `busy_timeout`) that are optimal for this use case?
    *   What are the trade-offs of using a single database file versus potentially sharding work queues into multiple files?

*   **Alternatives**:
    *   What are the most viable, lightweight, embedded, or file-based queueing libraries/systems (e.g., RQS, Bee-Queue, a simple file-based locking mechanism) that could serve as an alternative to SQLite?
    *   How do these alternatives compare to SQLite in terms of transactional integrity, concurrency, and ease of implementation?

*   **Best Practices**:
    *   What are the established best practices for schema design when using SQLite as a queue?
    *   How should database connections be managed by a pool of concurrent workers to maximize throughput and avoid locking issues?

## 2. LLM-based Code Analysis

*   **Prompt Engineering**:
    *   What specific instructions, examples (few-shot prompting), and constraints should be included in the system and user prompts for DeepSeek-coder-v2 to ensure it reliably returns JSON conforming to the specified schema?
    *   How can the prompt be engineered to maximize the accuracy of relationship detection (e.g., correctly resolving the `target_qualifiedName` for imports)?
    *   What is the most effective way to handle very large source code files that might exceed the LLM's context window?

*   **Determinism and Reliability**:
    *   Besides prompt engineering, what other techniques can enforce deterministic output from the LLM (e.g., setting temperature to 0)? Are there any known limitations?
    *   What is a robust validation and retry strategy if the LLM returns invalid JSON or malformed data? Should the process fail fast or attempt to self-correct?

*   **State-of-the-Art**:
    *   What are the latest published techniques or open-source projects that successfully use LLMs for structured code analysis, and what can be learned from them?

## 3. Neo4j for Code Graphs

*   **Data Modeling**:
    *   What is the most efficient data model for representing the code graph? Is it better to have generic `(:Entity)` nodes with a `type` property or specific node labels like `(:Function, :Class)`?
    *   How should metadata (e.g., `isExported`, `startLine`, `endLine`) be stored on nodes for optimal query performance?
    *   What are the best practices for modeling file-level relationships versus entity-level relationships (e.g., `(:File)-[:CONTAINS]->(:Function)` vs. direct relationships between functions)?

*   **Ingestion Strategy**:
    *   What are the most performant Cypher queries for batch-UPSERTING nodes and relationships from the `analysis_results` table?
    *   How does the `UNWIND` clause combined with `MERGE` perform for ingesting large batches of entities and relationships?
    *   What is the most efficient way to handle the `RENAME` and `DELETE` operations from the `refactoring_tasks` table to avoid full graph scans?

*   **Querying**:
    *   What are some example Cypher queries for practical analysis, such as:
        *   "Find all downstream consumers of a specific function."
        *   "Trace the import path of a variable from its source to a specific file."
        *   "Identify all functions within a file that are not exported and not called by any other function in the same file (dead code)."

## 4. Deterministic Data Pipelines

*   **Architecture**:
    *   What are the common architectural patterns for ensuring a multi-stage data pipeline (file scan -> analysis -> ingestion) is idempotent and deterministic?
    *   How can the system be designed to recover gracefully from failures at any stage (e.g., a worker crashing mid-analysis) without compromising data integrity?

*   **File System Change Detection**:
    *   What are the pros and cons of using file content hashes (SHA-256) versus modification timestamps for detecting changes?
    *   What is the most reliable algorithm for detecting file renames by comparing the hashes of deleted and newly added files? What are its limitations (e.g., a small change to a renamed file)?

*   **Transactional Integrity**:
    *   How can we ensure atomicity between the state updates in the SQLite database and the corresponding updates in the Neo4j graph, especially during the final batch ingestion step?
    *   What is the best strategy for handling a failed Neo4j transaction? Should the corresponding `analysis_results` records be marked as `ingestion_failed` for manual review, or should they be retried automatically?