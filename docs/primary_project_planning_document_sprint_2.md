# Primary Project Planning Document-- Sprint 2 (Resilient & Hierarchical)

## **Sprint 2-- The Brain-- Hierarchical `RelationshipResolver`**

### **Phase 1-- Specification**

*   **Task 2.1.1-- Define `RelationshipResolver` Agent Specifications:**
    *   **AI Verifiable End Result:** The specification document [`docs/specifications/RelationshipResolver_agent_specs.md`](docs/specifications/RelationshipResolver_agent_specs.md) is updated to detail the new three-pass hierarchical analysis (Intra-File, Intra-Directory, Global), the resilient `_queryLlmWithRetry` method, and the data structures for `DirectoryAnalysisSummary` and `ProjectAnalysisSummary`.

### **Phase 2-- Pseudocode**

*   **Task 2.2.1-- Write `RelationshipResolver` Pseudocode:**
    *   **AI Verifiable End Result:** The pseudocode in [`docs/specifications/RelationshipResolver_agent_specs.md`](docs/specifications/RelationshipResolver_agent_specs.md) is updated to provide language-agnostic implementation plans for the `run`, `_runIntraFilePass`, `_runIntraDirectoryPass`, and `_runGlobalPass` methods, illustrating the flow of data between the passes.

### **Phase 3-- Architecture**

*   **Task 2.3.1-- Refine Data Flow Architecture:**
    *   **AI Verifiable End Result:** The [`docs/architecture/infrastructure.md`](docs/architecture/infrastructure.md) document is updated to show the data flow from `EntityScout`'s file reports to the intermediate `DirectoryAnalysisSummary` objects and the final `ProjectAnalysisSummary.json`.

### **Phase 4-- Refinement (Implementation)**

*   **Task 2.4.1-- Implement `RelationshipResolver` Agent:**
    *   **Class-- `RelationshipResolver`:**
        *   **Function-- `constructor(config)`:**
            *   **AI Verifiable End Result:** The `RelationshipResolver` class constructor is implemented in [`src/agents/RelationshipResolver.js`](src/agents/RelationshipResolver.js) and successfully initializes, passing a unit test.
        *   **Function-- `_queryLlmWithRetry(prompt, schema)`:**
            *   **AI Verifiable End Result:** This private method is implemented to handle all LLM calls, incorporating the `LLMResponseSanitizer` and self-correction retry logic. A unit test verifies it can recover from malformed LLM responses.
        *   **Function-- `_runIntraFilePass(report)`:**
            *   **AI Verifiable End Result:** The `_runIntraFilePass` method correctly analyzes a single `FileAnalysisReport` and produces an array of `Relationship` objects found only within that file, verified by a unit test.
        *   **Function-- `_runIntraDirectoryPass(directoryPath, reports)`:**
            *   **AI Verifiable End Result:** The `_runIntraDirectoryPass` method correctly processes all `FileAnalysisReport` objects in a directory, calls `_runIntraFilePass` for each, and produces a valid `DirectoryAnalysisSummary`, verified by an integration test.
        *   **Function-- `_runGlobalPass(dirSummaries)`:**
            *   **AI Verifiable End Result:** The `_runGlobalPass` method uses the high-level summaries from the `DirectoryAnalysisSummary` objects to identify and return cross-directory relationships, verified by an integration test.
        *   **Function-- `run()`:**
            *   **AI Verifiable End Result:** The main `run` method successfully orchestrates all three passes, returning a final `ProjectAnalysisSummary` object. A full integration test on a sample project verifies the final output contains relationships from all three passes.

### **Phase 5-- Completion**

*   **Task 2.5.1-- Document `RelationshipResolver` Agent:**
    *   **AI Verifiable End Result:** A markdown file [`docs/user_guides/RelationshipResolver_guide.md`](docs/user_guides/RelationshipResolver_guide.md) is created, explaining the new hierarchical analysis process and the benefits for scalability.