# Mutual Understanding Document

## 1. Project Vision

The core vision is to create a sophisticated, AI-driven pipeline that can analyze a directory of source code, understand its structure, and represent it as a highly accurate knowledge graph in a Neo4j database. The system aims to be language-agnostic (polyglot) and serve a broad audience of developers, architects, and researchers who need to visualize and query complex codebases.

## 2. Core Objective

The primary objective is to automate the process of code comprehension by building a three-stage pipeline:

1.  **Scouting:** A `ScoutAgent` identifies all relevant source code files within a target directory.
2.  **Analysis:** Multiple `WorkerAgents` operate in parallel, each analyzing a single file. Their task is to identify all code entities (functions, classes, variables, etc.) and the relationships between them (calls, uses, imports, etc.) within that file and across files (inter-file relationships).
3.  **Ingestion:** A `GraphIngestorAgent` takes the structured data produced by the workers (stored intermediately in a SQLite database) and flawlessly ingests it into a Neo4j graph, creating a perfect, queryable map of the codebase.

## 3. Key Success Criteria

The project's success will be measured primarily by two factors:

*   **Accuracy:** The final Neo4j graph must be a 100% accurate representation of the entities and relationships present in the source code, as defined by the project's schema. This is the paramount success metric.
*   **Polyglot Capability:** The system must be able to effectively analyze a wide variety of programming languages, correctly identifying the specified entities and relationships regardless of the language syntax.

## 4. Testing Strategy

**CRITICAL REQUIREMENT: NO MOCKING POLICY**

All tests in this project must be production-grade and use live environments and resources. This is a strict, non-negotiable rule that applies to all testing activities:

*   **No Database Mocking:** Tests must use real SQLite and Neo4j databases, not mocked versions.
*   **No File System Mocking:** Tests must interact with actual files in the `polyglot-test/` directory.
*   **No API Mocking:** Tests must use real API connections where applicable.
*   **Production Environment:** The `polyglot-test/` directory contains the actual application and databases that serve as the testing environment.

This approach ensures that tests validate real-world behavior and catch integration issues that mocks might miss. The testing environment is specifically designed to support this production-grade testing approach.

## 5. Target Audience

The system is intended for any individual or system that can benefit from a deep, structural understanding of a codebase. This includes, but is not limited to, individual developers, software architects, team leads, and automated systems for research or analysis.