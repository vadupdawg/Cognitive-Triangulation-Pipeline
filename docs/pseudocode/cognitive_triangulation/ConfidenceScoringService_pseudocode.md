# Pseudocode-- ConfidenceScoringService

This document provides the detailed, language-agnostic pseudocode for the `ConfidenceScoringService` utility. It is designed to be a clear blueprint for implementation, including all logical steps, error handling, and TDD anchors.

## 1. Overview

The `ConfidenceScoringService` is a stateless module that encapsulates the logic for calculating and reconciling confidence scores for relationships identified during analysis. It provides pure functions and does not require instantiation.

---

## 2. Class-- ConfidenceScoringService

A static class or module containing functions for score calculation.

### 2.1. FUNCTION `getInitialScoreFromLlm`

**Purpose**: Extracts or calculates a preliminary confidence score from an LLM's output.

**TDD Anchors**:
- `TEST-- should return the probability from LLM output if it is a valid number`
- `TEST-- should clamp the returned probability between 0 and 1`
- `TEST-- should return a default score of 0.5 if LLM output is missing`
- `TEST-- should return a default score of 0.5 if probability is not a number`
- `TEST-- should log a warning with context when returning the default score`

**INPUT**:
- `llmOutput` (Object)-- The raw JSON object from the LLM.
- `context` (Object)-- Contextual information for logging (e.g., `{ file_path, relationship }`).

**OUTPUT**:
- `Number`-- A preliminary confidence score between 0.0 and 1.0.

**LOGIC**:

```pseudocode
FUNCTION getInitialScoreFromLlm(llmOutput, context)
    // TEST-- should return the probability from LLM output if it is a valid number
    IF llmOutput IS NOT NULL AND llmOutput.probability IS A NUMBER THEN
        // Clamp the score to ensure it's within the valid range [0, 1]
        // TEST-- should clamp the returned probability between 0 and 1
        LET clampedScore = max(0, min(1, llmOutput.probability))
        RETURN clampedScore
    ELSE
        // TEST-- should return a default score of 0.5 if LLM output is missing
        // TEST-- should return a default score of 0.5 if probability is not a number
        // TEST-- should log a warning with context when returning the default score
        LOG 'WARN' with message "Uncalibrated score-- LLM output missing or has invalid probability. Using default." and include `context` object.
        RETURN 0.5
    END IF
END FUNCTION
```

---

### 2.2. FUNCTION `calculateFinalScore` (Order-Independent)

**Purpose**: Calculates a final, reconciled confidence score from multiple pieces of evidence in a deterministic, order-independent manner.

**TDD Anchors**:
- `TEST-- should return a score of 0 and no conflict for empty or null evidence array`
- `TEST-- should use the FileAnalysisWorker's score as the base score when available`
- `TEST-- should use the first evidence's score as base and log a warning if FileAnalysisWorker evidence is missing`
- `TEST-- should produce the exact same score for the same evidence set regardless of order`
- `TEST-- should correctly apply boosts for all agreements, excluding the base evidence's own contribution`
- `TEST-- should correctly apply penalties for all disagreements, excluding the base evidence's own contribution`
- `TEST-- should identify a conflict when there are both agreements and disagreements`
- `TEST-- should not identify a conflict when all evidence agrees`
- `TEST-- should clamp the final score to a maximum of 1.0`
- `TEST-- should clamp the final score to a minimum of 0.0`

**INPUT**:
- `evidenceArray` (Array of Objects)-- Each object contains `{ sourceWorker, initialScore, foundRelationship }`.

**OUTPUT**:
- `Object`-- An object containing `{ finalScore (Number), hasConflict (Boolean) }`.

**LOGIC**:

```pseudocode
FUNCTION calculateFinalScore(evidenceArray)
    // TEST-- should return a score of 0 and no conflict for empty or null evidence array
    IF evidenceArray IS NULL OR evidenceArray IS EMPTY THEN
        RETURN { finalScore-- 0, hasConflict-- false }
    END IF

    // Find the primary evidence from 'FileAnalysisWorker' to use as the base.
    // TEST-- should use the FileAnalysisWorker's score as the base score when available
    LET baseEvidence = evidenceArray.find(e -> e.sourceWorker == 'FileAnalysisWorker')
    
    // If no FileAnalysisWorker evidence, default to the first item and log a warning.
    // TEST-- should use the first evidence's score as base and log a warning if FileAnalysisWorker evidence is missing
    IF baseEvidence IS NULL THEN
        LOG 'WARN' with message "FileAnalysisWorker evidence not found in set. Using first available as base."
        baseEvidence = evidenceArray[0]
    END IF

    LET baseScore = baseEvidence.initialScore
    LET currentScore = baseScore

    // Aggregate total agreements and disagreements to determine conflict and counts.
    LET totalAgreements = 0
    LET totalDisagreements = 0
    FOR EACH evidence IN evidenceArray
        IF evidence.foundRelationship IS TRUE THEN
            totalAgreements = totalAgreements + 1
        ELSE
            totalDisagreements = totalDisagreements + 1
        END IF
    END FOR

    // TEST-- should identify a conflict when there are both agreements and disagreements
    LET hasConflict = (totalAgreements > 0 AND totalDisagreements > 0)

    // Determine how many boosts and penalties to apply, excluding the base evidence's own contribution.
    LET boostsToApply = totalAgreements
    LET penaltiesToApply = totalDisagreements
    IF baseEvidence.foundRelationship IS TRUE THEN
        boostsToApply = boostsToApply - 1
    ELSE
        penaltiesToApply = penaltiesToApply - 1
    END IF

    // Apply boosts for agreements.
    // TEST-- should correctly apply boosts for all agreements, excluding the base evidence's own contribution
    FOR i FROM 1 TO boostsToApply
        currentScore = currentScore + (1 - currentScore) * 0.2
    END FOR

    // Apply penalties for disagreements.
    // TEST-- should correctly apply penalties for all disagreements, excluding the base evidence's own contribution
    FOR i FROM 1 TO penaltiesToApply
        currentScore = currentScore * 0.5
    END FOR

    // Clamp the final score to be within the [0, 1] range.
    // TEST-- should clamp the final score to a maximum of 1.0
    // TEST-- should clamp the final score to a minimum of 0.0
    LET finalScore = max(0, min(1, currentScore))
    
    // TEST-- should produce the exact same score for the same evidence set regardless of order
    RETURN { finalScore-- finalScore, hasConflict-- hasConflict }
END FUNCTION