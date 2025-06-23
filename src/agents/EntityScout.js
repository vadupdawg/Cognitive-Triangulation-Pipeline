const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');
const LLMResponseSanitizer = require('../utils/LLMResponseSanitizer');
const DeepseekClient = require('../utils/deepseekClient'); 
const { POI_SCHEMA, FILE_ANALYSIS_SCHEMA } = require('../utils/jsonSchemaValidator');
const Ajv = require('ajv');
const ajv = new Ajv();

const config = require('../config');

class EntityScout {
    constructor(options = {}) {
        this.config = { ...config, ...options };
        this.llmClient = new DeepseekClient();
        this.validatePoiList = ajv.compile(POI_SCHEMA);
    }

    _calculateChecksum(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    _generatePrompt(fileContent) {
        return `
You are an expert software engineer and code analyst. Your task is to analyze the provided source code file and extract key entities (like classes, functions, variables). Your output must be a single, valid JSON object, and nothing else. Do not include any explanatory text or markdown formatting before or after the JSON.

Your output MUST conform to the following JSON schema:
{
  "pois": [
    {
      "name": "The name of the identified entity (e.g., function name, class name).",
      "type": "The type of the POI (e.g., FunctionDefinition, ClassDefinition).",
      "startLine": "The starting line number of the POI.",
      "endLine": "The ending line number of the POI.",
      "confidence": "A score from 0 to 1 indicating the LLM's confidence."
    }
  ]
}

Analyze the following code:
\`\`\`
${fileContent}
\`\`\`
`;
    }

    _generateCorrectionPrompt(fileContent, invalidOutput, validationError) {
        const errorMessage = validationError.errors ? validationError.errors.map(e => e.message).join(', ') : validationError.message;
        return `
Your previous attempt to analyze the source code and extract entities resulted in an error.
You must correct your last output. Please pay close attention to the error message and the required format.

**Error Message:**
${errorMessage}

**Your Invalid Output:**
\`\`\`json
${invalidOutput}
\`\`\`

Please analyze the following source code again and provide a new, valid JSON output that corrects the error.
Ensure your response strictly adheres to the required JSON schema and correctly represents the entities in the code.

**Original Source Code:**
\`\`\`
${fileContent}
\`\`\`

Corrected JSON Output:
`;
    }

    async _analyzeFileContent(fileContent, filePath) {
        let currentPrompt = this._generatePrompt(fileContent, filePath);
        let attempts = 0;
        let lastError = null;

        while (attempts <= this.config.maxRetries) {
            attempts++;
            const rawResponse = await this.llmClient.query(currentPrompt);
            const sanitizedResponse = LLMResponseSanitizer.sanitize(rawResponse);

            try {
                const parsedJson = JSON.parse(sanitizedResponse);
                if (this.validatePoiList(parsedJson)) {
                    return { pois: parsedJson.pois, attempts: attempts, error: null };
                } else {
                    lastError = new Error(`Schema validation failed: ${ajv.errorsText(this.validatePoiList.errors)}`);
                    currentPrompt = this._generateCorrectionPrompt(fileContent, sanitizedResponse, lastError);
                }
            } catch (error) {
                lastError = error;
                currentPrompt = this._generateCorrectionPrompt(fileContent, sanitizedResponse, error);
            }
        }
        
        console.error(`Final attempt failed for ${filePath}. Error: ${lastError.message}`);
        return { pois: [], attempts: attempts, error: new Error(`Failed to get valid JSON response after ${this.config.maxRetries + 1} attempts. Last error: ${lastError.message}`) };
    }

    async run(filePath) {
        try {
            const stats = await fs.stat(filePath);
            if (stats.size > this.config.maxFileSize) {
                return {
                    filePath,
                    fileChecksum: null,
                    language: path.extname(filePath).substring(1),
                    pois: [],
                    status: 'SKIPPED_FILE_TOO_LARGE',
                    error: `File size ${stats.size} exceeds the maximum allowed size of ${this.config.maxFileSize} bytes.`,
                    analysisAttempts: 0,
                };
            }

            const fileContent = await fs.readFile(filePath, 'utf-8');
            const fileChecksum = this._calculateChecksum(fileContent);

            if (fileContent.trim() === '') {
                 return {
                    filePath,
                    fileChecksum,
                    language: path.extname(filePath).substring(1),
                    pois: [],
                    status: 'COMPLETED_SUCCESS',
                    error: null,
                    analysisAttempts: 1, 
                };
            }

            const { pois, attempts, error } = await this._analyzeFileContent(fileContent, filePath);

            if (error) {
                return {
                    filePath,
                    fileChecksum,
                    language: path.extname(filePath).substring(1),
                    pois: [],
                    status: 'FAILED_VALIDATION_ERROR',
                    error: error.message,
                    analysisAttempts: attempts,
                };
            }

            return {
                filePath,
                fileChecksum,
                language: path.extname(filePath).substring(1),
                pois,
                status: 'COMPLETED_SUCCESS',
                error: null,
                analysisAttempts: attempts,
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    filePath,
                    fileChecksum: null,
                    language: path.extname(filePath).substring(1),
                    pois: [],
                    status: 'FAILED_FILE_NOT_FOUND',
                    error: error.message,
                    analysisAttempts: 0,
                };
            }
            // Generic error
            return {
                filePath,
                fileChecksum: null,
                language: path.extname(filePath).substring(1),
                pois: [],
                status: 'FAILED_LLM_API_ERROR',
                error: error.message,
                analysisAttempts: 0,
            };
        }
    }
}

module.exports = EntityScout;