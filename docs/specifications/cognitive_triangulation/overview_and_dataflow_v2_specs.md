# Cognitive Triangulation v2 -- Overview and Dataflow

This document provides a high-level overview of the refactored Cognitive Triangulation architecture, detailing the new components, their interactions, and the modified data flow. It serves as a master guide for the individual component specifications.

## 1. Architectural Goals

The refactor is designed to achieve the following goals, as outlined in the [improvement plan](../../architecture/cognitive_triangulation_improvement_plan.md) and [strategy report](../../research/cognitive_triangulation_strategy_report.md)--

-   **True Triangulation**: Move from a sequential pipeline to a collaborative, multi-pass validation system.
-   **Confidence Scoring**: Introduce a formal mechanism to score the certainty of every discovered relationship.
-   **Enhanced Reliability**: Build a more resilient system with clear observability and fault tolerance.

## 2. Core Components

The refactored system introduces a new coordinating agent and a scoring service, and modifies existing workers.

-- **Component** -- **Type** -- **Purpose**
-- --- -- --- -- ---
-- `EntityScout` -- Existing Agent -- Unchanged. Continues to scan the file system and create the initial hierarchy of analysis jobs.
-- `FileAnalysisWorker` -- Modified Worker -- Performs the first pass of analysis on a single file, generating initial POIs and relationships with a preliminary confidence score.
-- `DirectoryResolutionWorker` -- Modified Worker -- Performs the second pass of analysis, evaluating relationships between files within the same directory. It validates and refines the findings of the `FileAnalysisWorker`.
-- `GlobalResolutionWorker` -- Modified Worker -- Performs the final pass of analysis, looking for high-level relationships between directories. It validates and refines findings from the `DirectoryResolutionWorker`.
-- `ValidationCoordinator` -- **New Agent** -- Orchestrates the multi-pass validation. It receives analysis results from all workers, reconciles conflicts, calculates final confidence scores, and logs evidence.
-- `ConfidenceScoringService` -- **New Service** -- A utility service that provides a consistent method for calculating confidence scores based on LLM outputs and cross-validation agreement.
-- `GraphBuilder` -- Existing Agent -- Modified to consume the final, validated data from the `ValidationCoordinator` and persist it to Neo4j.

## 3. Refactored Data Flow

The data flow is no longer a simple sequential pipeline. It is now a multi-stage process with validation and reconciliation managed by the `ValidationCoordinator`.

1.  **Discovery (Unchanged)**-- `EntityScout` runs, creating the hierarchy of jobs in BullMQ.

2.  **Pass 1-- File-Level Analysis**--
    *   `FileAnalysisWorker` processes a file.
    *   It calls the LLM to get POIs and relationships.
    *   For each relationship, it calls the `ConfidenceScoringService` to get an initial score from the LLM's softmax output.
    *   It publishes a `file-analysis-completed` event with the results, including the initial scores and the raw LLM output as evidence.

3.  **Pass 2-- Directory-Level Validation**--
    *   Once all files in a directory are processed, the `DirectoryResolutionWorker` starts.
    *   It also calls the LLM to find relationships within the directory context.
    *   It publishes a `directory-analysis-completed` event with its own findings.

4.  **Pass 3-- Global-Level Validation**--
    *   Once all directories are processed, the `GlobalResolutionWorker` starts.
    *   It analyzes relationships across directories.
    *   It publishes a `global-analysis-completed` event.

5.  **Reconciliation and Finalization**--
    *   The `ValidationCoordinator` listens for all `*-analysis-completed` events.
    *   For each relationship identified across the different passes, it gathers all the "evidence" (the findings from each worker).
    *   It uses the `ConfidenceScoringService` to calculate a final, reconciled confidence score. The score is boosted if the workers agree and penalized if they disagree.
    *   It logs any disagreements for auditing purposes.
    *   It stores the final, validated relationships and their evidence trail in the SQLite database, marking them as `status = 'VALIDATED'`.

6.  **Graph Persistence**--
    *   Once the `ValidationCoordinator` has processed all results for a run, it triggers the `GraphBuilder`.
    *   The `GraphBuilder` reads only the `VALIDATED` relationships from SQLite and persists the final, trusted knowledge graph in Neo4j.

This new flow ensures that no data is considered "truth" until it has been reviewed by at least one other independent analysis context, achieving the core goal of true cognitive triangulation.