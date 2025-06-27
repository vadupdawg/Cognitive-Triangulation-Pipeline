const logger = require('../../utils/logger');

/**
 * A stateless utility class that centralizes all logic related to the calculation
 * and interpretation of confidence scores.
 */
class ConfidenceScoringService {
  /**
   * Extracts or calculates a preliminary confidence score from the direct output of an LLM.
   * @param {object} llmOutput - The raw JSON object from the LLM.
   * @param {object} context - Contextual information for logging.
   * @returns {number} A preliminary confidence score between 0.0 and 1.0.
   */
  static getInitialScoreFromLlm(llmOutput, context = {}) {
    if (llmOutput && typeof llmOutput.probability === 'number') {
      return Math.max(0, Math.min(1, llmOutput.probability));
    }
    logger.warn({
      msg: 'Uncalibrated score-- LLM output missing probability. Using default.',
      ...context,
    });
    return 0.5; // Default neutral score
  }

  /**
   * Calculates a final, reconciled confidence score from an array of evidence
   * using a single-pass reduce operation for improved efficiency and robustness.
   * @param {Array<object>} evidenceArray - Array of evidence objects from workers.
   *        Each object must have `initialScore` (number) and `foundRelationship` (boolean).
   * @returns {{finalScore: number, hasConflict: boolean}}
   */
  static calculateFinalScore(evidenceArray) {
    if (!evidenceArray || evidenceArray.length === 0) {
      return { finalScore: 0, hasConflict: false };
    }

    // Validate the first element separately to establish a baseline.
    const firstEvidence = evidenceArray[0];
    if (
      !firstEvidence ||
      typeof firstEvidence.initialScore !== 'number' ||
      typeof firstEvidence.foundRelationship !== 'boolean'
    ) {
        logger.warn({
            msg: 'Invalid first evidence object. Returning default score.',
            evidence: firstEvidence,
        });
        return { finalScore: 0, hasConflict: false };
    }

    const initialState = {
      score: firstEvidence.initialScore,
      agreements: firstEvidence.foundRelationship ? 1 : 0,
      disagreements: !firstEvidence.foundRelationship ? 1 : 0,
    };

    const result = evidenceArray.slice(1).reduce((acc, evidence) => {
      // Robustness: Skip malformed evidence objects.
      if (!evidence || typeof evidence.foundRelationship !== 'boolean') {
        logger.warn({ msg: 'Skipping malformed evidence object.', evidence });
        return acc;
      }
      
      if (evidence.foundRelationship) {
        acc.score += (1 - acc.score) * 0.2; // Agreement boost
        acc.agreements += 1;
      } else {
        acc.score *= 0.5; // Disagreement penalty
        acc.disagreements += 1;
      }
      return acc;
    }, initialState);

    return {
      finalScore: Math.max(0, Math.min(1, result.score)),
      hasConflict: result.agreements > 0 && result.disagreements > 0,
    };
  }
}

module.exports = ConfidenceScoringService;