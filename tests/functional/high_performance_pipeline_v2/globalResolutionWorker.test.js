const { v4: uuidv4 } = require('uuid');
const GlobalResolutionWorker = require('../../../src/workers/globalResolutionWorker');

jest.mock('../../../src/utils/logger');

describe('GlobalResolutionWorker Functional Tests', () => {
    let globalResolutionWorker;
    let mockLlmClient;
    let mockDbClient;
    let runId;

    beforeEach(() => {
        runId = uuidv4();

        mockLlmClient = {
            query: jest.fn().mockResolvedValue(JSON.stringify({
                relationships: [{ from: '/path/to/dirA', to: '/path/to/dirB', type: 'USES' }]
            }))
        };
        mockDbClient = {
            execute: jest.fn().mockResolvedValue(true),
            beginTransaction: jest.fn().mockResolvedValue(true),
            commit: jest.fn().mockResolvedValue(true),
            rollback: jest.fn().mockResolvedValue(true)
        };

        // Pass null for queueManager as it's not used when processOnly is true
        globalResolutionWorker = new GlobalResolutionWorker(null, mockLlmClient, mockDbClient, { processOnly: true });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('GRW-01: Should process dependent summaries and save resolved relationships', async () => {
        const summaryA = { directory_path: '/path/to/dirA', summary_text: 'Directory A uses utilities.' };
        const summaryB = { directory_path: '/path/to/dirB', summary_text: 'Directory B provides utilities.' };
        
        const mockJob = {
            id: uuidv4(),
            data: { runId },
            getDependencies: jest.fn().mockResolvedValue({
                processed: [JSON.stringify(summaryA), JSON.stringify(summaryB)]
            })
        };

        await globalResolutionWorker.processJob(mockJob);

        expect(mockJob.getDependencies).toHaveBeenCalledTimes(1);
        expect(mockLlmClient.query).toHaveBeenCalledTimes(1);
        const promptSentToLlm = mockLlmClient.query.mock.calls[0][0];
        expect(promptSentToLlm).toContain('<data>\nDirectory: /path/to/dirA\nSummary: Directory A uses utilities.\n</data>');
        expect(promptSentToLlm).toContain('<data>\nDirectory: /path/to/dirB\nSummary: Directory B provides utilities.\n</data>');

        expect(mockDbClient.beginTransaction).toHaveBeenCalledTimes(1);
        expect(mockDbClient.execute).toHaveBeenCalledTimes(1);
        const executedQuery = mockDbClient.execute.mock.calls[0][1];
        const executedValues = mockDbClient.execute.mock.calls[0][2];
        expect(executedQuery).toContain('INSERT INTO relationships');
        expect(executedValues).toEqual(['/path/to/dirA', '/path/to/dirB', 'USES', 'global']);
        expect(mockDbClient.commit).toHaveBeenCalledTimes(1);
        expect(mockDbClient.rollback).not.toHaveBeenCalled();
    });

    test('GRW-03: Should fail gracefully if job data is missing runId', async () => {
        const mockJob = {
            id: uuidv4(),
            data: {}, // Missing runId
        };

        await expect(globalResolutionWorker.processJob(mockJob)).rejects.toThrow('Job data must include a runId.');

        expect(mockLlmClient.query).not.toHaveBeenCalled();
        expect(mockDbClient.execute).not.toHaveBeenCalled();
    });

    test('GRW-04: Should handle empty dependencies gracefully', async () => {
        const mockJob = {
            id: uuidv4(),
            data: { runId },
            getDependencies: jest.fn().mockResolvedValue({ processed: [] })
        };

        await globalResolutionWorker.processJob(mockJob);

        expect(mockLlmClient.query).not.toHaveBeenCalled();
        expect(mockDbClient.execute).not.toHaveBeenCalled();
    });

    test('GRW-05: Should handle LLM error gracefully', async () => {
        const errorMessage = 'LLM error';
        mockLlmClient.query.mockRejectedValue(new Error(errorMessage));

        const summaryA = { directory_path: '/path/to/dirA', summary_text: 'Directory A uses utilities.' };
        const mockJob = {
            id: uuidv4(),
            data: { runId },
            getDependencies: jest.fn().mockResolvedValue({ processed: [JSON.stringify(summaryA)] })
        };

        await expect(globalResolutionWorker.processJob(mockJob)).rejects.toThrow(errorMessage);
        expect(mockDbClient.beginTransaction).not.toHaveBeenCalled();
    });

    test('GRW-06: Should handle database error gracefully and rollback', async () => {
        const errorMessage = 'DB error';
        mockDbClient.execute.mockRejectedValue(new Error(errorMessage));

        const summaryA = { directory_path: '/path/to/dirA', summary_text: 'Directory A uses utilities.' };
        const mockJob = {
            id: uuidv4(),
            data: { runId },
            getDependencies: jest.fn().mockResolvedValue({ processed: [JSON.stringify(summaryA)] })
        };

        await expect(globalResolutionWorker.processJob(mockJob)).rejects.toThrow(errorMessage);

        expect(mockDbClient.beginTransaction).toHaveBeenCalledTimes(1);
        expect(mockDbClient.rollback).toHaveBeenCalledTimes(1);
        expect(mockDbClient.commit).not.toHaveBeenCalled();
    });
});