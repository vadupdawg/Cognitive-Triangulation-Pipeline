# Research Scope Definition

## 1. Primary Focus

This research focuses on identifying and evaluating AI-native techniques for source code analysis directly from raw text, without the use of Abstract Syntax Trees (ASTs) or traditional parsing methods. The primary goal is to inform the development of a three-stage pipeline for building a code knowledge graph.

## 2. Core Research Areas

The research will be structured around the three agents defined in the project vision:

*   **Scout Agent:** Investigate robust methods for identifying all relevant source code files in a polyglot repository, covering JavaScript, Python, and Java. This includes strategies for handling various file extensions, configuration files, and build scripts that might define the project structure.
*   **Worker Agent:** Explore and evaluate state-of-the-art, AI-driven techniques for extracting code entities (e.g., functions, classes, variables) and their relationships (e.g., calls, inheritance, imports) from plain text. This is the core of the research and must explicitly avoid AST-based approaches.
*   **Ingestor Agent:** Research best practices for transforming the semi-structured data extracted by the Worker Agents into a format suitable for ingestion into a Neo4j database. This includes schema design considerations, data mapping strategies, and efficient batching techniques to ensure data integrity and performance.

## 3. In-Scope Languages

The research will specifically target the following languages:
*   JavaScript (including common variants like JSX)
*   Python
*   Java

## 4. Out of Scope

As per the `constraints_and_anti_goals.md` document, the following topics are explicitly out of scope:
*   Code quality, performance, or security analysis.
*   Automated code refactoring or modification.
*   Real-time analysis or visualization.