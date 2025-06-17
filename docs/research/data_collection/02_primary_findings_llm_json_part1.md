# Primary Findings-- LLM Prompt Engineering for Structured JSON (Part 1)

This document summarizes the initial findings on prompt engineering techniques designed to elicit structured JSON output from Large Language Models (LLMs), specifically for the code analysis tasks required by the Universal Code Graph V3 project. The research now considers the capabilities of the latest relevant models, such as DeepSeek Coder V3.

## Core Principles for Structured JSON Output

The primary goal is to transform the LLM from a creative text generator into a reliable, structured data provider. This requires a shift in prompting strategy from open-ended questions to explicit, instruction-based commands.

### 1. Explicit Instruction and Role-Playing
The prompt must clearly define the LLM's role and the exact format of the desired output.

*   **System Prompt**: The system prompt should set the context and constraints. The project plan provides an excellent example:
    > "You are an expert code analysis tool. Your task is to analyze the provided source code file and produce a JSON object... Your entire output must be a single, valid JSON object following the specified schema. Do not include any other text, explanations, or markdown fences."
*   **JSON as the *Only* Output**: Explicitly forbid any conversational text or markdown formatting around the JSON object. This is crucial for programmatic parsing.

### 2. Schema Definition in the Prompt
Clearly describe the expected JSON schema within the prompt itself.

*   **Provide a Template**: Include a JSON snippet or a clear textual description of the required fields, types, and structure. This guides the model and reinforces the output format.
    ```plaintext
    Your JSON output must match this structure:
    {
      "filePath": "string",
      "entities": [ { "type": "string", "name": "string", ... } ],
      "relationships": [ { "source_qualifiedName": "string", ... } ]
    }
    ```

### 3. Few-Shot Prompting (Providing Examples)
Including one or two complete examples of the desired input/output within the prompt is a powerful technique.

*   **How it Works**: By showing the model a sample of code and the corresponding perfect JSON output, you fine-tune its response for the specific task at hand.
*   **Example Structure**:
    ```plaintext
    ---
    **Example 1:**

    *Code Input:*
    `const a = 1;`

    *JSON Output:*
    `{ "filePath": "src/a.js", "entities": [{"type": "Variable", ...}], "relationships": [] }`
    ---
    **Your Task:**

    *Code Input:*
    `{actual_code_to_analyze}`

    *JSON Output:*
    ```

## Techniques for Ensuring Determinism

While perfect determinism is challenging with current LLMs, several techniques can significantly improve consistency.

### 1. Setting `temperature` to 0
*   **Function**: The `temperature` parameter controls the randomness of the output. A value of `0` (or a very low value like `0.1`) makes the model's output more deterministic by always selecting the tokens with the highest probability. For a factual, data-extraction task like this, creativity is not desired, so a low temperature is essential.

### 2. Using Model-Specific Features
*   **JSON Mode**: Many modern LLM APIs offer a specific "JSON mode." When enabled, the model is constrained to only output syntactically valid JSON. This is a powerful feature that should be used if available with the DeepSeek API (including V3). It guarantees that the output string can be parsed as JSON, though it doesn't guarantee the schema is correct.

## Handling Complex Scenarios

### Large Files and Context Windows
*   **Problem**: If a source file is too large for the model's context window, it cannot be processed in a single prompt.
*   **Solution**: The code must be chunked. However, simple chunking can break semantic context. A better approach is to use an overlapping chunking strategy or, ideally, to chunk based on semantic boundaries (e.g., functions or classes). The prompt would need to be adapted to analyze a chunk and understand that it is part of a larger file, potentially requiring a final "synthesis" prompt to merge the analyses of all chunks.

### Validation and Retries
Even with the best prompts, the LLM may occasionally produce malformed or incomplete data. A robust system must include a validation layer.

*   **Syntax Check**: The first step is to check if the output is valid JSON. If not, the request can be retried.
*   **Schema Validation**: After parsing, the JSON should be validated against the required schema (e.g., using a library like Zod or JSON Schema). If validation fails, the system could retry the prompt, potentially with an added instruction clarifying the error from the previous attempt.

These initial findings provide a strong foundation for building the `WorkerAgent`'s prompt strategy. The key is to be as explicit and structured as possible in the prompt to guide the LLM toward the desired deterministic output.