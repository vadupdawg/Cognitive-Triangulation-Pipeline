# Research Scope Definition: Cognitive Triangulation Pipeline

## 1. Project Goal

The primary goal of this research is to inform the function-level specifications for a new code analysis architecture named "Cognitive Triangulation." This pipeline must analyze source code to identify entities and their relationships **exclusively through the use of Large Language Models (LLMs)**, strictly avoiding traditional Abstract Syntax Tree (AST) parsers or any other deterministic parsing methods.

## 2. Architectural Components in Scope

The research will focus on the three core agents of the proposed architecture:

*   **`EntityScout`**: A fast, shallow-pass agent designed to identify potential "Points of Interest" (POIs) such as function definitions, class declarations, variable assignments, and external calls (e.g., API calls, library imports).
*   **`RelationshipResolver`**: A powerful, global-context agent that ingests all POI reports. Its main function is to "triangulate" these POIs to validate their existence and accurately determine the relationships between them (e.g., inheritance, function calls, data flow) across the entire codebase.
*   **`GraphBuilder`**: An agent responsible for taking the validated entities and relationships from the `RelationshipResolver` and populating a Neo4j graph database with them.

## 3. Key Research Areas

The investigation will cover the following critical domains:

*   **LLM-based Entity Recognition**: State-of-the-art techniques for identifying code components without traditional parsers.
*   **Cross-file Relationship Analysis**: Methods for LLMs to accurately infer relationships between code entities distributed across multiple files.
*   **"Cognitive Triangulation" Strategies**: Exploration of multi-LLM, multi-pass, or varied-prompt strategies to enhance accuracy and mitigate risks like model hallucination.
*   **Effective Prompt Engineering**: Best practices for structuring prompts tailored to complex, multi-stage code analysis tasks.
*   **Challenges and Mitigation**: Identification of potential obstacles (e.g., context window limits, performance, ambiguity) and the formulation of concrete solutions.

## 4. Out of Scope

This research will **not** cover:

*   The specific implementation details of the Neo4j schema (though the types of entities and relationships to be stored are in scope).
*   The deployment, orchestration, or scaling infrastructure for the agent pipeline.
*   The user interface or client-side applications that might consume the resulting graph data.
*   Analysis of non-code artifacts like documentation, comments, or configuration files, unless they are directly referenced within the code in a way that is relevant to entity and relationship analysis (e.g., annotations).
*   The use of any non-LLM-based code parsing tools or libraries.