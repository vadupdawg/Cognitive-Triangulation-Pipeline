# Constraints and Anti-Goals

This document outlines the explicit constraints on the system's design and features that are intentionally excluded from the project's scope. These are as important as the project goals for ensuring a focused and successful implementation.

## 1. Hard Constraints

These are non-negotiable technical limitations that must be adhered to throughout the development process.

*   **No AST / Traditional Parsers:** The core analysis of source code by the `WorkerAgents` **must not** rely on Abstract Syntax Trees (ASTs), traditional parsers, or any similar deterministic parsing tools. The entity and relationship extraction must be performed by AI agents analyzing the raw text of the source code files.

## 2. Anti-Goals (Out of Scope)

These are features and capabilities that the project will deliberately **not** include, in order to maintain focus on the core objectives.

*   **No Code Quality Analysis:** The system will not perform any analysis related to code quality, style, or adherence to best practices.
*   **No Performance Profiling:** The system will not analyze the performance characteristics of the code.
*   **No Security Vulnerability Scanning:** The system will not attempt to identify or report security vulnerabilities.
*   **No Automated Refactoring:** The system will not suggest or perform any code refactoring. Its purpose is analysis, not modification.
*   **No Real-time Visualization:** The system is designed as a batch-processing pipeline. It will not provide real-time updates or an integrated visualization front-end. The output is the populated Neo4j database.