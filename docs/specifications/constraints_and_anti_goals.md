# Constraints and Anti-Goals - Cognitive Triangulation Architecture

## Core Constraints

### 1. **AI-First Entity Extraction**
*   **Constraint:** The core analysis of source code by EntityScout **must not** rely on Abstract Syntax Trees (ASTs), traditional parsers, or any similar deterministic parsing tools. The entity and relationship extraction must be performed by AI agents using Large Language Models.
*   **Rationale:** This constraint ensures that the system can handle any programming language, even obscure or custom syntaxes, by leveraging the pattern recognition capabilities of modern LLMs rather than language-specific parsers.

### 2. **Cognitive Triangulation Methodology**
*   **Constraint:** RelationshipResolver must implement true cognitive triangulation by analyzing entities from multiple perspectives and cross-validating relationships through different analytical approaches.
*   **Rationale:** This ensures higher accuracy and confidence in detected relationships compared to single-pass analysis methods.

### 3. **Polyglot Language Support**
*   **Constraint:** The system must support analysis of codebases containing multiple programming languages without requiring language-specific configuration or parsers.
*   **Rationale:** Modern software projects often use multiple languages, and the system should handle this complexity transparently.

## Anti-Goals

### 1. **No Traditional Code Parsing**
*   **Anti-Goal:** The system will **not** implement or rely on traditional AST-based code parsing for any programming language.
*   **Justification:** This would limit the system to only supported languages and defeat the purpose of using AI for universal code understanding.

### 2. **No Real-Time Processing Requirements**
*   **Anti-Goal:** The system is **not** designed for real-time code analysis or immediate feedback during development.
*   **Justification:** The cognitive triangulation approach prioritizes accuracy over speed, making it suitable for comprehensive analysis rather than IDE integration.

### 3. **No Code Modification or Generation**
*   **Anti-Goal:** The system will **not** modify, refactor, or generate code. It is purely an analysis and knowledge extraction tool.
*   **Justification:** The focus is on understanding existing code structures and relationships, not on code transformation.

### 4. **No Dependency on External Build Systems**
*   **Anti-Goal:** The analysis will **not** require the target codebase to be buildable or have functioning dependency resolution.
*   **Justification:** Many legacy or incomplete codebases cannot be built, but still contain valuable structural information that should be extractable.