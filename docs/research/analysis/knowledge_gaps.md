# Critical Knowledge Gaps

This document outlines the most critical unanswered questions and areas requiring deeper investigation following the initial research pass. These gaps will be the focus of the next targeted research cycle.

## 1. Worker Agent: Achieving 100% Accuracy without an AST

*   **The Core Problem:** The initial research confirms that LLMs are "noisy" and that achieving 100% accuracy in code analysis is a major challenge, especially without the ground truth provided by an AST. The central knowledge gap is: **How can we build a system that meets the 100% accuracy requirement for entity and relationship extraction using an AST-less approach?**

*   **Sub-Questions for Next Research Cycle:**
    *   What are the state-of-the-art techniques for **validating and verifying** the output of an LLM for code analysis? Are there methods for "self-correction" or "self-critique"?
    *   Can a **multi-agent system** be used to improve accuracy? For example, could one LLM agent generate the analysis, and a separate "critic" agent try to find flaws in it?
    *   How can **Graph Neural Networks (GNNs)** be combined with LLMs? Could an LLM perform a first pass, and a GNN be used to identify and correct inconsistencies in the resulting graph?
    *   What specific **fine-tuning methodologies** (e.g., instruction tuning, reinforcement learning from human feedback) are best suited for achieving high-fidelity code parsing?

## 2. Worker Agent: Practical Implementation of Fine-Tuning

*   **The Core Problem:** The research clearly points to fine-tuning as the most promising path to accuracy. However, the practical steps for implementing this are still unclear. The knowledge gap is: **What is the detailed, practical process for creating a fine-tuned model for polyglot code analysis?**

*   **Sub-Questions for Next Research Cycle:**
    *   What is the optimal **format and schema for the training data**? What does a high-quality, annotated dataset for this task look like?
    *   What is the most effective way to **bootstrap the creation of a large, high-quality training dataset**? Can we use a powerful general-purpose LLM (like GPT-4) to generate an initial dataset that is then manually reviewed and corrected?
    *   What are the best open-source **base models** to start with for fine-tuning on a code analysis task? (e.g., CodeLlama, DeepSeek Coder, etc.)
    *   How do you manage the **cost-benefit trade-off of fine-tuning** for three different languages? Is it better to have one large polyglot model or three smaller, specialized models?

## 3. Ingestor Agent: Handling Cross-File and Cross-Language Relationships

*   **The Core Problem:** The initial research on Neo4j focused on ingesting data from a single source. It did not address the challenge of resolving relationships that span multiple files or even different languages. The knowledge gap is: **What are the best patterns for resolving and ingesting inter-file and inter-language dependencies into Neo4j?**

*   **Sub-Questions for Next Research Cycle:**
    *   How should the ingestion process handle a function call where the called function is defined in another file that has not yet been processed? Does this imply a multi-pass ingestion strategy?
    *   What is the best way to model unresolved dependencies in the graph? For example, if a function calls `foo.bar()`, but `foo` is imported from a library whose source is not available.
    *   Are there established graph database patterns for representing polyglot projects where, for example, a JavaScript frontend calls a Java backend API? How can this be modeled effectively in Neo4j?