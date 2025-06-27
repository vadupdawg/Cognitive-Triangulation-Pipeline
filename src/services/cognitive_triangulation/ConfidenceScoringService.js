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
   * Calculates a final, reconciled confidence score from an array of evidence.
   * @param {Array<object>} evidenceArray - Array of evidence objects from workers.
   * @returns {{finalScore: number, hasConflict: boolean}}
   */
  static calculateFinalScore(evidenceArray) {
    if (!evidenceArray || evidenceArray.length === 0) {
      return { finalScore: 0, hasConflict: false };
    }

    let finalScore = evidenceArray[0].initialScore;
    const agreements = evidenceArray.filter(e => e.foundRelationship).length;
    const disagreements = evidenceArray.filter(e => !e.foundRelationship).length;

    const hasConflict = agreements > 0 && disagreements > 0;

    // Start from the second piece of evidence to apply boosts/penalties
    for (let i = 1; i < evidenceArray.length; i++) {
      const evidence = evidenceArray[i];
      if (evidence.foundRelationship) {
        // Apply agreement boost: score + (1 - score) * 0.2
        finalScore = finalScore + (1 - finalScore) * 0.2;
      } else {
        // Apply disagreement penalty: score * 0.5
        finalScore = finalScore * 0.5;
      }
    }

    // Clamp the score to be within [0, 1]
    const clampedScore = Math.max(0, Math.min(1, finalScore));

    return {
      finalScore: clampedScore,
      hasConflict: hasConflict,
    };
  }
}

module.exports = ConfidenceScoringService;