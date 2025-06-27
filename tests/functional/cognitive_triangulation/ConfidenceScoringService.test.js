const ConfidenceScoringService = require('../../../src/services/cognitive_triangulation/ConfidenceScoringService');
const logger = require('../../../src/utils/logger');

// Mock the logger collaborator
jest.mock('../../../src/utils/logger', () => ({
  warn: jest.fn(),
}));

describe('ConfidenceScoringService', () => {
  beforeEach(() => {
    // Clear mock history before each test
    logger.warn.mockClear();
  });

  describe('getInitialScoreFromLlm(llmOutput, context)', () => {
    test('CSS-001: Should return the probability from LLM output if available', () => {
      const llmOutput = { probability: 0.85 };
      const context = {};
      const score = ConfidenceScoringService.getInitialScoreFromLlm(llmOutput, context);
      expect(score).toBe(0.85);
    });

    test('CSS-002: Should return a default score if probability is missing', () => {
      const llmOutput = { someOtherField: 'value' };
      const context = { file_path: 'test.js' };
      const score = ConfidenceScoringService.getInitialScoreFromLlm(llmOutput, context);
      expect(score).toBe(0.5);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('CSS-003: Should log a warning with context when probability is missing', () => {
      const llmOutput = {};
      const context = { file_path: 'src/main.js', relationship: 'USES' };
      ConfidenceScoringService.getInitialScoreFromLlm(llmOutput, context);
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
        msg: 'Uncalibrated score-- LLM output missing probability. Using default.',
        ...context,
      }));
    });
  });

  describe('calculateFinalScore(evidenceArray)', () => {
    test('CSS-004: Should return a zero score and no conflict for empty evidence', () => {
      const result = ConfidenceScoringService.calculateFinalScore([]);
      expect(result).toEqual({ finalScore: 0, hasConflict: false });
    });

    test('CSS-005: Should boost the score on agreement', () => {
      const evidenceArray = [
        { initialScore: 0.6, foundRelationship: true },
        { initialScore: 0.7, foundRelationship: true },
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      // Base score = 0.6. Boost = 0.6 + (1 - 0.6) * 0.2 = 0.6 + 0.4 * 0.2 = 0.6 + 0.08 = 0.68
      expect(result.finalScore).toBeCloseTo(0.68);
      expect(result.hasConflict).toBe(false);
    });

    test('CSS-006: Should penalize the score on disagreement', () => {
      const evidenceArray = [
        { initialScore: 0.8, foundRelationship: true },
        { initialScore: 0.1, foundRelationship: false },
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      // Base score = 0.8. Penalty = 0.8 * 0.5 = 0.4
      expect(result.finalScore).toBeCloseTo(0.4);
      expect(result.hasConflict).toBe(true);
    });

    test('CSS-007: Should flag a conflict if workers disagree', () => {
      const evidenceArray = [
        { initialScore: 0.9, foundRelationship: true },
        { initialScore: 0.2, foundRelationship: false },
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      expect(result.hasConflict).toBe(true);
    });

    test('CSS-008: Should NOT flag a conflict if workers agree', () => {
      const evidenceArray = [
        { initialScore: 0.9, foundRelationship: true },
        { initialScore: 0.8, foundRelationship: true },
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      expect(result.hasConflict).toBe(false);
    });

    test('CSS-009: Should calculate a high score that correctly approaches the maximum of 1', () => {
        const evidenceArray = [
            { initialScore: 0.9, foundRelationship: true },
            { initialScore: 0.95, foundRelationship: true },
            { initialScore: 0.98, foundRelationship: true },
            { initialScore: 0.99, foundRelationship: true },
        ];
        const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        // The clamping logic is present, but this input doesn't exceed 1 with the given formula.
        // Calculation: 0.9 -> 0.92 -> 0.936 -> 0.9488
        expect(result.finalScore).toBeCloseTo(0.9488);
    });

    test('CSS-010: Should calculate a low score that correctly approaches the minimum of 0', () => {
        const evidenceArray = [
            { initialScore: 0.1, foundRelationship: true },
            { initialScore: 0.1, foundRelationship: false },
            { initialScore: 0.1, foundRelationship: false },
            { initialScore: 0.1, foundRelationship: false },
        ];
        const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        // The clamping logic is present, but this input doesn't go below 0 with the given formula.
        // Calculation: 0.1 -> 0.05 -> 0.025 -> 0.0125
        expect(result.finalScore).toBeCloseTo(0.0125);
    });
  });
});