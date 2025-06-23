# Identified Patterns in LLM-based Code Analysis

This document synthesizes the key patterns and recurring strategies identified during the initial data collection phase. These patterns represent the most promising avenues for developing the "Cognitive Triangulation" pipeline.

## 1. Pattern: Two-Tiered LLM Architecture (Speed vs. Power)

A consistent pattern across the research is the use of a two-tiered approach to model selection, balancing speed and analytical depth.

*   **Tier 1 (Fast & Shallow)**: Use smaller, faster, and cheaper LLMs for broad, high-volume tasks. This directly corresponds to the `EntityScout` agent's role of performing a quick scan of all files to find POIs.
*   **Tier 2 (Slow & Deep)**: Use large, powerful, and more expensive LLMs for complex, low-volume tasks that require deep reasoning and context. This aligns perfectly with the `RelationshipResolver` agent's role of analyzing a curated set of POIs to determine complex relationships.

## 2. Pattern: Structured I/O via Prompt Engineering

A critical pattern for enabling a multi-agent pipeline is the enforcement of structured data formats (primarily JSON) for communication between agents.

*   **Method**: This is achieved through explicit instructions in the prompt, often referred to as "schema enforcement." Modern LLMs with "JSON mode" are particularly effective at this.
*   **Application**:
    *   `EntityScout` must be prompted to return its POI findings in a consistent, predefined JSON schema.
    *   `RelationshipResolver` will also output its validated findings (the graph structure) in a clearly defined JSON format for the `GraphBuilder` to consume.

## 3. Pattern: Hybrid Context Management (Summarization + Embeddings)

For cross-file analysis, no single technique for managing context is sufficient. The emerging pattern is a hybrid approach.

*   **Method**:
    1.  **Embeddings for Candidate Generation**: Use vector embeddings of code entities (POIs) to perform a fast, semantic search and identify a list of *potential* relationships. This is a highly efficient way to narrow down the search space.
    2.  **LLMs for Validation**: Use a powerful LLM to validate the candidate relationships identified by the embedding search. The LLM is given the specific POIs involved (and potentially summaries of their parent files/classes) to make a final, context-aware decision.
*   **Relevance**: This hybrid model is a strong candidate for the core logic of the `RelationshipResolver`.

## 4. Pattern: Multi-faceted Validation ("Triangulation")

The concept of "Cognitive Triangulation" is not a single technique but a pattern of using multiple, diverse methods to validate LLM outputs and build confidence.

*   **Key Facets**:
    1.  **Multi-Model Consensus**: Cross-referencing the outputs of different LLMs (e.g., GPT vs. Claude vs. Gemini).
    2.  **LLM-as-Judge**: Using one LLM to critique the output of another.
    3.  **Metamorphic Testing**: Transforming the input in predictable ways to see if the output changes as expected.
*   **Application**: The `RelationshipResolver` should implement a combination of these techniques to calculate a confidence score for each discovered relationship before it is sent to the `GraphBuilder`. This is the cornerstone of the entire architecture's reliability.

## 5. Pattern: Decomposed, Chain-of-Thought (CoT) Prompting

For complex reasoning tasks, the most effective prompting strategy is to break the problem down into smaller, sequential steps.

*   **Method**: Instead of asking the LLM for the final answer in one go, the prompt guides it through a logical sequence of steps (e.g., "First, summarize this function. Second, identify its dependencies. Third, list any potential side effects.").
*   **Relevance**: This pattern should be applied to the prompts for both the `EntityScout` (for complex entity extraction) and, most importantly, the `RelationshipResolver` (for validating complex relationships).