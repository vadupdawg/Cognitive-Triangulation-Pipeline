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
        this.validEntityTypes = new Set(['Function', 'Class', 'Variable', 'File', 'Database', 'Table', 'View']);
        
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
     * Creates a guardrail prompt that instructs the LLM to read the file directly
     * @param {string} filePath - File path (will be converted to absolute)
     * @param {string} fileContent - Content of the file to analyze
     * @param {string} projectContext - Project file tree context for cross-file analysis
     * @returns {Object} - Prompt object for LLM
     */
    createGuardrailPrompt(filePath, fileContent, projectContext = null) {
        // Convert to absolute path for robust identification
        const absoluteFilePath = path.resolve(filePath);
        const baseDirectory = path.dirname(absoluteFilePath);
        const detectedLanguage = this._detectLanguage(absoluteFilePath);
        
        const systemPrompt = `You are a universal code analysis AI. You will be given source code content to analyze and extract entities and relationships for a Neo4j knowledge graph.

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
- SQL: CREATE TABLE, CREATE VIEW, stored procedures
- And 15+ more languages with their specific patterns

ENTITY TYPES TO EXTRACT:
- Function: Functions, methods, procedures (any callable code)
- Class: Classes, structs, interfaces, traits, protocols
- Variable: Variables, constants, fields, properties
- File: The source file being analyzed
- Database: Database connections or database references
- Table: Database tables (if found in SQL/ORM code)
- View: Database views (if found in SQL code)

RELATIONSHIP TYPES TO DETECT:
- CONTAINS: File contains function/class/variable
- CALLS: Function calls another function
- USES: Function/class uses a variable or references another entity
- IMPORTS: File imports external dependency or local file (RELATIONSHIP ONLY, not an entity)
- EXPORTS: File exports function/class/variable for other files
- EXTENDS: Class extends/inherits from another class

**CRITICAL: CROSS-LANGUAGE POLYGLOT RELATIONSHIP DETECTION**
You MUST also detect these advanced cross-language relationships:

1. **HTTP API ENDPOINT RELATIONSHIPS**:
   - Look for HTTP requests (fetch, axios, requests.get, HttpClient, etc.)
   - Extract the endpoint URLs (e.g., "/api/users", "/api/process")
   - Create CALLS relationships from the calling function to a Function entity representing the API endpoint
   - Example: JavaScript function making HTTP call to "/api/users" → CALLS → Function named "POST /api/users"

2. **DATABASE QUERY RELATIONSHIPS**:
   - Look for SQL queries, ORM calls, database operations
   - Extract table names from SELECT, INSERT, UPDATE, DELETE statements
   - Create USES relationships from functions to Table entities
   - Example: Python function with "SELECT * FROM users" → USES → Table named "users"

3. **CONFIGURATION DEPENDENCY RELATIONSHIPS**:
   - Look for configuration file usage (config.js, settings.py, application.properties)
   - Extract configuration keys being accessed
   - Create USES relationships from functions to Variable entities representing config values
   - Example: Function accessing "DATABASE_URL" → USES → Variable named "DATABASE_URL"

4. **CROSS-LANGUAGE SERVICE MAPPINGS**:
   - Look for service URLs, API base URLs, microservice endpoints
   - Create relationships between services that communicate via HTTP
   - Example: Java ApiClient calling Python service → CALLS → Function in Python service

CRITICAL REQUIREMENTS:
1. Entity format: Each entity must have type, name, and filePath fields
2. For local entities: filePath should be the absolute path where they are defined
3. For external dependencies: filePath should be the module name (e.g., "express", "fs")
4. For file entities: filePath should be the absolute file path
5. Relationships use nested objects with from/to containing full entity information
6. Smart path resolution for different import styles
7. **CROSS-FILE ANALYSIS**: Use the provided project context to identify relationships between the current file and other files in the project

ENTITY GENERATION RULES:
- Local entities (Function, Class, Variable): filePath = absolute file path where defined
  Example: {"type": "Function", "name": "loadConfig", "filePath": "C:\\code\\aback\\src\\utils\\config.js"}
- External dependencies: filePath = module name
  Example: {"type": "Function", "name": "express", "filePath": "express"}
- File entities: filePath = absolute file path
  Example: {"type": "File", "name": "config.js", "filePath": "C:\\code\\aback\\src\\utils\\config.js"}
- Database entities: filePath = absolute file path where referenced
  Example: {"type": "Database", "name": "userDB", "filePath": "C:\\code\\aback\\src\\models\\user.js"}

EXTERNAL DEPENDENCY DETECTION:
- Node.js built-ins: fs, path, http, crypto, os, etc.
- NPM packages: express, lodash, react, etc.
- Language packages: Standard library modules

**PROJECT CONTEXT ANALYSIS**:
When project context is provided, you MUST:
1. Look for relative imports (./file, ../file) and resolve them to absolute paths using the project context
2. Identify when the current file imports from other project files listed in the context
3. Create IMPORTS relationships to other project files when detected
4. Look for function calls that might reference functions defined in other project files
5. Create CALLS relationships to functions in other files when you can reasonably infer them

JSON OUTPUT FORMAT (STRICT):
{
  "filePath": "absolute_file_path",
  "entities": [
    {"type": "Function", "name": "functionName", "filePath": "absolute_path"},
    {"type": "Class", "name": "MyClass", "filePath": "absolute_path"},
    {"type": "Variable", "name": "config", "filePath": "absolute_path"},
    {"type": "Database", "name": "userDB", "filePath": "absolute_path"},
    {"type": "Table", "name": "users", "filePath": "absolute_path"},
    {"type": "View", "name": "user_summary", "filePath": "absolute_path"},
    {"type": "File", "name": "filename.js", "filePath": "absolute_path"}
  ],
  "relationships": [
    {"from": {"type": "File", "name": "filename.js", "filePath": "absolute_path"}, "to": {"type": "Function", "name": "express", "filePath": "express"}, "type": "IMPORTS"},
    {"from": {"type": "File", "name": "filename.js", "filePath": "absolute_path"}, "to": {"type": "Function", "name": "functionName", "filePath": "absolute_path"}, "type": "CONTAINS"},
    {"from": {"type": "Function", "name": "functionName", "filePath": "absolute_path"}, "to": {"type": "Variable", "name": "config", "filePath": "absolute_path"}, "type": "USES"},
    {"from": {"type": "Class", "name": "SubClass", "filePath": "absolute_path"}, "to": {"type": "Class", "name": "BaseClass", "filePath": "absolute_path"}, "type": "EXTENDS"},
    {"from": {"type": "Function", "name": "functionName", "filePath": "absolute_path"}, "to": {"type": "Function", "name": "anotherFunction", "filePath": "absolute_path"}, "type": "CALLS"},
    {"from": {"type": "File", "name": "filename.js", "filePath": "absolute_path"}, "to": {"type": "Class", "name": "MyClass", "filePath": "absolute_path"}, "type": "EXPORTS"}
  ]
}

IMPORTANT: Return ONLY the JSON object. No explanations, no markdown formatting, no additional text.`;

        let userPrompt = `Please analyze the following ${detectedLanguage} source code file (${absoluteFilePath}):

\`\`\`${detectedLanguage.toLowerCase()}
${fileContent}
\`\`\`

Base directory context: ${baseDirectory}`;

        // Add project context if available
        if (projectContext) {
            userPrompt += `

Project Context (File Tree):
\`\`\`
${projectContext}
\`\`\`

**IMPORTANT**: Use this project context to identify cross-file relationships. When you see relative imports (./file, ../file) or local module references, resolve them using the file tree above to create accurate IMPORTS relationships to other project files. Look for patterns where the current file might be calling functions or using classes defined in other project files listed in the context.`;
        }

        userPrompt += `

Instructions:
1. Analyze the provided source code content
2. Detect the programming language patterns and apply appropriate parsing
3. Extract all entities (functions, classes, variables, files, databases, tables, views) from the code
4. Identify relationships between entities (calls, uses, imports, exports, extends, contains)
5. Convert relative import paths to absolute paths based on the base directory
6. Distinguish between external dependencies and local file imports
${projectContext ? '7. **CROSS-FILE ANALYSIS**: Use the provided project context to identify relationships between the current file and other files in the project' : ''}
${projectContext ? '8' : '7'}. **CRITICAL POLYGLOT ANALYSIS**: Look for these specific patterns:
   
   **HTTP API Calls**:
   - JavaScript: fetch(), axios.get(), http.request(), XMLHttpRequest
   - Python: requests.get(), urllib.request(), httpx.get()
   - Java: HttpClient, RestTemplate, OkHttp
   - Extract endpoint URLs and create CALLS relationships to Function entities named after the endpoint
   
   **Database Operations**:
   - SQL queries: SELECT/INSERT/UPDATE/DELETE statements
   - ORM calls: .find(), .save(), .query(), .execute()
   - Extract table names and create USES relationships to Table entities
   
   **Configuration Access**:
   - JavaScript: process.env.VAR, config.get('key')
   - Python: os.environ['VAR'], settings.DATABASE_URL
   - Java: System.getProperty(), @Value annotations
   - Create USES relationships to Variable entities for config keys
   
   **Service Communication**:
   - Look for base URLs, service endpoints, microservice calls
   - Create cross-language CALLS relationships between services

${projectContext ? '9' : '8'}. Generate entity objects according to the ENTITY GENERATION RULES above:
   - Local entities: filePath = absolute file path where defined
   - External dependencies: filePath = module name
   - File entities: filePath = absolute file path
   - **API Endpoints**: Create Function entities with names like "GET /api/users" and filePath as the service base URL
   - **Database Tables**: Create Table entities with filePath as the schema file or database connection
   - **Config Variables**: Create Variable entities with filePath as the config file location

${projectContext ? '10' : '9'}. Return the analysis as a JSON object matching the required schema

**EXAMPLES OF EXPECTED RELATIONSHIPS**:
- JavaScript function calling "/api/users" → CALLS → Function{"name": "GET /api/users", "type": "Function", "filePath": "http://localhost:8080"}
- Python function with "SELECT * FROM users" → USES → Table{"name": "users", "type": "Table", "filePath": "database/schema.sql"}
- Java method accessing config.getProperty("db.url") → USES → Variable{"name": "db.url", "type": "Variable", "filePath": "config.properties"}

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
     * Validates entity structure and filePath format
     * @param {Array} entities - Array of entities to validate
     * @param {string} expectedFilePath - Expected file path for validation
     */
    _validateEntities(entities, expectedFilePath) {
        if (!Array.isArray(entities)) {
            throw new ValidationError('entities must be an array');
        }

        entities.forEach((entity, index) => {
            // Validate required fields
            if (!entity.type || !entity.name || !entity.filePath) {
                throw new ValidationError(`Entity ${index}: Missing required fields (type, name, filePath)`);
            }

            // Validate entity type
            if (!this.validEntityTypes.has(entity.type)) {
                throw new ValidationError(`Entity ${index}: Invalid type "${entity.type}". Must be one of: ${Array.from(this.validEntityTypes).join(', ')}`);
            }

            // For File entities, filePath should match the expected file path
            // For other entities, filePath should be the file they're defined in
            if (entity.type === 'File') {
                if (entity.filePath !== expectedFilePath) {
                    throw new ValidationError(`Entity ${index}: File entity filePath "${entity.filePath}" must be the absolute file path "${expectedFilePath}"`);
                }
            }
            // For other entity types, we allow flexible filePath (could be external dependencies)
        });
    }
    
    _validateRelationships(relationships) {
        for (let i = 0; i < relationships.length; i++) {
            const rel = relationships[i];
            
            if (!rel.from || typeof rel.from !== 'object') {
                throw new ValidationError(`Relationship ${i}: Missing or invalid 'from' object`);
            }
            
            if (!rel.to || typeof rel.to !== 'object') {
                throw new ValidationError(`Relationship ${i}: Missing or invalid 'to' object`);
            }
            
            if (!rel.type || !this.validRelationshipTypes.has(rel.type)) {
                throw new ValidationError(`Relationship ${i}: Invalid type "${rel.type}". Must be one of: ${Array.from(this.validRelationshipTypes).join(', ')}`);
            }
            
            // Validate 'from' object
            if (!rel.from.type || !rel.from.name || !rel.from.filePath) {
                throw new ValidationError(`Relationship ${i}: 'from' object missing required fields (type, name, filePath)`);
            }
            
            // Validate 'to' object
            if (!rel.to.type || !rel.to.name || !rel.to.filePath) {
                throw new ValidationError(`Relationship ${i}: 'to' object missing required fields (type, name, filePath)`);
            }
            
            // Validate entity types in relationships
            if (!this.validEntityTypes.has(rel.from.type)) {
                throw new ValidationError(`Relationship ${i}: Invalid 'from' type "${rel.from.type}". Must be one of: ${Array.from(this.validEntityTypes).join(', ')}`);
            }
            
            if (!this.validEntityTypes.has(rel.to.type)) {
                throw new ValidationError(`Relationship ${i}: Invalid 'to' type "${rel.to.type}". Must be one of: ${Array.from(this.validEntityTypes).join(', ')}`);
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