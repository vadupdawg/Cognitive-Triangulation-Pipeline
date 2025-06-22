# Key Research Questions

This document outlines the central questions that will drive the research process, organized by the three main agents of the analysis pipeline.

## 1. Scout Agent (File Identification)

*   What are the most effective and reliable methods for discovering all relevant source code files in a polyglot codebase (JavaScript, Python, Java) without relying on a predefined list?
*   How can we distinguish source files from documentation, configuration, test assets, and other non-essential files?
*   What strategies can be used to interpret project configuration files (e.g., `package.json`, `pom.xml`, `requirements.txt`) to inform the file discovery process?
*   Are there AI-based approaches that can learn to identify source code files based on their content and structure, rather than just file extensions?

## 2. Worker Agent (AST-less Code Analysis)

*   What are the leading AI/ML models (e.g., Large Language Models, Graph Neural Networks) for parsing entities and relationships from raw source code text?
*   What are the most effective prompting strategies or fine-tuning methodologies for instructing an LLM to act as a "code parser" for multiple languages?
*   How can an AI model reliably identify the following entities from raw text:
    *   Functions / Methods (including signatures and decorators)
    *   Classes (including inheritance and interface implementation)
    *   Variables (global, local, and class-level)
    *   Imports / Requires / Package inclusions
*   What techniques can be used to accurately extract relationships between these entities, such as:
    *   Function `A` calls Function `B`.
    *   Class `X` inherits from Class `Y`.
    *   File `F1` imports Module `M2`.
    *   Function `C` uses Variable `V`.
*   How can we handle cross-file and cross-language dependencies and relationships without a global AST?
*   What are the best methods for ensuring the accuracy and consistency of the extracted data, and how can we validate it?

## 3. Ingestor Agent (Neo4j Transformation)

*   What is the optimal Neo4j graph schema (nodes, relationships, properties) for representing a polyglot codebase to support flexible and powerful queries?
*   What are the most efficient and scalable patterns for transforming JSON or other semi-structured data from the Worker Agents into Cypher queries for Neo4j?
*   How can we ensure idempotent ingestion, so that re-running the pipeline on the same code does not create duplicate nodes or relationships?
*   What are the best practices for using transactions and batching to ensure data integrity and high performance during the ingestion process into Neo4j?