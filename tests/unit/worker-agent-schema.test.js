/**
 * WorkerAgent Schema Validation Tests
 * 
 * Tests that WorkerAgent correctly processes files according to the schema
 * defined in the JsonSchemaValidator prompt. These tests define what
 * "correct analysis" means for individual files.
 */

const { WorkerAgent } = require('../../src/agents/WorkerAgent');
const { JsonSchemaValidator } = require('../../src/utils/jsonSchemaValidator');
const fs = require('fs').promises;
const path = require('path');

// Mock LLM client for controlled testing
class MockLLMClient {
  constructor(mockResponse) {
    this.mockResponse = mockResponse;
  }

  async call(prompt) {
    return { body: this.mockResponse };
  }
}

// Mock database for testing
class MockDatabase {
  constructor() {
    this.queries = [];
    this.results = [];
  }

  async execute(query, params = []) {
    this.queries.push({ query, params });
    return { changes: 1 };
  }

  async querySingle(query, params = []) {
    this.queries.push({ query, params });
    return null;
  }
}

describe('WorkerAgent Schema Validation Tests', () => {
  let validator;
  let mockDb;

  beforeEach(() => {
    validator = new JsonSchemaValidator();
    mockDb = new MockDatabase();
  });

  describe('Entity Extraction Requirements', () => {
    test('Should extract Function entities with correct qualifiedName format', () => {
      const mockResponse = {
        filePath: "C:\\code\\aback\\src\\utils\\config.js",
        entities: [
          {
            type: "File",
            name: "config.js",
            qualifiedName: "C:\\code\\aback\\src\\utils\\config.js"
          },
          {
            type: "Function",
            name: "loadConfig",
            qualifiedName: "C:\\code\\aback\\src\\utils\\config.js--loadConfig"
          },
          {
            type: "Variable",
            name: "defaultConfig",
            qualifiedName: "C:\\code\\aback\\src\\utils\\config.js--defaultConfig"
          }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\code\\aback\\src\\utils\\config.js",
            target_qualifiedName: "C:\\code\\aback\\src\\utils\\config.js--loadConfig",
            type: "CONTAINS"
          },
          {
            source_qualifiedName: "C:\\code\\aback\\src\\utils\\config.js",
            target_qualifiedName: "C:\\code\\aback\\src\\utils\\config.js--defaultConfig",
            type: "CONTAINS"
          }
        ]
      };

      const result = validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);

      expect(result.entities).toHaveLength(3);
      expect(result.entities[0].type).toBe('File');
      expect(result.entities[1].type).toBe('Function');
      expect(result.entities[2].type).toBe('Variable');

      // Validate qualifiedName format
      expect(result.entities[1].qualifiedName).toBe('C:\\code\\aback\\src\\utils\\config.js--loadConfig');
      expect(result.entities[2].qualifiedName).toBe('C:\\code\\aback\\src\\utils\\config.js--defaultConfig');
    });

    test('Should extract Class entities with inheritance relationships', () => {
      const mockResponse = {
        filePath: "C:\\code\\aback\\src\\agents\\WorkerAgent.js",
        entities: [
          {
            type: "File",
            name: "WorkerAgent.js",
            qualifiedName: "C:\\code\\aback\\src\\agents\\WorkerAgent.js"
          },
          {
            type: "Class",
            name: "WorkerAgent",
            qualifiedName: "C:\\code\\aback\\src\\agents\\WorkerAgent.js--WorkerAgent"
          },
          {
            type: "Class",
            name: "LlmCallFailedError",
            qualifiedName: "C:\\code\\aback\\src\\agents\\WorkerAgent.js--LlmCallFailedError"
          }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\code\\aback\\src\\agents\\WorkerAgent.js",
            target_qualifiedName: "C:\\code\\aback\\src\\agents\\WorkerAgent.js--WorkerAgent",
            type: "CONTAINS"
          },
          {
            source_qualifiedName: "C:\\code\\aback\\src\\agents\\WorkerAgent.js--LlmCallFailedError",
            target_qualifiedName: "Error",
            type: "EXTENDS"
          }
        ]
      };

      const result = validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);

      expect(result.entities).toHaveLength(3);
      expect(result.relationships).toHaveLength(2);
      
      const extendsRel = result.relationships.find(r => r.type === 'EXTENDS');
      expect(extendsRel).toBeDefined();
      expect(extendsRel.source_qualifiedName).toContain('LlmCallFailedError');
    });

    test('Should handle external dependencies correctly', () => {
      const mockResponse = {
        filePath: "C:\\code\\aback\\src\\utils\\deepseekClient.js",
        entities: [
          {
            type: "File",
            name: "deepseekClient.js",
            qualifiedName: "C:\\code\\aback\\src\\utils\\deepseekClient.js"
          },
          {
            type: "Class",
            name: "DeepSeekClient",
            qualifiedName: "C:\\code\\aback\\src\\utils\\deepseekClient.js--DeepSeekClient"
          }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\code\\aback\\src\\utils\\deepseekClient.js",
            target_qualifiedName: "openai--openai",
            type: "IMPORTS"
          },
          {
            source_qualifiedName: "C:\\code\\aback\\src\\utils\\deepseekClient.js",
            target_qualifiedName: "dotenv--dotenv",
            type: "IMPORTS"
          },
          {
            source_qualifiedName: "C:\\code\\aback\\src\\utils\\deepseekClient.js",
            target_qualifiedName: "C:\\code\\aback\\src\\utils\\deepseekClient.js--DeepSeekClient",
            type: "CONTAINS"
          }
        ]
      };

      const result = validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);

      expect(result.relationships).toHaveLength(3);
      
      const importRels = result.relationships.filter(r => r.type === 'IMPORTS');
      expect(importRels).toHaveLength(2);
      
      // External dependencies should use module--module format
      expect(importRels[0].target_qualifiedName).toBe('openai--openai');
      expect(importRels[1].target_qualifiedName).toBe('dotenv--dotenv');
    });
  });

  describe('Relationship Type Validation', () => {
    test('Should validate all required relationship types', () => {
      const validTypes = ['CONTAINS', 'CALLS', 'USES', 'IMPORTS', 'EXPORTS', 'EXTENDS'];
      
      validTypes.forEach(type => {
        const mockResponse = {
          filePath: "C:\\test\\file.js",
          entities: [
            { type: "File", name: "file.js", qualifiedName: "C:\\test\\file.js" },
            { type: "Function", name: "testFunc", qualifiedName: "C:\\test\\file.js--testFunc" }
          ],
          relationships: [
            {
              source_qualifiedName: "C:\\test\\file.js",
              target_qualifiedName: "C:\\test\\file.js--testFunc",
              type: type
            }
          ]
        };

        expect(() => {
          validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);
        }).not.toThrow();
      });
    });

    test('Should reject invalid relationship types', () => {
      const mockResponse = {
        filePath: "C:\\test\\file.js",
        entities: [
          { type: "File", name: "file.js", qualifiedName: "C:\\test\\file.js" }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\test\\file.js",
            target_qualifiedName: "C:\\test\\file.js--testFunc",
            type: "INVALID_TYPE"
          }
        ]
      };

      expect(() => {
        validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);
      }).toThrow();
    });
  });

  describe('File Type Specific Requirements', () => {
    test('Should handle JavaScript files with require() statements', () => {
      const mockResponse = {
        filePath: "C:\\code\\aback\\src\\agents\\ScoutAgent.js",
        entities: [
          {
            type: "File",
            name: "ScoutAgent.js",
            qualifiedName: "C:\\code\\aback\\src\\agents\\ScoutAgent.js"
          },
          {
            type: "Class",
            name: "ScoutAgent",
            qualifiedName: "C:\\code\\aback\\src\\agents\\ScoutAgent.js--ScoutAgent"
          }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\code\\aback\\src\\agents\\ScoutAgent.js",
            target_qualifiedName: "crypto--crypto",
            type: "IMPORTS"
          },
          {
            source_qualifiedName: "C:\\code\\aback\\src\\agents\\ScoutAgent.js",
            target_qualifiedName: "path--path",
            type: "IMPORTS"
          },
          {
            source_qualifiedName: "C:\\code\\aback\\src\\agents\\ScoutAgent.js",
            target_qualifiedName: "fs--fs",
            type: "IMPORTS"
          }
        ]
      };

      const result = validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);

      expect(result.entities).toHaveLength(2);
      expect(result.relationships).toHaveLength(3);
      
      // All imports should be Node.js built-ins
      const imports = result.relationships.filter(r => r.type === 'IMPORTS');
      expect(imports).toHaveLength(3);
      expect(imports.map(i => i.target_qualifiedName)).toEqual([
        'crypto--crypto',
        'path--path', 
        'fs--fs'
      ]);
    });

    test('Should handle JSON files appropriately', () => {
      const mockResponse = {
        filePath: "C:\\code\\aback\\package.json",
        entities: [
          {
            type: "File",
            name: "package.json",
            qualifiedName: "C:\\code\\aback\\package.json"
          },
          {
            type: "Variable",
            name: "dependencies",
            qualifiedName: "C:\\code\\aback\\package.json--dependencies"
          }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\code\\aback\\package.json",
            target_qualifiedName: "C:\\code\\aback\\package.json--dependencies",
            type: "CONTAINS"
          }
        ]
      };

      const result = validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);

      expect(result.entities).toHaveLength(2);
      expect(result.entities[0].type).toBe('File');
      expect(result.entities[1].type).toBe('Variable');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('Should handle files with no entities gracefully', () => {
      const mockResponse = {
        filePath: "C:\\code\\aback\\empty.js",
        entities: [
          {
            type: "File",
            name: "empty.js",
            qualifiedName: "C:\\code\\aback\\empty.js"
          }
        ],
        relationships: []
      };

      const result = validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);

      expect(result.entities).toHaveLength(1);
      expect(result.relationships).toHaveLength(0);
      expect(result.entities[0].type).toBe('File');
    });

    test('Should reject malformed qualifiedName formats', () => {
      const mockResponse = {
        filePath: "C:\\test\\file.js",
        entities: [
          { type: "File", name: "file.js", qualifiedName: "C:\\test\\file.js" },
          { type: "Function", name: "testFunc", qualifiedName: "INVALID_FORMAT" }
        ],
        relationships: []
      };

      expect(() => {
        validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);
      }).toThrow();
    });

    test('Should require all mandatory entity fields', () => {
      const mockResponse = {
        filePath: "C:\\test\\file.js",
        entities: [
          { type: "Function", name: "testFunc" } // Missing qualifiedName
        ],
        relationships: []
      };

      expect(() => {
        validator.validateAndNormalize(JSON.stringify(mockResponse), mockResponse.filePath);
      }).toThrow();
    });
  });

  describe('WorkerAgent Integration with Schema', () => {
    test('WorkerAgent should process valid LLM response correctly', async () => {
      const validResponse = {
        filePath: "C:\\code\\aback\\test.js",
        entities: [
          { type: "File", name: "test.js", qualifiedName: "C:\\code\\aback\\test.js" },
          { type: "Function", name: "testFunc", qualifiedName: "C:\\code\\aback\\test.js--testFunc" }
        ],
        relationships: [
          {
            source_qualifiedName: "C:\\code\\aback\\test.js",
            target_qualifiedName: "C:\\code\\aback\\test.js--testFunc",
            type: "CONTAINS"
          }
        ]
      };

      const mockLLM = new MockLLMClient(JSON.stringify(validResponse));
      const worker = new WorkerAgent(mockDb, mockLLM, 'C:/code/aback');

      const task = {
        id: 1,
        file_path: 'test.js',
        content_hash: 'abc123'
      };

      // Should not throw
      await expect(worker.processTask(task)).resolves.not.toThrow();
    });

    test('WorkerAgent should handle LLM validation failures', async () => {
      const invalidResponse = {
        filePath: "C:\\code\\aback\\test.js",
        entities: [
          { type: "INVALID_TYPE", name: "test", qualifiedName: "invalid" }
        ],
        relationships: []
      };

      const mockLLM = new MockLLMClient(JSON.stringify(invalidResponse));
      const worker = new WorkerAgent(mockDb, mockLLM, 'C:/code/aback');

      const task = {
        id: 1,
        file_path: 'test.js',
        content_hash: 'abc123'
      };

      // Should handle validation error gracefully
      await expect(worker.processTask(task)).resolves.not.toThrow();
      
      // Should have logged the failure (checked via batch processor)
    });
  });
}); 