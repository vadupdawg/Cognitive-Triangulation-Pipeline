/**
 * JSON Schema Validator with Guardrails for WorkerAgent Responses
 * Ensures all LLM responses conform to exact schema requirements
 * Uses ABSOLUTE file paths for robust, unambiguous entity identification
 */

const path = require('path');

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class JsonSchemaValidator {
    constructor() {
        this.validEntityTypes = new Set(['Function', 'Class', 'Variable', 'Import', 'Export']);
        this.validRelationshipTypes = new Set(['IMPORTS', 'EXPORTS', 'CALLS', 'USES', 'CONTAINS']);
    }

    /**
     * Detects programming language from file extension
     * @param {string} filePath - Absolute file path
     * @returns {string} - Detected language or 'unknown'
     */
    _detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.js': 'JavaScript',
            '.jsx': 'JavaScript/React',
            '.ts': 'TypeScript', 
            '.tsx': 'TypeScript/React',
            '.py': 'Python',
            '.java': 'Java',
            '.cs': 'C#',
            '.go': 'Go',
            '.rs': 'Rust',
            '.php': 'PHP',
            '.rb': 'Ruby',
            '.cpp': 'C++',
            '.c': 'C',
            '.h': 'C/C++ Header',
            '.hpp': 'C++ Header',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.scala': 'Scala',
            '.clj': 'Clojure',
            '.elm': 'Elm',
            '.dart': 'Dart',
            '.lua': 'Lua',
            '.sh': 'Shell/Bash',
            '.ps1': 'PowerShell',
            '.sql': 'SQL',
            '.xml': 'XML',
            '.json': 'JSON',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.toml': 'TOML',
            '.md': 'Markdown',
            '.html': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.sass': 'Sass',
            '.less': 'Less'
        };
        
        return languageMap[ext] || 'Unknown';
    }

    /**
     * Creates a guardrail prompt that enforces absolute path usage
     * @param {string} filePath - File path (will be converted to absolute)
     * @param {string} fileContent - Content of the file to analyze
     * @returns {Object} - Prompt object for LLM
     */
    createGuardrailPrompt(filePath, fileContent) {
        // Convert to absolute path for robust identification
        const absoluteFilePath = path.resolve(filePath);
        const baseDirectory = path.dirname(absoluteFilePath);
        const detectedLanguage = this._detectLanguage(absoluteFilePath);
        
        // Remove intelligent truncation - not needed for small files
        
        const systemPrompt = `Extract code entities and relationships for Neo4j graph database.

TARGET SCHEMA:
Nodes: (:File), (:Function), (:Class), (:Variable) - identified by qualifiedName
Relationships: [:CONTAINS], [:CALLS], [:USES], [:IMPORTS], [:EXPORTS], [:EXTENDS]

RULES:
1. qualifiedName format: "ABSOLUTE_FILE_PATH--entityName"
2. For imports: resolve relative paths to absolute, keep external packages as-is
3. Detect all programming languages dynamically

RETURN ONLY JSON:`;

        const userPrompt = `Analyze this ${detectedLanguage} file: "${absoluteFilePath}"

\`\`\`
${fileContent}
\`\`\`

Required JSON format:
{
  "filePath": "${absoluteFilePath}",
  "entities": [
    {"type": "Function", "name": "myFunc", "qualifiedName": "${absoluteFilePath}--myFunc"},
    {"type": "Import", "name": "express", "qualifiedName": "express--express"}
  ],
  "relationships": [
    {"source_qualifiedName": "${absoluteFilePath}--myFunc", "target_qualifiedName": "otherFile--otherFunc", "type": "CALLS"}
  ]
}

For imports:
- Relative: "./helper" → resolve to absolute path
- External: "express" → keep as "express--express"
- Base directory: "${baseDirectory}"`;

        return {
            systemPrompt,
            userPrompt
        };
    }

    /**
     * Cleans response by removing markdown wrappers and extra whitespace
     */
    _cleanResponse(response) {
        return response
            .replace(/^```(?:json)?\s*/, '')  // Remove opening markdown
            .replace(/\s*```\s*$/, '')        // Remove closing markdown
            .trim();
    }

    /**
     * Validates basic response structure
     */
    _validateResponseStructure(response, filePath) {
        if (!response || typeof response !== 'object') {
            throw new ValidationError('Response must be an object');
        }
        
        if (!response.filePath || !response.entities || !response.relationships) {
            throw new ValidationError('Missing required fields: filePath, entities, relationships');
        }
        
        if (!Array.isArray(response.entities) || !Array.isArray(response.relationships)) {
            throw new ValidationError('entities and relationships must be arrays');
        }
    }

    /**
     * Normalizes response and ensures absolute paths
     */
    _normalizeResponse(response, filePath) {
        const absoluteFilePath = path.resolve(filePath);
        
        return {
            filePath: absoluteFilePath,
            entities: response.entities || [],
            relationships: response.relationships || []
        };
    }

    /**
     * Validates and normalizes LLM response
     * @param {string} response - Raw LLM response 
     * @param {string} filePath - File path for validation context
     * @returns {Object} - Validated and normalized response
     */
    validateAndNormalize(response, filePath) {
        // Clean response (remove markdown, extra whitespace)
        const cleanResponse = this._cleanResponse(response);
        
        // Parse JSON
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(cleanResponse);
        } catch (error) {
            throw new ValidationError(`Invalid JSON response: ${error.message}`);
        }
        
        // Validate structure
        this._validateResponseStructure(parsedResponse, filePath);
        
        // Normalize response (handle field name variations)
        const normalizedResponse = this._normalizeResponse(parsedResponse, filePath);
        
        return normalizedResponse;
    }

    _stripMarkdownWrapper(text) {
        let cleaned = text.trim();
        
        // Handle various markdown formats
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        return cleaned.trim();
    }
    
    _validateStructure(json) {
        if (!json || typeof json !== 'object') {
            throw new ValidationError('Response must be a JSON object');
        }
        
        if (!json.hasOwnProperty('filePath')) {
            throw new ValidationError('Missing required field: filePath');
        }
        
        if (!json.hasOwnProperty('entities') || !Array.isArray(json.entities)) {
            throw new ValidationError('Missing or invalid field: entities (must be array)');
        }
        
        if (!json.hasOwnProperty('relationships') || !Array.isArray(json.relationships)) {
            throw new ValidationError('Missing or invalid field: relationships (must be array)');
        }
    }
    
    /**
     * Validates entity structure and qualifiedName format
     * @param {Array} entities - Array of entities to validate
     * @param {string} expectedFilePath - Expected file path for validation
     */
    _validateEntities(entities, expectedFilePath) {
        if (!Array.isArray(entities)) {
            throw new ValidationError('entities must be an array');
        }

        entities.forEach((entity, index) => {
            // Validate required fields
            if (!entity.type || !entity.name || !entity.qualifiedName) {
                throw new ValidationError(`Entity ${index}: Missing required fields (type, name, qualifiedName)`);
            }

            // Validate entity type
            if (!this.validEntityTypes.has(entity.type)) {
                throw new ValidationError(`Entity ${index}: Invalid type "${entity.type}". Must be one of: ${Array.from(this.validEntityTypes).join(', ')}`);
            }

            // For Import entities, check if it's an external dependency
            if (entity.type === 'Import') {
                const entityName = entity.name;
                
                // If it's an external dependency, qualifiedName should be "module--entityName"
                if (this._isExternalDependency(entityName)) {
                    const expectedQualifiedName = `${entityName}--${entityName}`;
                    if (entity.qualifiedName !== expectedQualifiedName) {
                        // Allow some flexibility in naming for external dependencies
                        if (!entity.qualifiedName.startsWith(entityName)) {
                            throw new ValidationError(`Entity ${index}: External import qualifiedName "${entity.qualifiedName}" should start with module name "${entityName}"`);
                        }
                    }
                } else {
                    // For local imports, qualifiedName should start with file path
                    if (!entity.qualifiedName.startsWith(expectedFilePath)) {
                        throw new ValidationError(`Entity ${index}: qualifiedName "${entity.qualifiedName}" must start with "${expectedFilePath}--"`);
                    }
                }
            } else {
                // For all other entity types, qualifiedName must start with file path
                if (!entity.qualifiedName.startsWith(expectedFilePath)) {
                    throw new ValidationError(`Entity ${index}: qualifiedName "${entity.qualifiedName}" must start with "${expectedFilePath}--"`);
                }
            }
        });
    }
    
    _validateRelationships(relationships) {
        for (let i = 0; i < relationships.length; i++) {
            const rel = relationships[i];
            
            if (!rel.source_qualifiedName || typeof rel.source_qualifiedName !== 'string') {
                throw new ValidationError(`Relationship ${i}: Missing or invalid source_qualifiedName`);
            }
            
            if (!rel.target_qualifiedName || typeof rel.target_qualifiedName !== 'string') {
                throw new ValidationError(`Relationship ${i}: Missing or invalid target_qualifiedName`);
            }
            
            if (!rel.type || !this.validRelationshipTypes.has(rel.type)) {
                throw new ValidationError(`Relationship ${i}: Invalid type "${rel.type}". Must be one of: ${Array.from(this.validRelationshipTypes).join(', ')}`);
            }
        }
    }

    /**
     * Checks if a path is an external dependency (should not be resolved to absolute path)
     * @param {string} pathStr - Path to check
     * @returns {boolean} - True if external dependency
     */
    _isExternalDependency(pathStr) {
        // Node.js built-ins
        const nodeBuiltins = [
            'fs', 'path', 'http', 'https', 'url', 'os', 'crypto', 'util', 'events',
            'stream', 'buffer', 'child_process', 'cluster', 'readline', 'zlib',
            'assert', 'console', 'process', 'querystring', 'timers', 'tty',
            'dns', 'net', 'dgram', 'vm', 'repl', 'domain', 'punycode', 'string_decoder',
            'worker_threads', 'inspector', 'perf_hooks', 'async_hooks', 'trace_events'
        ];
        
        // Check for Node.js built-ins (including sub-modules like 'fs.promises')
        const baseModule = pathStr.split('.')[0].split('/')[0];
        if (nodeBuiltins.includes(baseModule)) {
            return true;
        }
        
        // Check for npm packages (don't start with . or /)
        if (!pathStr.startsWith('./') && !pathStr.startsWith('../') && !pathStr.startsWith('/')) {
            // Could be npm package, Java package, C# namespace, etc.
            return true;
        }
        
        // Check for language-specific external patterns
        if (pathStr.includes('.') && !pathStr.startsWith('./') && !pathStr.startsWith('../')) {
            // Java packages (com.example.package), C# namespaces (System.Collections), etc.
            return true;
        }
        
        return false;
    }

    /**
     * Enforces absolute path consistency for relationship target_qualifiedName
     * @param {Object} response - Validated response object
     * @returns {Object} - Response with enforced absolute paths
     */
    _enforceAbsolutePathConsistency(response) {
        // Convert relationships to use absolute paths
        if (response.relationships) {
            response.relationships = response.relationships.map(rel => {
                // Extract the path part from target_qualifiedName
                const parts = rel.target_qualifiedName.split('--');
                if (parts.length >= 2) {
                    const targetPath = parts[0];
                    const entityName = parts.slice(1).join('--');
                    
                    // Only resolve if it's NOT an external dependency
                    if (!this._isExternalDependency(targetPath)) {
                        if (!path.isAbsolute(targetPath)) {
                            // Convert relative path to absolute
                            const baseDir = path.dirname(response.filePath);
                            const absoluteTargetPath = path.resolve(baseDir, targetPath);
                            rel.target_qualifiedName = `${absoluteTargetPath}--${entityName}`;
                        }
                    }
                    // For external dependencies, keep target_qualifiedName as-is
                }
                
                return rel;
            });
        }
        
        return response;
    }

    /**
     * Estimates token count (rough approximation: 1 token ≈ 4 characters)
     * @param {string} text - Text to estimate tokens for
     * @returns {number} - Estimated token count
     */
    _estimateTokens(text) {
        // DeepSeek uses similar tokenization to GPT models
        // Rough approximation: 1 token ≈ 4 characters for English text
        // Add some buffer for safety (20% extra)
        return Math.ceil(text.length / 3.5); // Conservative estimate
    }

    /**
     * Truncates content to fit within token limits while preserving import/export sections
     * @param {string} content - Original file content
     * @param {number} maxTokens - Maximum tokens allowed for content
     * @returns {string} - Truncated content that preserves key sections
     */
    _truncateContentIntelligently(content, maxTokens = 20000) {
        const currentTokens = this._estimateTokens(content);
        
        if (currentTokens <= maxTokens) {
            return content;
        }

        console.log(`Content too large (${currentTokens} tokens), truncating to ${maxTokens} tokens...`);
        
        const lines = content.split('\n');
        
        // For MASSIVE files, be extremely aggressive - focus ONLY on imports/exports
        if (currentTokens > 40000) {
            return this._extractImportsExportsOnly(lines);
        }
        
        const importExportLines = [];
        const classDeclarationLines = [];
        const functionDeclarationLines = [];
        const otherLines = [];
        
        // Language-agnostic patterns for import/export detection
        const importExportPatterns = [
            /^\s*(import|from|require|include|use|using|#include)\s+/i,
            /^\s*(export|module\.exports|__all__|namespace|package)\s*/i,
            /\brequire\s*\(/,
            /\bimport\s+/,
            /\bfrom\s+.*\bimport\b/,
            /^\s*const\s+.*\s*=\s*require\s*\(/,
            /^\s*let\s+.*\s*=\s*require\s*\(/,
            /^\s*var\s+.*\s*=\s*require\s*\(/
        ];
        
        const classPatterns = [
            /^\s*(class|interface|struct|enum)\s+/i,
            /^\s*(public|private|protected)?\s*(class|interface|struct|enum)\s+/i
        ];
        
        const functionPatterns = [
            /^\s*(function|def|func|fn|public|private|protected|static|async)\s+/i,
            /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/,
            /^\s*(const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*(async\s+)?\s*\(/
        ];
        
        lines.forEach((line, index) => {
            if (importExportPatterns.some(pattern => pattern.test(line))) {
                importExportLines.push({ line, index });
            } else if (classPatterns.some(pattern => pattern.test(line))) {
                classDeclarationLines.push({ line, index });
            } else if (functionPatterns.some(pattern => pattern.test(line))) {
                functionDeclarationLines.push({ line, index });
            } else {
                otherLines.push({ line, index });
            }
        });
        
        // Build result prioritizing imports/exports, then class/function declarations
        let result = '';
        let currentResultTokens = 0;
        const targetTokens = maxTokens - 500; // Buffer
        
        // 1. Always include ALL imports/exports (highest priority)
        const importsSection = importExportLines.map(item => item.line).join('\n');
        result += '// IMPORTS/EXPORTS SECTION:\n' + importsSection + '\n\n';
        currentResultTokens = this._estimateTokens(result);
        
        // 2. Add class declarations if space allows
        for (const item of classDeclarationLines) {
            const lineTokens = this._estimateTokens(item.line);
            if (currentResultTokens + lineTokens < targetTokens) {
                result += item.line + '\n';
                currentResultTokens += lineTokens;
            } else {
                break;
            }
        }
        
        // 3. Add function declarations if space allows
        result += '\n// FUNCTION DECLARATIONS:\n';
        for (const item of functionDeclarationLines.slice(0, 10)) { // Limit to first 10 functions
            const lineTokens = this._estimateTokens(item.line);
            if (currentResultTokens + lineTokens < targetTokens) {
                result += item.line + '\n';
                currentResultTokens += lineTokens;
            } else {
                break;
            }
        }
        
        result = `// FILE TRUNCATED FOR TOKEN LIMITS - PRESERVED IMPORT/EXPORT ANALYSIS
// Original: ${currentTokens} tokens, Truncated: ${this._estimateTokens(result)} tokens

${result}

// ... REST OF FILE TRUNCATED FOR ANALYSIS FOCUS ...`;
        
        console.log(`Content truncated from ${currentTokens} to ${this._estimateTokens(result)} tokens`);
        return result;
    }
    
    /**
     * Extracts ONLY import/export lines for extremely large files
     * @param {Array} lines - File lines
     * @returns {string} - Only import/export content
     */
    _extractImportsExportsOnly(lines) {
        const importExportLines = [];
        
        const patterns = [
            /^\s*(import|from|require|include|use|using|#include)\s+/i,
            /^\s*(export|module\.exports|__all__|namespace|package)\s*/i,
            /\brequire\s*\(/,
            /\bimport\s+/,
            /\bfrom\s+.*\bimport\b/,
            /^\s*const\s+.*\s*=\s*require\s*\(/,
            /^\s*let\s+.*\s*=\s*require\s*\(/,
            /^\s*var\s+.*\s*=\s*require\s*\(/
        ];
        
        lines.forEach(line => {
            if (patterns.some(pattern => pattern.test(line))) {
                importExportLines.push(line);
            }
        });
        
        return `// EXTREMELY LARGE FILE - SHOWING ONLY IMPORTS/EXPORTS FOR ANALYSIS
// Focus: Detect import/export relationships only

${importExportLines.join('\n')}

// ... FILE CONTENT TRUNCATED - ANALYSIS FOCUSED ON DEPENDENCIES ONLY ...`;
    }
}

module.exports = { JsonSchemaValidator, ValidationError }; 