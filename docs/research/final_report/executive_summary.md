# Executive Summary

This report details the findings of a deep research investigation into the "Cognitive Triangulation" code analysis pipeline, an architecture designed to analyze source code exclusively through the use of Large Language Models (LLMs), without relying on traditional AST parsers. The research was conducted to inform the function-level specifications for the three core agents of this pipeline: `EntityScout`, `RelationshipResolver`, and `GraphBuilder`.

The research has confirmed the viability of an all-LLM approach and has identified several key patterns and strategies that will be foundational to the architecture.

**Key Findings:**

1.  **Two-Tiered LLM Architecture is Optimal**: The most effective and efficient architecture will employ a two-tiered approach to LLM selection. A fast, lightweight model should be used for the initial, broad scan of the codebase (`EntityScout`), while a more powerful, heavyweight model should be used for the deep, contextual analysis of relationships (`RelationshipResolver`).

2.  **Hybrid Context Management is Essential**: To overcome the context window limitations of LLMs, a hybrid approach is necessary. The research strongly suggests using vector embeddings for a fast, semantic search to identify *candidate* relationships, which are then validated by a powerful LLM that is given a more focused context.

3.  **"Cognitive Triangulation" is a Multi-faceted Validation Strategy**: The core concept of "Cognitive Triangulation" is not a single technique, but a pattern of using multiple, diverse methods to validate LLM outputs. The most promising strategies are:
    *   **Multi-Model Consensus**: Cross-referencing the outputs of different LLMs.
    *   **LLM-as-Judge**: Using one LLM to critique the output of another.
    *   **Metamorphic Testing**: Programmatically altering inputs to verify that outputs change in expected ways.

4.  **Prompt Engineering is a Critical Discipline**: The success of the entire pipeline hinges on effective prompt engineering. The research highlights the importance of **Chain-of-Thought (CoT)** prompting to guide the LLM through complex reasoning, and **structured I/O** (primarily JSON) to ensure reliable communication between agents.

**Key Knowledge Gaps for Future Research:**

While the initial research has been fruitful, it has also identified several key areas that require further, more targeted investigation:

*   A quantitative analysis of the **accuracy vs. performance trade-offs** between different LLM sizes for code analysis.
*   Best practices for **code chunking strategies** for relationship analysis.
*   The **scalability and cost-effectiveness** of different "Cognitive Triangulation" techniques.
*   Methods for detecting **non-local and dynamic relationships** in code.

**Conclusion and Next Steps:**

This research provides a strong foundation for the development of the "Cognitive Triangulation" pipeline. The findings detailed in this report should be used to create the initial function-level specifications for the `EntityScout`, `RelationshipResolver`, and `GraphBuilder` agents.

The next phase of work should focus on addressing the identified knowledge gaps through a targeted research cycle. This will provide the remaining details needed to build a robust, accurate, and scalable code analysis platform.