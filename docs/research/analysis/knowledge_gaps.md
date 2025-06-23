# Knowledge Gaps and Contradictions

This document outlines the key knowledge gaps, unanswered questions, and potential contradictions that have been identified after the initial phase of research. These gaps will form the basis for the next cycle of targeted research.

## 1. Quantifying the Accuracy-Performance Trade-off

*   **Gap**: The research has confirmed the trade-off between smaller, faster models and larger, more powerful models. However, there is a lack of quantitative data on *how much* accuracy is lost for a given increase in speed.
*   **Question**: For the task of code entity recognition, what is the measurable difference in accuracy (e.g., precision and recall) between a model like `GPT-4-Turbo` and a smaller, faster model like `GPT-3.5-Turbo` or a distilled model?
*   **Next Step**: Design a targeted search to find benchmarks or case studies that have compared different LLM sizes for code analysis tasks.

## 2. Optimal Context Chunking Strategies

*   **Gap**: "Context chunking" is a widely cited technique, but there is little specific guidance on the *optimal* way to chunk code for relationship analysis.
*   **Question**: Is it more effective to chunk by file, by class, or by some other semantic boundary? How does the chunking strategy affect the accuracy of relationship detection?
*   **Next Step**: Research different code chunking strategies for LLM context management. Look for studies that compare different methods.

## 3. Scalability of Vector Embedding Search

*   **Gap**: Using vector embeddings to find candidate relationships is a promising strategy. However, the scalability of this approach for very large codebases (millions of lines of code) is unclear.
*   **Question**: What are the performance characteristics of performing a similarity search across millions of POI embeddings? What are the best database technologies or indexing strategies for this task (e.g., specialized vector databases)?
*   **Next Step**: Research best practices for large-scale vector similarity search and the tools available.

## 4. Cost-Benefit Analysis of "Cognitive Triangulation"

*   **Gap**: The research has identified several powerful techniques for "Cognitive Triangulation" (multi-model, LLM-as-judge, metamorphic testing). However, each of these adds significant computational cost and latency.
*   **Question**: What is the cost-benefit analysis of each triangulation technique? For example, does using three models instead of two provide a significant enough increase in accuracy to justify the extra cost?
*   **Next Step**: Search for case studies or analyses that discuss the cost-effectiveness of different LLM validation strategies.

## 5. Handling Non-Local and Dynamic Relationships

*   **Gap**: The current research has focused on relatively direct relationships (e.g., direct function calls, inheritance). It is less clear how an LLM-only approach would handle more complex, non-local, or dynamic relationships.
*   **Question**: How can this architecture detect relationships that are established through reflection, dependency injection frameworks, or other forms of indirection that are not immediately obvious from a static analysis of the code?
*   **Next Step**: Formulate a targeted search on "LLM code analysis for dynamic languages" or "detecting indirection with LLMs".

## 6. Contradiction: LLMs vs. "Graph-Based Representations"

*   **Potential Contradiction**: Some research papers on "graph-based representations" for code analysis still rely on traditional ASTs to build the initial graph. This seems to contradict the project's core constraint of avoiding all deterministic parsers.
*   **Clarification Needed**: How can a graph representation of code be built *without* first parsing the code into an AST? Can an LLM be used to generate the graph structure directly from the raw code?
*   **Next Step**: A specific search is needed to find techniques for generating code graphs directly with LLMs, bypassing the need for a traditional AST parser.