# Code Comprehension Report: Cognitive Triangulation Architecture (Sprint 4)

## 1. Executive Summary

This report provides a comprehensive analysis of the "Cognitive Triangulation" architecture, a sophisticated, multi-agent system designed for deep source code analysis. The system's primary function is to create a rich, queryable knowledge graph representing the semantic structure of a polyglot codebase.

The architecture is composed of three primary agents: `EntityScout`, `RelationshipResolver`, and `GraphBuilder`. These agents work in a sequential pipeline, using a central SQLite database as a transactional message bus for data handoff. This database-centric approach is a core strength, ensuring robustness, observability, and decoupling between the agents.

Key architectural principles include:
- **AI-First Analysis:** The system exclusively uses Large Language Models (LLMs) for entity and relationship extraction, deliberately avoiding traditional parsers (ASTs) to achieve universal language support.
- **Hierarchical Analysis:** The `RelationshipResolver` employs a multi-pass hierarchical strategy to analyze code at different scopes (intra-file, intra-directory, global), which enhances scalability and accuracy.
- **Resilience and Self-Correction:** Agents are designed with retry loops and targeted correction prompts to handle the probabilistic and sometimes unreliable nature of LLM outputs.

This document details the mechanics of the agent interactions, the architectural rationale, the roles of each component, and potential integration points for future development.

## 2. Architectural Mechanics: Data Flow and Agent Interaction

The system operates as a data processing pipeline, where each agent performs a specific transformation and passes its results to the next stage via the central SQLite database.

### Step 1: `EntityScout` - Point of Interest (POI) Extraction

1.  **File Discovery:** The `EntityScout` agent begins by scanning the target directory to discover all relevant source code files based on a configurable list of extensions.
2.  **Shallow Analysis:** For each file, it generates a prompt and queries an LLM to perform a "shallow" analysis. The goal is not to understand the code's logic but to identify and classify all "Points of Interest" (POIs)—such as functions, classes, variables, and file entities.
3.  **Resilient Processing:** The agent includes a self-correction loop. If the LLM returns a malformed or invalid JSON response, the `LLMResponseSanitizer` cleans the output, and if validation still fails, a new, targeted prompt is generated asking the LLM to correct its previous output.
4.  **Database Persistence:** Upon successful analysis, `EntityScout` populates two tables in the SQLite database:
    *   `files`: Records metadata for each processed file (path, checksum, language).
    *   `points_of_interest`: Stores every POI identified, linking each to its source file.

### Step 2: `RelationshipResolver` - Semantic Relationship Discovery

1.  **Data Ingestion:** The `RelationshipResolver` agent queries the SQLite database to load all POIs identified by `EntityScout`.
2.  **Hierarchical Analysis Pipeline:** The agent processes the POIs in a three-pass, mutually exclusive hierarchy to discover relationships. This structured approach prevents redundant analysis and ensures that the LLM is given focused, manageable context for each query.
    *   **Pass 1 (Intra-File):** Analyzes POIs within a single file to find relationships contained entirely within that file (e.g., a function calling another function in the same file).
    *   **Pass 2 (Intra-Directory):** Analyzes all POIs within a single directory to find relationships *between different files* in that directory (e.g., a file importing a class from another file in the same module). It also identifies "exported" POIs that represent the directory's public interface.
    *   **Pass 3 (Global):** Analyzes only the "exported" POIs from all directories to find the final, high-level relationships that span across different modules or directories.
3.  **Database Persistence:** As relationships are discovered and validated, the `RelationshipResolver` populates the `resolved_relationships` table in the SQLite database. Each relationship includes the source POI, target POI, type (e.g., `CALLS`, `IMPORTS`), confidence score, and an explanation.

### Step 3: `GraphBuilder` - Knowledge Graph Persistence

1.  **Data Loading:** The `GraphBuilder` agent, the final stage in the pipeline, reads all the processed data from the `points_of_interest` and `resolved_relationships` tables in SQLite.
2.  **Idempotent Graph Creation:** It connects to the Neo4j database and begins persisting the knowledge graph.
    *   **Node Creation:** It first processes all POIs, creating a corresponding node in Neo4j for each one. It uses an idempotent `MERGE` query to prevent the creation of duplicate nodes if the pipeline is run multiple times.
    *   **Relationship Creation:** It then creates the relationships (edges) between the nodes, again using idempotent `MERGE` queries. The relationship types are dynamic and based on the types discovered by the `RelationshipResolver`.
3.  **Final Output:** The result is a complete, queryable Neo4j knowledge graph that represents the semantic structure of the entire codebase.

## 3. System Strengths and Architectural Rationale

-   **Universal Language Support:** The foundational decision to use LLMs for analysis instead of traditional ASTs makes the system inherently polyglot. It can analyze any programming language the LLM understands without requiring language-specific parsers.
-   **Scalability and Efficiency:** The hierarchical analysis in `RelationshipResolver` is a key innovation that allows the system to scale. By breaking the massive problem of whole-codebase analysis into smaller, scoped queries, it avoids the context window limitations and high costs associated with monolithic analysis.
-   **Robustness and Resilience:** The database-centric design decouples the agents and provides a transactional workflow. The built-in self-correction and sanitization logic in the agents makes the pipeline resilient to the inherent unpredictability of LLM outputs.
-   **Data Integrity and Replayability:** The use of idempotent `MERGE` queries in the `GraphBuilder` ensures that the graph construction process is safe to re-run, which is critical for a reliable data pipeline.

## 4. Potential Integration Points for New Agents

The current architecture is modular and well-suited for extension. New agents can be integrated into the pipeline by interacting with the central SQLite database.

-   **Pre-Processing Agent (`SpecializedFileAgent`):** A new agent could run after `EntityScout` discovers files but before it processes them. It could identify "special" files (e.g., `package.json`, `config.js`) and either enrich their `files` table entry with metadata or route them to a specialized analysis pipeline that runs in parallel.
-   **Post-Processing Agent (`SelfCleaningAgent`):** A new agent could run after the entire pipeline completes. It could read from both the file system and the final Neo4j graph to verify data integrity, check for discrepancies (e.g., a file was deleted but its node still exists), and perform automated corrections or log issues for review. This agent would operate in a verification/auditing capacity.
-   **Enrichment Agent:** An agent could run after `EntityScout` and add more detailed information to the `points_of_interest` table before the `RelationshipResolver` runs. For example, it could perform static analysis to determine cyclomatic complexity for functions or identify potential security vulnerabilities.