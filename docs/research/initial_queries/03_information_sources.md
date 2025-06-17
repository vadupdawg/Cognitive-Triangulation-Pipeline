# Potential Information Sources

This document lists potential sources to consult during the data collection phase of the research for the Universal Code Graph V3 project.

## 1. SQLite as a Message Bus/Work Queue

*   **Primary Sources**:
    *   Official SQLite Documentation, particularly sections on `PRAGMA` statements, Write-Ahead Logging (WAL), and atomic commits.
    *   SQLite mailing list archives and forums for discussions on concurrency and performance.

*   **Secondary Sources**:
    *   Technical blog posts and articles from engineering teams who have used SQLite in similar, high-concurrency scenarios. Search terms: "SQLite as a queue," "SQLite WAL mode performance," "concurrent writes SQLite."
    *   Academic papers comparing the performance of lightweight database systems for embedded or serverless applications.
    *   Performance benchmarks and case studies.

*   **Alternative Systems**:
    *   GitHub repositories and documentation for lightweight, file-based, or embedded queueing libraries (e.g., `rqs`, `pqueue`, `bullmq` for Node.js if applicable, etc.).

## 2. LLM-based Code Analysis

*   **Primary Sources**:
    *   DeepSeek-coder-v2 official documentation, API reference, and any published papers or blog posts from the development team.
    *   OpenAI Cookbook and similar resources for prompt engineering best practices, even if for different models, as the principles often translate.

*   **Secondary Sources**:
    *   Academic research papers on "LLM for code analysis," "structured data extraction from code using LLMs," and "source code representation learning." Search on arXiv, Google Scholar, and Semantic Scholar.
    *   Blog posts from AI researchers and practitioners detailing their experiences with code analysis tasks.
    *   Conference proceedings from AI/ML and software engineering conferences (e.g., ICSE, FSE, NeurIPS, ICML).

*   **Practical Examples**:
    *   Open-source projects on GitHub that utilize LLMs (any model) for code-related tasks (e.g., documentation generation, code translation, vulnerability detection). Analyzing their prompt design can provide valuable insights.

## 3. Neo4j for Code Graphs

*   **Primary Sources**:
    *   Official Neo4j Documentation, especially the sections on data modeling, Cypher query language (`MERGE`, `UNWIND`), and performance tuning.
    *   Neo4j Developer Guides and knowledge base articles.

*   **Secondary Sources**:
    *   Blog posts and articles from the Neo4j community and staff on best practices for graph data modeling for specific domains like code analysis or dependency management.
    *   Presentations and workshop materials from graph-focused conferences (e.g., GraphConnect, NODES).
    *   Books on graph databases and Neo4j.

*   **Practical Examples**:
    *   Publicly available schemas and projects that use Neo4j to model code or software systems.

## 4. Deterministic Data Pipelines

*   **Primary Sources**:
    *   Well-known software engineering and architecture books (e.g., "Designing Data-Intensive Applications" by Martin Kleppmann).
    *   Documentation for established data pipeline and workflow orchestration tools (e.g., Apache Airflow, Prefect, Dagster) to understand their concepts of idempotency and determinism.

*   **Secondary Sources**:
    *   Blog posts from engineering teams at major tech companies detailing their data pipeline architectures.
    *   Case studies on building reliable and repeatable ETL/ELT processes.
    *   Discussions on forums like Stack Overflow and Hacker News regarding best practices for handling file system events and ensuring transactional integrity across multiple systems.