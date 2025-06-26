# Specification-- ConfidenceScoringService

This document provides the detailed specification for the `ConfidenceScoringService`, a new utility introduced in the Cognitive Triangulation v2 architecture.

## 1. Purpose and Role

The `ConfidenceScoringService` is a stateless utility class that centralizes all logic related to the calculation and interpretation of confidence scores. As per the [strategy report](../../research/cognitive_triangulation_strategy_report.md), it will initially implement a simple softmax-based approach and will later evolve to a more sophisticated Bayesian model. Its purpose is to decouple the scoring logic from the agents and workers, providing a single, consistent, and easily updatable source for all confidence-related calculations.

## 2. Dependencies

None. This is a self-contained utility module with pure functions.

## 3. Class Definition-- `ConfidenceScoringService`

### 3.1. Overview

A static class (or module exporting functions) that provides methods for calculating confidence scores. It does not need to be instantiated.

### 3.2. Methods

#### `getInitialScoreFromLlm(llmOutput, context)`

-   **Purpose**: To extract or calculate a preliminary confidence score from the direct output of an LLM. The initial strategy is to use the softmax probability if the model provides it.
-   **Parameters**:
    -   `llmOutput` (Object)-- The raw JSON object returned from the LLM for a specific relationship. It is expected to potentially contain a `probability` or `softmax` field.
    -   `context` (Object)-- An object containing contextual information for logging, such as `{ file_path: '...', relationship: '...' }`.
-   **Logic**:
    1.  Check if `llmOutput.probability` or a similar key exists and is a valid number between 0 and 1.
    2.  If it exists, return that value.
    3.  If it does not exist, **log a `WARN` message** indicating that a default score is being used. The log must include the context provided.
    4.  Return a default neutral value of `0.5`.
-   **Returns**: `Number`-- A preliminary confidence score between 0.0 and 1.0.

#### `calculateFinalScore(evidenceArray)`

-   **Purpose**: To calculate a final, reconciled confidence score for a relationship based on all the evidence gathered from the various analysis workers.
-   **Parameters**:
    -   `evidenceArray` (Array)-- An array of evidence objects. Each object represents the findings of one worker for the same relationship. The object should contain--
        -   `sourceWorker` (String)-- e.g., 'FileAnalysisWorker'.
        -   `initialScore` (Number)-- The score calculated by that worker.
        -   `foundRelationship` (Boolean)-- Whether the worker identified the relationship.
-   **Logic**:
    1.  Initialize a base score from the first piece of evidence (e.g., from `FileAnalysisWorker`).
    2.  Count the number of workers that found the relationship (`agreements`) and the number that did not (`disagreements`).
    3.  **Agreement Boost**: For each subsequent piece of evidence that agrees (`foundRelationship: true`), apply a boosting factor to the score.
    4.  **Disagreement Penalty**: For each piece of evidence that disagrees (`foundRelationship: false`), apply a penalty.
    5.  Determine if there was a conflict (i.e., at least one agreement and one disagreement).
    6.  Ensure the final score is clamped between 0.0 and 1.0.
-   **Returns**: `Object`-- An object containing--
    -   `finalScore` (Number)-- The final, reconciled confidence score.
    -   `hasConflict` (Boolean)-- True if there was disagreement among the workers.

## 4. Justification for Scoring Formulas

The scoring constants (`+0.2` boost, `*0.5` penalty) are initial estimates designed to heavily penalize disagreement while moderately rewarding agreement. This reflects a conservative approach where conflicting evidence severely undermines confidence.

-   **Agreement Boost (`score + (1 - score) * 0.2`)**: This formula provides a diminishing return. The closer the score is to 1.0, the smaller the boost, preventing a single piece of corroborating evidence from pushing a low-confidence finding to a very high one.
-   **Disagreement Penalty (`score * 0.5`)**: This is a significant penalty, designed to quickly reduce confidence in the face of conflicting evidence. A single disagreement can erase the boost from multiple agreements.

**Future Work**: These constants are placeholders. A dedicated task will be created to empirically tune these values. This will involve running the analysis pipeline against the "Ground Truth" repository and using statistical methods (e.g., grid search, ROC analysis) to find the constants that maximize the accuracy of the final confidence scores.

## 5. TDD Anchors / Pseudocode Stubs

```
// TEST-- 'ConfidenceScoringService should return the probability from LLM output if available'
// TEST-- 'ConfidenceScoringService should return a default score and log a warning if probability is missing'
// TEST-- 'calculateFinalScore should boost the score on agreement according to the defined formula'
// TEST-- 'calculateFinalScore should penalize the score on disagreement according to the defined formula'
// TEST-- 'calculateFinalScore should flag a conflict if workers disagree'
// TEST-- 'calculateFinalScore should clamp the final score between 0 and 1'

class ConfidenceScoringService {
  static getInitialScoreFromLlm(llmOutput, context = {}) {
    if (llmOutput && typeof llmOutput.probability === 'number') {
      return Math.max(0, Math.min(1, llmOutput.probability));
    }
    logger.warn({
        msg: 'Uncalibrated score-- LLM output missing probability. Using default.',
        ...context
    });
    return 0.5; // Default neutral score
  }

  static calculateFinalScore(evidenceArray) {
    if (!evidenceArray || evidenceArray.length === 0) {
      return { finalScore: 0, hasConflict: false };
    }

    let finalScore = evidenceArray[0].initialScore;
    const agreements = evidenceArray.filter(e => e.foundRelationship).length;
    const disagreements = evidenceArray.filter(e => !e.foundRelationship).length;

    const hasConflict = agreements > 0 && disagreements > 0;

    // Start from the second piece of evidence
    for (let i = 1; i < evidenceArray.length; i++) {
      const evidence = evidenceArray[i];
      if (evidence.foundRelationship) {
        // Apply agreement boost
        finalScore = finalScore + (1 - finalScore) * 0.2; // Diminishing returns boost
      } else {
        // Apply disagreement penalty
        finalScore = finalScore * 0.5; // Harsh penalty
      }
    }

    // Clamp the score to be within [0, 1]
    const clampedScore = Math.max(0, Math.min(1, finalScore));

    return {
      finalScore: clampedScore,
      hasConflict: hasConflict
    };
  }
}