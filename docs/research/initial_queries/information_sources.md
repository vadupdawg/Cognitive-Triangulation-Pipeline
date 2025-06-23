# Potential Information Sources

This document lists the potential sources of information that will be leveraged to answer the key research questions for the "Cognitive Triangulation" pipeline. The primary method of gathering information will be through a general AI search tool.

## 1. Primary Information Source

*   **General AI Search Tool (via MCP)**: A powerful, general-purpose AI search engine will be the main tool for this research. It will be used to access a wide range of information, including academic papers, technical blogs, conference proceedings, and official documentation.
    *   **Tool**: `github.com/pashpashpash/perplexity-mcp`
    *   **Method**: Formulate precise queries based on the `key_questions.md` document. Queries will be structured to find state-of-the-art techniques, best practices, and documented challenges related to LLM-based code analysis.

## 2. Types of Content to Target

The search queries will be designed to find the following types of content:

*   **Academic and Research Papers**:
    *   **Keywords**: "LLM code analysis", "large language models for source code", "source code representation learning", "LLM code generation", "code summarization with LLMs", "program analysis with LLMs", "natural language processing for code".
    *   **Venues**: arXiv, ACM Digital Library, IEEE Xplore, top-tier AI and Software Engineering conferences (e.g., NeurIPS, ICML, ICLR, ICSE, FSE).

*   **Technical Blogs and Articles**:
    *   **Sources**: Engineering blogs from major tech companies (e.g., Google AI, Meta AI, Microsoft Research, GitHub, Sourcegraph), and articles from individual researchers and practitioners on platforms like Medium, Substack, or personal blogs.
    *   **Focus**: Practical applications, case studies, tutorials, and discussions on the challenges of using LLMs for code analysis.

*   **Official LLM Documentation and Cookbooks**:
    *   **Sources**: Documentation from OpenAI (for GPT models), Google (for Gemini models), Anthropic (for Claude models), etc.
    *   **Focus**: Best practices for prompt engineering, fine-tuning, and using the APIs of major LLM providers, especially regarding structured data generation (e.g., JSON mode).

*   **Open Source Projects and Repositories**:
    *   **Sources**: GitHub, GitLab.
    *   **Focus**: Exploring existing open-source tools that attempt to use LLMs for code analysis, code search, or related tasks. Examining their prompt libraries, methodologies, and architectural choices can provide valuable insights.

## 3. Search and Refinement Strategy

The research will be conducted iteratively:

1.  **Broad Initial Queries**: Start with broad queries based on the main categories of the key questions.
2.  **Analyze Initial Findings**: Review the initial results to identify key terminology, prominent researchers, and leading projects in the field.
3.  **Targeted Follow-up Queries**: Use the refined understanding from the initial analysis to formulate more specific, targeted queries to delve deeper into each key question.
4.  **Citation Chaining**: Follow citations from relevant papers and articles to discover foundational work and related research.