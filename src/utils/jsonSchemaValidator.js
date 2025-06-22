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
        // Valid entity types aligned with GraphIngestorAgent expectations
        this.validEntityTypes = new Set(['Function', 'Class', 'Variable', 'File', 'Database', 'Table']);
        
        // Valid relationship types - covers all expected relationships
        this.validRelationshipTypes = new Set(['CONTAINS', 'CALLS', 'USES', 'IMPORTS', 'EXPORTS', 'EXTENDS']);
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
     * @returns {Object} - Prompt object for LLM
     */
    createGuardrailPrompt(filePath) {
        // Convert to absolute path for robust identification
        const absoluteFilePath = path.resolve(filePath);
        const baseDirectory = path.dirname(absoluteFilePath);
        const detectedLanguage = this._detectLanguage(absoluteFilePath);
        
        const systemPrompt = `You are a universal code analysis AI. Analyze source code in ANY programming language to extract entities and relationships for a Neo4j knowledge graph.

UNIVERSAL LANGUAGE SUPPORT:
- JavaScript/TypeScript: require(), import/export, module.exports
- Python: import, from...import, __all__
- Java: import, package declarations, extends/implements
- C#: using, namespace, class inheritance
- Go: import, package declarations, struct methods
- Rust: use, mod, crate imports, trait implementations
- PHP: require/include, namespace, use statements
- Ruby: require, include, module/class definitions
- C/C++: #include, namespace, class inheritance
- Swift: import, class/struct/protocol definitions
- And 15+ more languages with their specific patterns

ENTITY TYPES TO EXTRACT:
- Function: Functions, methods, procedures (any callable code)
- Class: Classes, structs, interfaces, traits, protocols  
- Variable: Variables, constants, fields, properties
- File: The source file being analyzed
- Database: Database connections or database references
- Table: Database tables (if found in SQL/ORM code)

RELATIONSHIP TYPES TO DETECT:
- CONTAINS: File contains function/class/variable
- CALLS: Function calls another function
- USES: Function/class uses a variable or references another entity
- IMPORTS: File imports external dependency or local file (RELATIONSHIP ONLY, not an entity)
- EXPORTS: File exports function/class/variable for other files
- EXTENDS: Class extends/inherits from another class

CRITICAL REQUIREMENTS:
1. qualifiedName format: "ABSOLUTE_FILE_PATH--entityName" for local entities
2. For external dependencies: "moduleName--entityName" (e.g., "express--express", "fs--readFile")  
3. For file entities: Use the absolute file path as qualifiedName
4. Detect imports/exports relationships between files
5. Smart path resolution for different import styles

QUALIFIEDNAME GENERATION RULES:
- Local entities (Function, Class, Variable): "\${absoluteFilePath}--\${entityName}"
  Example: "C:\\code\\aback\\src\\utils\\config.js--loadConfig"
- External dependencies in IMPORTS relationships: "\${moduleName}--\${moduleName}"
  Example: "express--express", "fs--fs", "path--path"
- File entities: Use the absolute file path directly
  Example: "C:\\code\\aback\\src\\utils\\config.js"
- Database entities: "\${absoluteFilePath}--\${databaseName}"
  Example: "C:\\code\\aback\\src\\models\\user.js--userDB"
- Table entities: "\${databaseContext}--\${tableName}" or "\${absoluteFilePath}--\${tableName}"
  Example: "userDB--users" or "C:\\code\\aback\\schema.sql--users"

EXTERNAL DEPENDENCY DETECTION:
- Node.js built-ins: fs, path, http, crypto, os, etc.
- NPM packages: express, lodash, react, etc.
- Language packages: Standard library modules

JSON OUTPUT FORMAT (STRICT):
{
  "filePath": "absolute_file_path",
  "entities": [
    {"type": "Function", "name": "functionName", "qualifiedName": "absolute_path--functionName"},
    {"type": "Class", "name": "MyClass", "qualifiedName": "absolute_path--MyClass"},
    {"type": "Variable", "name": "config", "qualifiedName": "absolute_path--config"},
    {"type": "Database", "name": "userDB", "qualifiedName": "absolute_path--userDB"},
    {"type": "Table", "name": "users", "qualifiedName": "database--users"}
  ],
  "relationships": [
    {"source_qualifiedName": "absolute_path", "target_qualifiedName": "express--express", "type": "IMPORTS"},
    {"source_qualifiedName": "absolute_path", "target_qualifiedName": "absolute_path--functionName", "type": "CONTAINS"},
    {"source_qualifiedName": "absolute_path--functionName", "target_qualifiedName": "absolute_path--config", "type": "USES"},
    {"source_qualifiedName": "absolute_path--SubClass", "target_qualifiedName": "absolute_path--BaseClass", "type": "EXTENDS"},
    {"source_qualifiedName": "absolute_path--functionName", "target_qualifiedName": "absolute_path--anotherFunction", "type": "CALLS"},
    {"source_qualifiedName": "absolute_path", "target_qualifiedName": "absolute_path--MyClass", "type": "EXPORTS"}
  ]
}

IMPORTANT: Return ONLY the JSON object. No explanations, no markdown formatting, no additional text.`;

        const userPrompt = `Please read and analyze the ${detectedLanguage} source code file located at: ${absoluteFilePath}

Base directory context: ${baseDirectory}

Instructions:
1. Read the file at the specified path
2. Detect the programming language and apply appropriate parsing patterns
3. Extract all entities (functions, classes, variables, files, databases, tables) from the code
4. Identify relationships between entities (calls, uses, imports, exports, extends, contains)
5. Convert relative import paths to absolute paths based on the base directory
6. Distinguish between external dependencies and local file imports
7. Generate qualifiedName values according to the QUALIFIEDNAME GENERATION RULES above:
   - Local entities: "absoluteFilePath--entityName"
   - External dependencies: "moduleName--moduleName" 
   - File entities: use absolute file path directly
8. Return the analysis as a JSON object matching the required schema

Return only the JSON analysis, no additional text or formatting.`;

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
        
        // Validate entities and relationships with detailed rules
        this._validateEntities(normalizedResponse.entities, normalizedResponse.filePath);
        this._validateRelationships(normalizedResponse.relationships);
        
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

            // For all entity types, qualifiedName must start with file path
            // Exception: File entities use the file path directly as qualifiedName
            if (entity.type === 'File') {
                // File entities should have qualifiedName as the absolute file path
                if (entity.qualifiedName !== expectedFilePath) {
                    throw new ValidationError(`Entity ${index}: File entity qualifiedName "${entity.qualifiedName}" must be the absolute file path "${expectedFilePath}"`);
                }
            } else {
                // For all other entity types, qualifiedName must follow "filePath--entityName" format
                if (!entity.qualifiedName.startsWith(expectedFilePath + '--')) {
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