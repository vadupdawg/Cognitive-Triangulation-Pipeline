# Knowledge Gaps & Contradictions (Part 1)

This document identifies unanswered questions and areas requiring deeper investigation following the initial data collection and analysis phase. These gaps will inform the next, more targeted, research cycle.

## 1. SQLite as a Work Queue

*   **Performance Under High Contention**:
    *   **Gap**: The initial research provides best practices but lacks hard data on the performance of SQLite under the *specific* high-concurrency workload of this project (many workers attempting to claim jobs simultaneously).
    *   **Next Steps**: Search for benchmarks or case studies that specifically measure the throughput of the `UPDATE ... RETURNING` pattern with dozens or hundreds of concurrent connections. What are the observed failure rates or timeout percentages?

*   **Alternative Queueing Systems**:
    *   **Gap**: While alternatives were mentioned conceptually, a direct, feature-by-feature comparison against SQLite for this project's specific needs is missing.
    *   **Next Steps**: Conduct a more focused comparison between SQLite and one or two other lightweight, embedded queueing libraries (e.g., a pure file-system-based queue or a library like `pqueue`). The comparison should be on the axes of-- transactional guarantees, ease of implementation, and observed throughput.

## 2. LLM-based Code Analysis

*   **Handling Large/Complex Files**:
    *   **Gap**: Previously identified concern about large files exceeding context window. However, analysis indicates that source code files in the target domain are well within LLM context limits.
*   **Resolution**: Files will be processed entirely without chunking, simplifying the architecture and ensuring complete semantic context is preserved.

*   **DeepSeek Coder V3 Specifics**:
    *   **Gap**: The research on prompt engineering is general to modern LLMs. More specific information on the capabilities and limitations of DeepSeek Coder V3 regarding structured data generation is needed.
    *   **Next Steps**: Search for any official documentation, blog posts, or community discussions specifically about DeepSeek Coder V3's support for "JSON mode" or other output-constraining features. Are there known best practices or limitations?

*   **Resolving Import Paths**:
    *   **Gap**: The project plan requires the LLM to resolve the `target_qualifiedName` of imports. This is a non-trivial task, as it requires knowledge of the project's file structure and potentially complex module resolution logic (e.g., aliases in a `tsconfig.json`). It is not clear if an LLM can do this reliably from the content of a single file.
    *   **Next Steps**: This may be a significant challenge. Research is needed on whether this is a feasible task for an LLM. It may be that this logic needs to be handled by the `WorkerAgent` itself *before* prompting the LLM, with the resolved path being passed as part of the prompt.

## 3. Neo4j for Code Graphs

*   **Handling Refactoring Operations**:
    *   **Gap**: The plan outlines `DELETE` and `RENAME` operations. The proposed Cypher queries for these are sound, but the performance implications of these operations on a large graph are unknown.
    *   **Next Steps**: Research the performance characteristics of `MATCH ... DETACH DELETE` and `MATCH ... SET` on graphs with millions of nodes and relationships. Are there more efficient ways to handle these bulk updates?

*   **Schema for Dynamic Languages**:
    *   **Gap**: The proposed schema works well for statically-typed languages. For dynamic languages like Python or JavaScript, concepts like "class" or "type" can be more fluid.
    *   **Next Steps**: Investigate best practices for modeling code graphs for dynamically-typed languages. How are concepts like monkey-patching or dynamic imports represented?

## 4. Deterministic Data Pipelines

*   **Error Handling and Recovery**:
    *   **Gap**: The initial research confirmed the validity of the proposed architecture but did not delve deeply into the specific error handling and recovery strategies.
    *   **Next Steps**: What is the best strategy for handling a persistent failure on a specific work item? For example, if a file consistently causes the LLM to fail, how does the system prevent that file from blocking the queue indefinitely? Research patterns for "dead-letter queues" or automated retry-with-backoff-and-fail mechanisms in this context.