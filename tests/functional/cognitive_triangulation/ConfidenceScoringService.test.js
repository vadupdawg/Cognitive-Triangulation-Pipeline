const ConfidenceScoringService = require('../../../src/services/cognitive_triangulation/ConfidenceScoringService');
const logger = require('../../../src/utils/logger');

// Mock the logger to spy on its methods
jest.mock('../../../src/utils/logger', () => ({
  warn: jest.fn(),
}));

describe('ConfidenceScoringService', () => {
  afterEach(() => {
    // Clear mock history after each test
    jest.clearAllMocks();
  });

  describe('getInitialScoreFromLlm', () => {
    test('should return the probability from LLM output if available', () => {
      // Test Case 1.1.1
      const llmOutput = { "relationship": "...", "probability": 0.85 };
      const context = { "file_path": "test.js" };
      const score = ConfidenceScoringService.getInitialScoreFromLlm(llmOutput, context);
      expect(score).toBe(0.85);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('should return a default score and log a warning if probability is missing', () => {
      // Test Case 1.1.2
      const llmOutput = { "relationship": "..." };
      const context = { "file_path": "test.js", "relationship": "A -> B" };
      const score = ConfidenceScoringService.getInitialScoreFromLlm(llmOutput, context);
      
      expect(score).toBe(0.5);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith({
        msg: 'Uncalibrated score-- LLM output missing probability. Using default.',
        ...context,
      });
    });
  });

  describe('calculateFinalScore', () => {
    test('should boost the score on agreement according to the defined formula', () => {
      // Test Case 1.2.1
      const evidenceArray = [
        { sourceWorker: 'File', initialScore: 0.6, foundRelationship: true },
        { sourceWorker: 'Directory', initialScore: 0.7, foundRelationship: true }
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      expect(result.finalScore).toBeCloseTo(0.68); // 0.6 + (1 - 0.6) * 0.2
      expect(result.hasConflict).toBe(false);
    });

    test('should penalize the score on disagreement according to the defined formula', () => {
      // Test Case 1.2.2
      const evidenceArray = [
        { sourceWorker: 'File', initialScore: 0.8, foundRelationship: true },
        { sourceWorker: 'Directory', initialScore: 0.1, foundRelationship: false }
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      expect(result.finalScore).toBeCloseTo(0.4); // 0.8 * 0.5
      expect(result.hasConflict).toBe(true);
    });

    test('should flag a conflict if workers disagree', () => {
      // Test Case 1.2.3
      const evidenceArray = [
        { sourceWorker: 'File', initialScore: 0.9, foundRelationship: true },
        { sourceWorker: 'Directory', initialScore: 0.2, foundRelationship: false },
        { sourceWorker: 'Global', initialScore: 0.8, foundRelationship: true }
      ];
      const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
      expect(result.hasConflict).toBe(true);
    });

    test('should clamp the final score to be less than or equal to 1.0', () => {
        // Test Case 1.2.4 (Upper Clamp)
        const evidenceArray = [
            { sourceWorker: 'File', initialScore: 0.9, foundRelationship: true },
            { sourceWorker: 'Directory', initialScore: 0.9, foundRelationship: true },
            { sourceWorker: 'Global', initialScore: 0.9, foundRelationship: true },
            { sourceWorker: 'Extra1', initialScore: 0.9, foundRelationship: true },
            { sourceWorker: 'Extra2', initialScore: 0.9, foundRelationship: true },
            { sourceWorker: 'Extra3', initialScore: 0.9, foundRelationship: true },
        ];
        const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        expect(result.finalScore).toBeLessThanOrEqual(1.0);
    });

    test('should clamp the final score to be greater than or equal to 0.0', () => {
        // Test Case 1.2.4 (Lower Clamp)
        const evidenceArray = [
            { sourceWorker: 'File', initialScore: 0.1, foundRelationship: true },
            { sourceWorker: 'Directory', initialScore: 0.1, foundRelationship: false },
            { sourceWorker: 'Global', initialScore: 0.1, foundRelationship: false },
            { sourceWorker: 'Extra1', initialScore: 0.1, foundRelationship: false },
            { sourceWorker: 'Extra2', initialScore: 0.1, foundRelationship: false },
            { sourceWorker: 'Extra3', initialScore: 0.1, foundRelationship: false },
        ];
        const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        expect(result.finalScore).toBeGreaterThanOrEqual(0.0);
    });


    test('should handle empty or null input gracefully', () => {
      // Test Case 1.2.5
      const resultEmpty = ConfidenceScoringService.calculateFinalScore([]);
      expect(resultEmpty).toEqual({ finalScore: 0, hasConflict: false });

      const resultNull = ConfidenceScoringService.calculateFinalScore(null);
      expect(resultNull).toEqual({ finalScore: 0, hasConflict: false });
    });

    describe('Validation Logic', () => {
      test('should return a default score if the first evidence object is invalid', () => {
        // Test Case: First evidence is null
        let evidenceArray = [null, { initialScore: 0.5, foundRelationship: true }];
        let result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        expect(result).toEqual({ finalScore: 0, hasConflict: false });
        expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ msg: 'Invalid first evidence object. Returning default score.' }));

        // Test Case: First evidence is missing initialScore
        evidenceArray = [{ foundRelationship: true }, { initialScore: 0.5, foundRelationship: true }];
        result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        expect(result).toEqual({ finalScore: 0, hasConflict: false });

        // Test Case: First evidence is missing foundRelationship
        evidenceArray = [{ initialScore: 0.5 }, { initialScore: 0.5, foundRelationship: true }];
        result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        expect(result).toEqual({ finalScore: 0, hasConflict: false });
      });

      test('should skip malformed evidence objects after the first one', () => {
        const evidenceArray = [
          { initialScore: 0.7, foundRelationship: true },
          null, // Malformed
          { initialScore: 0.1, foundRelationship: false },
          { initialScore: 0.9 }, // Malformed
          { initialScore: 0.8, foundRelationship: true }
        ];

        const result = ConfidenceScoringService.calculateFinalScore(evidenceArray);
        
        // Calculation should be:
        // 1. Start with 0.7
        // 2. Skip null
        // 3. Disagreement: 0.7 * 0.5 = 0.35
        // 4. Skip malformed
        // 5. Agreement: 0.35 + (1 - 0.35) * 0.2 = 0.35 + 0.65 * 0.2 = 0.35 + 0.13 = 0.48

        expect(result.finalScore).toBeCloseTo(0.48);
        expect(result.hasConflict).toBe(true);
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith({ msg: 'Skipping malformed evidence object.', evidence: null });
        expect(logger.warn).toHaveBeenCalledWith({ msg: 'Skipping malformed evidence object.', evidence: { initialScore: 0.9 } });
      });
    });
  });
});