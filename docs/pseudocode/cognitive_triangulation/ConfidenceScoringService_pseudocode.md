# Pseudocode-- ConfidenceScoringService

This document provides the detailed, language-agnostic pseudocode for the `ConfidenceScoringService`. It is based on the specifications outlined in [`docs/specifications/cognitive_triangulation/ConfidenceScoringService_specs.md`](docs/specifications/cognitive_triangulation/ConfidenceScoringService_specs.md).

## 1. Module-- `ConfidenceScoringService`

A stateless module or static class providing utility functions for confidence score calculations. It does not require instantiation.

---

## 2. Function-- `getInitialScoreFromLlm`

### 2.1. Purpose

Extracts or calculates a preliminary confidence score from the direct output of an LLM.

### 2.2. Pseudocode

```pseudocode
FUNCTION getInitialScoreFromLlm(llmOutput, context)
    // Takes the raw LLM output and logging context.
    // Returns a numeric score between 0.0 and 1.0.

    INPUT:
        llmOutput: Object -- The raw JSON object from the LLM.
        context: Object -- Contextual information for logging (e.g., { file_path, relationship }).

    OUTPUT:
        Number -- A preliminary confidence score.

    // TDD ANCHOR: TEST with a valid, numeric probability field present in the llmOutput.
    // Example-- llmOutput = { probability: 0.85 }
    IF llmOutput contains a key "probability" AND its value is a Number AND its value is >= 0.0 AND its value is <= 1.0 THEN
        RETURN llmOutput.probability
    END IF

    // TDD ANCHOR: TEST with a missing probability field in the llmOutput.
    // TDD ANCHOR: TEST with a non-numeric probability field in the llmOutput.
    // TDD ANCHOR: TEST with an out-of-range (e.g., > 1.0) probability field.
    LOG "WARN" message: "No valid probability found in LLM output. Using default score. Context: " + stringify(context)

    // Return a neutral default score if no valid probability is found.
    RETURN 0.5

END FUNCTION
```

---

## 3. Function-- `calculateFinalScore`

### 3.1. Purpose

Calculates a final, reconciled confidence score from an array of evidence provided by different workers.

### 3.2. Pseudocode

```pseudocode
FUNCTION calculateFinalScore(evidenceArray)
    // Takes an array of evidence objects.
    // Returns an object with the final score and a conflict flag.

    INPUT:
        evidenceArray: Array -- An array of evidence objects like { sourceWorker, initialScore, foundRelationship }.

    OUTPUT:
        Object -- An object like { finalScore: Number, hasConflict: Boolean }.

    // TDD ANCHOR: TEST with a null or empty evidenceArray, should return a neutral/zero state.
    IF evidenceArray IS NULL OR evidenceArray is empty THEN
        RETURN { finalScore: 0.0, hasConflict: false }
    END IF

    // Initialize state from the first piece of evidence.
    LET baseEvidence = evidenceArray[0]
    LET currentScore = baseEvidence.initialScore

    LET agreements = 0
    LET disagreements = 0

    // TDD ANCHOR: TEST with a single piece of evidence (both found and not found).
    // Process all items to correctly count agreements and disagreements.
    FOR EACH evidenceItem IN evidenceArray
        IF evidenceItem.foundRelationship IS TRUE THEN
            agreements = agreements + 1
        ELSE
            disagreements = disagreements + 1
        END IF
    END FOR

    // Re-initialize score and process subsequent items for boosting/penalizing.
    // We skip the first item since its score is the baseline.
    LET subsequentEvidence = all elements of evidenceArray starting from the second one.
    FOR EACH evidenceItem IN subsequentEvidence
        // TDD ANCHOR: TEST score boosting with multiple agreeing workers.
        IF evidenceItem.foundRelationship IS TRUE THEN
            // Apply boost formula-- score + (1 - score) * 0.2
            currentScore = currentScore + (1.0 - currentScore) * 0.2
        // TDD ANCHOR: TEST score penalty with a disagreeing worker.
        ELSE
            // Apply penalty formula-- score * 0.5
            currentScore = currentScore * 0.5
        END IF
    END FOR

    // TDD ANCHOR: TEST conflict detection when at least one worker agrees and one disagrees.
    LET hasConflict = (agreements > 0 AND disagreements > 0)

    // TDD ANCHOR: TEST score clamping to ensure it never exceeds 1.0.
    // TDD ANCHOR: TEST score clamping to ensure it never goes below 0.0.
    LET finalScore = max(0.0, min(1.0, currentScore))

    RETURN { finalScore: finalScore, hasConflict: hasConflict }

END FUNCTION