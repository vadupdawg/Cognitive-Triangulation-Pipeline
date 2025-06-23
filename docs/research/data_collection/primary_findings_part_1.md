# Primary Findings, Part 1: LLM-based Code Entity Recognition

This document contains the initial findings from research into using Large Language Models (LLMs) for code entity recognition, a core component of the `EntityScout` agent.

## 1. Prompt Engineering Strategies

The effectiveness of an LLM in identifying code entities is highly dependent on the quality of the prompt. Key strategies identified are:

*   **Zero-Shot Prompting**: This involves directly instructing the LLM to extract entities from a piece of code without providing any examples. This method leverages the model's extensive pre-training on code.
    *   **Example Prompt**: `"Given the following Python code, extract all function definitions, class definitions, and variable assignments. Return the results in JSON format."`
    *   **Relevance**: This is a good baseline approach for `EntityScout` due to its simplicity and speed.

*   **Few-Shot Prompting**: This technique involves providing the LLM with a few examples of the desired input and output. This is particularly useful for more complex or less common programming languages, or when the desired output format is very specific.
    *   **Example Prompt**: `"Extract the function name and parameters from the following code snippets. ...[examples for C++ and Java]... Now, analyze this Rust code: ..."`
    *   **Relevance**: This will be crucial for ensuring the pipeline is truly polyglot and can handle a wide variety of languages with high accuracy.

*   **Contextual Priming**: This strategy involves explicitly defining the types of entities to be extracted, which helps to reduce ambiguity and focus the model's attention.
    *   **Example Prompt**: `"You are a code analysis agent. Your task is to identify all imported libraries in this Python script. Pay attention to 'import' and 'from ... import' statements."`
    *   **Relevance**: This will be essential for creating specialized prompts for identifying different types of POIs (e.g., one prompt for functions, another for imports).

## 2. Model Selection: Speed vs. Accuracy

There is a fundamental trade-off between the speed of an LLM and its accuracy. The choice of model should be tailored to the specific agent's requirements.

*   **Smaller, Faster Models (e.g., `spaCy-LLM` integrations, distilled models)**:
    *   **Pros**: High speed, lower computational cost.
    *   **Cons**: Potentially lower accuracy, may struggle with complex or ambiguous code.
    *   **Relevance**: These models are strong candidates for the `EntityScout` agent, which needs to perform a fast, shallow scan of many files.

*   **Larger, More Powerful Models (e.g., GPT-4, Claude 3 Opus)**:
    *   **Pros**: High accuracy, better understanding of complex code structures and context.
    *   **Cons**: Slower, more expensive to run.
    *   **Relevance**: These models are better suited for the `RelationshipResolver` agent, which performs a deeper, more context-aware analysis on a smaller set of pre-identified POIs.

## 3. Structured Data Output

To make the LLM's output useful for downstream tasks, it must be in a structured format.

*   **Schema Enforcement**: The most common technique is to instruct the LLM in the prompt to return the output in a specific format, such as JSON or XML. Many modern LLMs have a "JSON mode" that helps enforce this.
    *   **Example JSON Schema**:
        ```json
        {
          "entities": [
            {
              "type": "function",
              "name": "calculate_total",
              "start_line": 10,
              "end_line": 25
            },
            {
              "type": "variable",
              "name": "user_data",
              "line": 5
            }
          ]
        }
        ```
    *   **Relevance**: This is critical for the `EntityScout`'s reports, which need to be machine-readable for the `RelationshipResolver`.

*   **Post-processing Pipelines**: It is also possible to combine LLM output with rule-based validation (e.g., using regular expressions to check if a function name is valid). This can help to correct errors or inconsistencies in the LLM's output.
    *   **Relevance**: This could be a useful addition to the `GraphBuilder` before it ingests the data, acting as a final sanity check.

## 4. Handling Multiple Programming Languages

The ability to analyze code in multiple languages is a key requirement.

*   **Language-Agnostic Training**: Most large LLMs have been trained on a massive corpus of code from many different languages, giving them a built-in ability to handle syntactic variations.
*   **Dynamic Context Switching**: Prompts can be designed to provide examples from one language to help the model understand the task, and then ask it to perform the same task on a different language. This is a form of few-shot learning that can be adapted on the fly.
    *   **Relevance**: This confirms that a single set of prompt templates can be used, with the language name being a variable that is dynamically inserted.

## 5. Key Considerations and Challenges

*   **Token Limits**: Code files can be very large. A common strategy is to chunk large files into smaller segments that fit within the LLM's context window.
*   **Hybrid Approaches**: For very rare or domain-specific languages, it may be beneficial to augment the LLM's analysis with a small set of lightweight, rule-based checks (e.g., for reserved keywords).

*Sources*: Inferred from perplexity.ai search results on LLM-based NER and code analysis.