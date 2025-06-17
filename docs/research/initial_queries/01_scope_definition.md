# Research Scope Definition

## Project
Universal Code Graph V3 (SQLite Edition)

## Objective
This research aims to inform the development of the Universal Code Graph V3 by investigating the core technologies and architectural patterns outlined in the project plan. The focus is on ensuring the final implementation is scalable, deterministic, and leverages the specified technologies effectively.

## In Scope
1.  **SQLite as a Message Bus/Work Queue**:
    *   Analysis of SQLite's suitability as a transactional work queue for a concurrent multi-worker architecture.
    *   Best practices for configuration, specifically Write-Ahead Logging (WAL) mode.
    *   Performance characteristics, limitations, and potential bottlenecks under concurrent read/write loads.
    *   Comparison with alternative lightweight, file-based, or in-process queueing systems.

2.  **LLM-based Code Analysis (DeepSeek-coder-v2)**:
    *   State-of-the-art techniques for code analysis using LLMs.
    *   Effective prompt engineering strategies to elicit structured, deterministic JSON output that conforms to the project's data contract.
    *   Methods to ensure output is consistently valid and repeatable.
    *   Error handling and retry strategies for LLM API interactions.

3.  **Neo4j for Code Graphs**:
    *   Optimal data modeling strategies for representing source code constructs (files, functions, classes, variables) and their relationships (imports, calls, exports) in a graph.
    *   Efficient data ingestion patterns, focusing on batch processing from the SQLite staging area into Neo4j.
    *   Example Cypher queries for common code analysis tasks, such as dependency tracing, finding function usages, and identifying orphaned code.

4.  **Deterministic Data Pipelines**:
    *   Architectural patterns for building repeatable and deterministic data processing pipelines.
    *   Strategies for reliably detecting and handling file system changes-- new, modified, deleted, and renamed files.
    *   Techniques for ensuring atomicity and data consistency between the SQLite staging database and the final Neo4j graph.

## Out of Scope
*   Implementation of the agents themselves.
*   Research into alternative LLM providers beyond DeepSeek-coder-v2.
*   Analysis of alternative graph databases to Neo4j.
*   UI/UX design for visualizing the final code graph.
*   Deployment, containerization, or infrastructure management strategies.