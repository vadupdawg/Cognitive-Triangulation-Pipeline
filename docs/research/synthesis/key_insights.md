# Key Insights

This document distills the most critical insights from the initial research phase. These insights should be the foundation for the technical design and specification of the code analysis pipeline.

## 1. The Centrality of the "Accuracy vs. AI" Problem

The single most important insight is the tension between the project's core constraint (no ASTs) and its primary success metric (100% accuracy). The research confirms that off-the-shelf LLMs are not deterministic and produce "noisy" or imperfect output. Therefore, **a naive "prompt-the-LLM-for-JSON" approach is doomed to fail.** The entire architecture of the Worker Agent must be designed around solving this problem. This insight elevates the "verification and validation layer" from a feature to the most critical component of the system.

## 2. Fine-Tuning is Non-Negotiable for the Worker Agent

While prompting is useful for exploration, it cannot meet the accuracy demands of this project. The insight here is that **fine-tuning is a mandatory requirement, not an optional optimization.** The project plan must account for the significant time and resources required for data annotation, model training, and maintenance for each target language.

## 3. A Polyglot System Requires Polyglot Specialization

The idea of a single, universal model that can parse all languages with perfect accuracy is not supported by the initial research. The key insight is that **achieving high accuracy in a polyglot system requires language-specific specialization.** This has major implications for the Worker Agent's design, suggesting that it will likely need to dynamically load and apply different fine-tuned models based on the language of the file being analyzed, as identified by the Scout Agent.

## 4. The Ingestion Pipeline is a Standard ETL Problem

The research on Neo4j ingestion reveals that this part of the project is a well-understood engineering problem. The key insight is that we do not need to invent new techniques here. Instead, we must **rigorously apply established ETL (Extract, Transform, Load) best practices.** This includes pre-processing the data, using idempotent `MERGE` operations, and batching all transactions. The existence of the APOC library provides a powerful and standard toolset for implementing this.

## 5. The System Must Be Designed for Multi-Pass Analysis

The knowledge gap related to cross-file dependencies reveals a crucial insight: **a single-pass analysis of files will be insufficient.** It is not possible to resolve a function call in `fileA.js` to a function defined in `fileB.js` until `fileB.js` has also been analyzed. This implies that the overall pipeline must be designed as a multi-stage process:

1.  **Analysis Pass:** All files are analyzed individually by Worker Agents to extract all entities and *potential* relationships.
2.  **Resolution Pass:** A separate process (or a later stage of the Ingestor Agent) takes the complete dataset and resolves the inter-file relationships.
3.  **Ingestion Pass:** The final, resolved data is ingested into Neo4j.