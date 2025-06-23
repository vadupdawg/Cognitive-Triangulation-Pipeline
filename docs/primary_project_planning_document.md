# Primary Project Planning Document-- Cognitive Triangulation Architecture (Resilient)

## 1. Project Vision & Goals

### 1.1. Vision

To create a robust, scalable, and accurate code analysis pipeline that leverages a purely LLM-driven approach to understand and graph the relationships within a codebase. This "Cognitive Triangulation" architecture will replace traditional AST-based methods, enabling deeper semantic understanding and more flexible analysis. This revised plan incorporates a resilient architecture to handle the probabilistic nature of LLMs.

### 1.2. Core Goals

*   **Goal 1-- Deep Semantic Understanding:** Move beyond syntax to understand the functional and logical relationships within code.
*   **Goal 2-- Scalability & Efficiency:** Implement a hierarchical analysis model to process large codebases without the context-size limitations of previous designs.
*   **Goal 3-- Accuracy through Resilience:** Implement a multi-faceted validation and self-correction system to ensure the reliability of the LLM-generated data.
*   **Goal 4-- Extensibility:** Design a modular architecture that can be easily extended to support new languages and analysis types.

## 2. The SPARC Lifecycle

This project will adhere to the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) lifecycle. Each phase will have its own set of AI-verifiable outcomes.

## 3. Sprints Overview

The project is broken down into three core sprints.

*   **Sprint 1-- The Foundation-- Resilient `EntityScout` & Core Infrastructure:** Focuses on building the initial file discovery agent with robust error handling and the foundational data pipeline.
*   **Sprint 2-- The Brain-- Hierarchical `RelationshipResolver`:** Focuses on the core hierarchical analysis engine that identifies and validates relationships in a scalable manner.
*   **Sprint 3-- The Memory-- `GraphBuilder` & Validation:** Focuses on populating the graph database and establishing a ground-truth validation framework.

---

## **Sprint 1-- The Foundation-- Resilient `EntityScout` & Core Infrastructure**

### **Phase 1-- Specification**

*   **Task 1.1.1-- Define `EntityScout` Agent Specifications:**
    *   **AI Verifiable End Result:** A markdown file [`docs/specifications/EntityScout_agent_specs.md`](docs/specifications/EntityScout_agent_specs.md) is created, detailing the agent's responsibilities, its resilient self-correction loop, and the `LLMResponseSanitizer` module.

### **Phase 2-- Pseudocode**

*   **Task 1.2.1-- Write `EntityScout` Pseudocode:**
    *   **AI Verifiable End Result:** The pseudocode in [`docs/specifications/EntityScout_agent_specs.md`](docs/specifications/EntityScout_agent_specs.md) is updated to provide a language-agnostic implementation plan for the resilient `_analyzeFileContent` loop and the `LLMResponseSanitizer` functions.

### **Phase 3-- Architecture**

*   **Task 1.3.1-- Design Core Infrastructure:**
    *   **AI Verifiable End Result:** A markdown file [`docs/architecture/infrastructure.md`](docs/architecture/infrastructure.md) is created, detailing the setup for the file-based data pipeline and the Neo4j database.

### **Phase 4-- Refinement (Implementation)**

*   **Task 1.4.1-- Implement `LLMResponseSanitizer` Module:**
    *   **Class-- `LLMResponseSanitizer`:**
        *   **Function-- `sanitize(rawResponse)`:**
            *   **AI Verifiable End Result:** The static `sanitize` method is implemented in [`src/utils/LLMResponseSanitizer.js`](src/utils/LLMResponseSanitizer.js) and passes unit tests for fixing trailing commas and completing truncated JSON objects.

*   **Task 1.4.2-- Implement `EntityScout` Agent:**
    *   **Class-- `EntityScout`:**
        *   **Function-- `constructor(config)`:**
            *   **AI Verifiable End Result:** The `EntityScout` class constructor is implemented in [`src/agents/EntityScout.js`](src/agents/EntityScout.js) and successfully initializes with a given configuration, passing a unit test.
        *   **Function-- `_analyzeFileContent(fileContent)`:**
            *   **AI Verifiable End Result:** The `_analyzeFileContent` method correctly implements the self-correction loop, calling the `LLMResponseSanitizer` and retrying on validation failure. A unit test verifies it can recover from a malformed LLM response and succeed.
        *   **Function-- `run(filePath)`:**
            *   **AI Verifiable End Result:** The `run` method orchestrates the file analysis, calling `_analyzeFileContent` and returning a complete `FileAnalysisReport`. An integration test verifies that running the agent on a sample project produces the expected reports, even when the mock LLM returns initial errors.

### **Phase 5-- Completion**

*   **Task 1.5.1-- Document `EntityScout` Agent:**
    *   **AI Verifiable End Result:** A markdown file [`docs/user_guides/EntityScout_guide.md`](docs/user_guides/EntityScout_guide.md) is created, explaining the agent's resilient features and configuration options like `maxRetries`.