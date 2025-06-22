# User Stories

This document provides a comprehensive set of user stories that define the functional requirements and acceptance criteria for the code analysis pipeline.

---

### Persona: Software Architect

**Story 1: Comprehensive Codebase Graph Generation**

*   **As a** Software Architect,
*   **I want to** generate a complete and accurate knowledge graph of a polyglot codebase,
*   **so that** I can visualize and query high-level component dependencies and structural patterns.

**Acceptance Criteria:**
*   Given a target directory, the pipeline completes without errors.
*   The final Neo4j graph contains `File`, `Class`, `Function`, and `Variable` nodes for every corresponding entity in every source file identified by the `ScoutAgent`.
*   The graph contains `IMPORTS`, `CALLS`, `USES`, `INHERITS_FROM`, and `HAS_METHOD` relationships that perfectly match the interactions within and between all source files.
*   A Cypher query for all `(:Function)-[:CALLS]->(:Function)` relationships returns a count that is 100% identical to the actual number of function calls in the codebase.
*   The system correctly identifies and creates relationships between entities in files of different languages.

**Story 2: Configurable Analysis Scope**

*   **As a** Software Architect,
*   **I want to** configure the analysis pipeline to include or exclude specific directories and file types,
*   **so that** I can focus the analysis on relevant source code and ignore vendor libraries, documentation, or test files.

**Acceptance Criteria:**
*   Given a configuration file specifying `node_modules/` and `*.md` to be excluded, the `ScoutAgent` does not select any files from those locations or with those patterns.
*   The final graph contains zero nodes or relationships derived from the excluded files.
*   The configuration supports glob patterns for both file paths and directory names.
*   The pipeline produces a log detailing which files and directories were excluded based on the configuration.

---

### Persona: New Developer

**Story 3: Code Discovery and Usage Analysis**

*   **As a** New Developer,
*   **I want to** query the knowledge graph to find the definition and all usages of a specific function,
*   **so that** I can quickly understand its purpose and impact before making changes.

**Acceptance Criteria:**
*   Given a function name (e.g., `calculatePrice`), a Cypher query `MATCH (f:Function {name: 'calculatePrice'})<-[:CALLS]-(caller) RETURN caller` returns a node for every function that calls `calculatePrice`.
*   The count of callers returned by the query is 100% identical to the count found by performing a project-wide search for the function's usage.
*   The node for the `calculatePrice` function contains accurate properties for its file path, start and end line numbers, and defined parameters.

---

### Persona: Automated Security Tool

**Story 4: Reliable and Schema-Compliant Graph Consumption**

*   **As an** Automated Security Tool,
*   **I want to** consume a knowledge graph with a consistent and accurate schema,
*   **so that** I can reliably traverse the graph to identify potential vulnerabilities like insecure data flow.

**Acceptance Criteria:**
*   The Neo4j database schema is validated against the documented project schema before and after ingestion.
*   All nodes and relationships created by the `GraphIngestorAgent` adhere strictly to the defined types, properties, and constraints.
*   The ingestion process is idempotent: running the `GraphIngestorAgent` multiple times on the same input data results in the exact same final graph state.
*   A query tracing a variable from a known user input function to a database execution function correctly identifies the full, uninterrupted path if one exists in the source code.

---

### Persona: Pipeline Operator

**Story 5: Efficient and Scalable Processing**

*   **As a** Pipeline Operator,
*   **I want to** have the pipeline process files in parallel and ingest data in efficient batches,
*   **so that** the analysis of a large codebase completes in a reasonable amount of time.

**Acceptance Criteria:**
*   The `WorkerAgent` module processes multiple files concurrently, utilizing available system resources.
*   The `GraphIngestorAgent` uses batched transactions to load data into Neo4j, preventing memory overflows and ensuring transactional integrity.
*   The pipeline provides clear logs indicating the start and completion of the scout, worker, and ingestor stages, including the number of files processed.
*   The intermediate SQLite database correctly stores the structured output from all `WorkerAgents` before the ingestion stage begins.

**Story 6: Accurate Cross-File Relationship Resolution**

*   **As a** Pipeline Operator,
*   **I want to** be certain that the system correctly resolves relationships between entities defined in different files,
*   **so that** the graph provides a complete and accurate view of the entire system.

**Acceptance Criteria:**
*   The `GraphIngestorAgent` implements a two-pass ingestion strategy (nodes first, then relationships).
*   The first pass successfully creates all `File`, `Class`, and `Function` nodes with 100% accuracy.
*   The second pass successfully creates all `CALLS`, `USES`, and `IMPORTS` relationships that span across different files.
*   A query for a function in `module_A.py` that calls a function in `module_B.py` correctly returns the `CALLS` relationship if and only if it exists in the code.