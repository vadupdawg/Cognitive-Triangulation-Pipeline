# Integrated Model for an AST-less Code Analysis Pipeline

This document synthesizes the initial research findings into a cohesive, high-level model for the proposed three-stage code analysis pipeline.

## 1. Stage 1: The Scout Agent - A Hybrid File Identifier

The Scout Agent will employ a multi-pass, hybrid strategy to reliably identify all relevant source code files while filtering out non-essential files.

*   **Pass 1: Rule-Based Filtering (High Speed):**
    *   The agent first performs a rapid scan of the entire directory.
    *   It uses a predefined list of common source code file extensions (`.js`, `.py`, `.java`, etc.) and standard directory names (`src`, `lib`) to quickly identify probable source files.
    *   It simultaneously uses a list of common exclusion patterns (`node_modules`, `target`, `dist`, `.git`) to ignore build artifacts and dependency directories.

*   **Pass 2: Heuristic Analysis (Medium Speed):**
    *   For any files not classified in Pass 1, the agent applies content-based heuristics.
    *   This includes checking for shebangs (`#!/usr/bin/env python3`) and the presence of high-signal keywords (e.g., `public class`, `import`).

*   **Pass 3: AI-Based Classification (Low Speed, High Accuracy):**
    *   As a final step for any remaining ambiguous files, a pre-trained language classification model is used to analyze the file content and make a definitive classification. This is the most computationally expensive step and should be used sparingly.

## 2. Stage 2: The Worker Agent - A Fine-Tuned, Validated Analyzer

The Worker Agent's design is the most critical and challenging. To meet the 100% accuracy requirement without an AST, a simple "LLM-as-parser" approach is insufficient. The proposed model is based on a fine-tuned LLM with a verification layer.

*   **Core Component: Fine-Tuned LLM:**
    *   The core of the agent will be an LLM that has been fine-tuned on a large, high-quality dataset of annotated code for each target language (JavaScript, Python, Java).
    *   The fine-tuning process will specialize the model for the specific task of identifying entities (functions, classes, etc.) and relationships (calls, imports, etc.) and outputting them in a structured format (e.g., JSON).

*   **Verification and Validation Layer:**
    *   The "noisy" nature of LLMs necessitates a verification step. The output of the fine-tuned model cannot be trusted implicitly.
    *   The exact mechanism for this layer is a **critical knowledge gap**, but it could involve a multi-agent "critic" system, a separate validation model, or a rule-based system to check for inconsistencies in the generated data.

*   **Polyglot Strategy:**
    *   The initial recommendation is to develop and maintain a separate fine-tuned model for each target language to achieve the highest possible accuracy.

## 3. Stage 3: The Ingestor Agent - A Batched, Idempotent Processor

The Ingestor Agent's role is to reliably and efficiently transfer the structured data from the Worker Agents (stored in an intermediate SQLite database) into the Neo4j graph.

*   **Step 1: Data Transformation (ETL):**
    *   The agent first extracts the JSON data from the intermediate database.
    *   It then transforms this data into a flattened, tabular format that is optimized for Neo4j ingestion.

*   **Step 2: Batched, Transactional Ingestion:**
    *   The agent connects to the Neo4j database and uses the `UNWIND` clause or an APOC procedure like `apoc.periodic.iterate` to process the transformed data in batches.
    *   All operations are performed within transactions to ensure data integrity.

*   **Step 3: Idempotent Operations:**
    *   The agent uses `MERGE` operations with `UNIQUE` constraints on key properties (e.g., file paths, fully-qualified function names) to ensure that re-running the pipeline does not create duplicate nodes or relationships in the graph.