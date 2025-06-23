# Primary Findings, Part 3: "Cognitive Triangulation" and Validation Strategies

This document summarizes research findings on strategies for validating the output of Large Language Models (LLMs) for code analysis. This is the core of the "Cognitive Triangulation" concept and is essential for ensuring the accuracy of the `RelationshipResolver` agent and the overall pipeline.

## 1. Core Validation Techniques

The research points to three main categories of techniques for validating LLM outputs and reducing hallucinations.

*   **Metamorphic Testing**: This is a powerful technique for testing systems without a traditional "oracle" (i.e., without knowing the correct output beforehand).
    *   **Method**: It works by transforming the input in a predictable way and checking if the output transforms as expected. For example, if you rename a variable in a function, you would expect the analysis of the function's dependencies to remain the same, just with the new variable name.
    *   **Relevance**: This is highly relevant for the `RelationshipResolver`. We can create multiple "metamorphic" versions of the same POI reports and see if the `RelationshipResolver` produces consistent results. The reported success rate of **detecting 75% of GPT-4 errors** is very promising.

*   **LLM-as-Judge (LLMJ)**: This approach uses a second LLM to evaluate the output of the first LLM.
    *   **Method**: One LLM performs the initial analysis, and a second LLM (or the same LLM with a different prompt) is asked to review the output for correctness, consistency, and hallucinations. A specific technique mentioned is "Negative Probing," where you intentionally introduce errors to see if the judge LLM can catch them.
    *   **Relevance**: This is a direct implementation of the "Cognitive Triangulation" idea. The `RelationshipResolver` could have an internal "judge" component that reviews its own findings.

*   **Multi-Model Consensus**: This strategy involves running the same analysis across multiple different LLM models and comparing the results.
    *   **Method**: The same set of POI reports would be sent to, for example, GPT-4, Claude 3, and Gemini. The final result would be based on the consensus between the models.
    *   **Relevance**: This is another direct application of "Cognaporation". It provides a natural way to cross-validate findings and can be used to calculate a confidence score.

## 2. Refinement Methods

These techniques are used to improve the quality of the LLM's output iteratively.

*   **Iterative Prompt Refinement**: This involves adjusting the prompt based on the quality of the initial output. If the model is making a certain type of error, the prompt can be updated to provide more specific instructions or constraints.
*   **Structured Validation Libraries**: Tools like `Pydantic` or `Instructor` can be used to enforce a specific output schema (e.g., a JSON format). This forces the LLM to generate well-structured data and can catch errors if the output doesn't conform to the schema.

## 3. Confidence Scoring

A key requirement is to not just get an answer, but to know how confident the system is in that answer.

*   **Consistency Checks**: The level of agreement between different models (in a multi-model approach) or between different runs with varied prompts can be used as a direct measure of confidence. High agreement equals high confidence.
*   **Hallucination Index**: This involves quantifying how much of the LLM's output is unsupported by the provided context. For example, if the model identifies a function call that doesn't actually exist in the source code, that would increase the hallucination index.
*   **Verification Test Suites**: This involves creating a set of automated tests that check the LLM's output for specific edge cases or known failure modes.

## 4. Proposed "Cognitive Triangulation" Workflow

Based on this research, a potential workflow for the `RelationshipResolver` can be outlined:

1.  **Input**: A set of candidate relationships generated from POI embeddings.
2.  **Triangulation Step 1 (Multi-Model Analysis)**: Send the candidate relationship and the relevant POIs to three different LLMs (e.g., GPT-4, Claude 3, Gemini) with a prompt asking for validation.
3.  **Triangulation Step 2 (LLM-as-Judge)**: Take the outputs from the three models. If they agree, the confidence is high. If they disagree, send the conflicting outputs to a fourth "judge" LLM and ask it to make a final decision.
4.  **Triangulation Step 3 (Metamorphic Check)**: For a subset of high-confidence findings, perform a metamorphic test by slightly altering the input POIs and ensuring the output remains consistent.
5.  **Output**: A list of validated relationships, each with an associated confidence score based on the level of agreement and the results of the validation checks.

*Sources*: Inferred from perplexity.ai search results on LLM validation, metamorphic testing, and confidence scoring.