# Secondary Findings-- Semantic Chunking for Large Source Code Files (Part 1)

This document provides targeted research on techniques for chunking large source code files to accommodate the context window limitations of Large Language Models (LLMs), a key knowledge gap identified during the analysis phase.

## The Challenge of Code Chunking

Naive chunking strategies, such as splitting a file by a fixed number of lines or characters, are ineffective for source code. They break the syntactic and semantic integrity of the code, leading to incomplete or nonsensical input for the LLM. For example, a split could happen in the middle of a function or a class definition.

## AST-based Chunking: The Recommended Approach

The most robust and widely recommended technique for chunking source code is to use an Abstract Syntax Tree (AST).

*   **How it Works**:
    1.  **Parse the Code**: The source code is first parsed into an AST using a language-specific parser (e.g., Python's `ast` module, `tree-sitter` for multiple languages). The AST is a tree representation of the code's structure.
    2.  **Traverse the Tree**: The AST is traversed to identify logical, top-level code units. For most object-oriented and procedural languages, these are typically:
        *   Functions
        *   Classes
        *   Interfaces
    3.  **Extract Chunks**: Each of these top-level units is then extracted as a self-contained chunk of text. The chunk includes the entire definition of the function or class, from its signature to its closing brace.

*   **Example (Python)**:
    ```python
    import ast

    def chunk_code_by_functions_and_classes(source_code: str):
        tree = ast.parse(source_code)
        chunks = []
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                # ast.unparse converts the AST node back to source code
                chunks.append(ast.unparse(node))
        return chunks
    ```

*   **Advantages**:
    *   **Preserves Context**: Each chunk is a complete, syntactically correct unit of code. The LLM receives the full context of a function or a class.
    *   **Maintains Scope**: All variables and other entities defined within the chunk are present, allowing the LLM to perform a more accurate analysis.
    *   **Language Agnostic Principle**: While the parser is language-specific, the principle of traversing the AST to find logical blocks is universal.

## Handling the "Remainder"

An AST-based approach will correctly chunk the functions and classes, but what about the code *outside* of these blocks? This includes:

*   Top-level import/require statements.
*   Module-level constants and variables.
*   Script execution logic.

**Strategy**:
1.  **Isolate Top-Level Code**: After extracting all function and class chunks, the remaining code (imports, constants, etc.) should be gathered into a separate, "top-level" chunk.
2.  **Provide Context to All Chunks**: This top-level chunk, which contains the imports and other dependencies, is crucial context. When prompting the LLM for the analysis of a specific function or class chunk, the top-level chunk should be **prepended** to it.

*   **Example Prompt Structure**:
    ```plaintext
    You will be provided with the top-level code from a file, followed by a specific function from that same file. Analyze the function in the context of the top-level code.

    ---
    **Top-Level Code from `src/utils.js`:**
    `import { API_KEY } from './config';`
    `const MAX_RETRIES = 3;`

    ---
    **Function to Analyze:**
    `function doRequest() { ... }`

    ---
    Produce the required JSON output for the `doRequest` function.
    ```

## Conclusion

This AST-based, two-part chunking strategy provides a robust solution to the problem of large files. It preserves the semantic integrity of the code and provides the necessary context for the LLM to perform an accurate analysis of each part of the file. This approach is significantly more reliable than naive chunking and is the recommended strategy for the `WorkerAgent`.