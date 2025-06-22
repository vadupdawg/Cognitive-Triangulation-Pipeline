# Executive Summary

This report details the findings of an initial research phase into AI-driven, text-based source code analysis for polyglot codebases (JavaScript, Python, and Java). The primary objective was to identify actionable strategies for implementing a three-stage analysis pipeline (Scout, Worker, Ingestor) without the use of traditional parsers or Abstract Syntax Trees (ASTs), with a focus on achieving 100% accuracy in the final knowledge graph.

## Key Findings

1.  **A Hybrid, Multi-Pass Approach is Essential:** A recurring pattern in the research is that a purely AI-based or purely rule-based system is insufficient. The most effective approach is a hybrid one.
    *   **Scout Agent:** A multi-pass system combining fast, rule-based file filtering with slower, more accurate AI-based classification for edge cases is recommended.
    *   **Worker Agent:** The core challenge lies in the tension between the "no AST" constraint and the "100% accuracy" requirement. The research indicates that a simple "prompt-and-parse" approach with a general-purpose LLM will not work due to the "noisy" and non-deterministic nature of LLMs.
    *   **Ingestor Agent:** The data ingestion process is a standard ETL (Extract, Transform, Load) problem where established best practices for batching and idempotent operations in Neo4j are directly applicable.

2.  **Fine-Tuning is Non-Negotiable for Accuracy:** To meet the project's accuracy goals, fine-tuning an LLM for the specific task of code analysis in each target language is not an optional optimization—it is a mandatory requirement.

3.  **The Criticality of a Verification Layer:** Given the inherent unreliability of LLMs, a "verification and validation" layer for the output of the Worker Agent is the most critical and least-understood component of the proposed system.

## Primary Recommendations

1.  **Adopt a Three-Stage, Multi-Pass Pipeline:** The architecture should follow the integrated model of a Scout, Worker, and Ingestor agent, with the Ingestor implementing a two-pass logic to handle cross-file dependencies.
2.  **Prioritize the Development of a Fine-Tuning and Verification Strategy:** The project's success hinges on the ability of the Worker Agent to produce accurate data. The immediate focus of the next phase of work should be on the practical implementation of a fine-tuning pipeline and the research of a robust verification mechanism.
3.  **Begin with a Single Language:** The complexity of building a polyglot system should be managed by developing the end-to-end pipeline for a single language first before scaling to others.

## Next Steps: Targeted Research

This initial research phase has successfully defined a high-level model for the pipeline. However, it has also revealed significant knowledge gaps. The next step is to conduct a targeted research cycle focused on the most critical of these gaps: **achieving 100% accuracy from a non-deterministic system.** This will involve a deep dive into LLM validation techniques, multi-agent "critic" systems, and the practicalities of building a high-quality, annotated dataset for fine-tuning.