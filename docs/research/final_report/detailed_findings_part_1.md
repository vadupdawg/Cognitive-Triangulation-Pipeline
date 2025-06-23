# Detailed Findings, Part 1: LLM-based Code Entity Recognition

This section provides a detailed breakdown of the research findings related to LLM-based code entity recognition, which is the primary function of the `EntityScout` agent.

## 1. Prompt Engineering for Entity Recognition

The research consistently shows that the quality of entity recognition is directly tied to the quality of the prompt. The most effective strategies are:

*   **Zero-Shot Prompting**: This is the simplest approach, where the LLM is asked to extract entities without any examples. It is best suited for common programming languages and well-defined entities.
    *   **Finding**: This method is a good baseline for `EntityScout` but may lack accuracy for more complex or esoteric language features.

*   **Few-Shot Prompting**: Providing a few examples of the desired input and output in the prompt significantly improves accuracy.
    *   **Finding**: This is a critical technique for making the pipeline "polyglot." `EntityScout` should use a library of few-shot examples for each language it supports.

*   **Chain-of-Thought (CoT) Prompting**: This involves breaking down the extraction task into a series of logical steps in the prompt.
    *   **Finding**: For complex files, a CoT prompt that instructs the LLM to first identify classes, then functions within those classes, and finally variables within those functions, will likely yield more accurate results than a single, monolithic request.

*   **Structured Output Enforcement**: Prompts must explicitly request the output in a structured format like JSON.
    *   **Finding**: The use of "JSON mode" in modern LLMs is highly recommended to ensure that the POI reports from `EntityScout` are machine-readable.

## 2. Model Selection for `EntityScout`

The choice of LLM for `EntityScout` is a trade-off between speed and accuracy.

*   **Smaller, Faster Models**: Models that are smaller or have been "distilled" from larger models offer significant speed advantages, which is crucial for scanning a large number of files.
    *   **Finding**: The initial scan by `EntityScout` does not need to be perfect. Its goal is to identify *potential* Points of Interest. Therefore, a smaller, faster model is the preferred choice for this agent. Any inaccuracies can be caught by the more powerful `RelationshipResolver` agent downstream.

*   **Larger, More Powerful Models**: While more accurate, these models are too slow and expensive for the initial, broad scan of the entire codebase.
    *   **Finding**: These models should be reserved for the `RelationshipResolver`.

## 3. Handling Multiple Programming Languages

The research indicates that LLMs are inherently well-suited for polyglot code analysis.

*   **Finding**: Most large LLMs have been trained on a vast corpus of code from many languages. This gives them a strong baseline understanding of a wide variety of syntaxes. This can be enhanced with language-specific, few-shot examples in the prompts.

## 4. Key Challenges and Mitigations

*   **Context Window Limitations**:
    *   **Challenge**: Very large code files may not fit into the context window of even the largest LLMs.
    *   **Mitigation**: Files should be chunked into smaller, overlapping segments. The `EntityScout` agent will need a mechanism to stitch together the results from different chunks of the same file.

*   **Code Ambiguity**:
    *   **Challenge**: Code can be ambiguous, and an LLM may misinterpret it.
    *   **Mitigation**: The "Cognitive Triangulation" process in the `RelationshipResolver` is the primary mitigation for this. `EntityScout`'s role is to provide the initial data, not to be the final arbiter of truth.