# MCP Server Plugin System Architecture

## Overview

The MCP Server plugin system provides a modular way to extend the Cognitive Triangulation Pipeline's analysis capabilities. Plugins can add support for new languages, frameworks, file types, and custom analysis techniques.

## Plugin Types

### 1. Analyzer Plugins
Analyze source code files and extract entities and relationships.

### 2. Detector Plugins
Detect project types, frameworks, and configurations.

### 3. Transformer Plugins
Transform analysis results or enhance existing data.

### 4. Validator Plugins
Validate code quality, security, or compliance.

## Plugin Interface

```javascript
class BasePlugin {
  constructor(config) {
    this.name = config.name;
    this.version = config.version;
    this.type = config.type;
    this.supportedFileTypes = config.supportedFileTypes;
  }

  async initialize(context) {
    // Plugin initialization
  }

  async destroy() {
    // Cleanup resources
  }
}
```

## Plugin Lifecycle

1. **Discovery**: Plugins are discovered at server startup
2. **Loading**: Plugin modules are loaded and validated
3. **Initialization**: Plugins receive context and initialize resources
4. **Registration**: Plugins register their capabilities with the server
5. **Execution**: Plugins process files/projects as needed
6. **Cleanup**: Plugins release resources on shutdown

## Built-in Plugins

### JavaScript/TypeScript Plugin

```javascript
class JavaScriptPlugin extends AnalyzerPlugin {
  constructor() {
    super({
      name: 'javascript-analyzer',
      version: '1.0.0',
      type: 'analyzer',
      supportedFileTypes: ['.js', '.jsx', '.ts', '.tsx', '.mjs']
    });
  }

  async analyze(file, content) {
    // Parse JavaScript/TypeScript code
    // Extract functions, classes, imports, exports
    // Identify React components, hooks, etc.
    return {
      entities: [...],
      relationships: [...],
      metrics: {...}
    };
  }
}
```

### Python Plugin

```javascript
class PythonPlugin extends AnalyzerPlugin {
  constructor() {
    super({
      name: 'python-analyzer',
      version: '1.0.0',
      type: 'analyzer',
      supportedFileTypes: ['.py', '.pyw', '.pyi']
    });
  }

  async analyze(file, content) {
    // Parse Python code
    // Extract classes, functions, imports
    // Identify decorators, type hints
    return {
      entities: [...],
      relationships: [...],
      metrics: {...}
    };
  }
}
```

### Framework Detector Plugin

```javascript
class FrameworkDetectorPlugin extends DetectorPlugin {
  constructor() {
    super({
      name: 'framework-detector',
      version: '1.0.0',
      type: 'detector'
    });
  }

  async detect(project) {
    // Check for framework-specific files
    // package.json, requirements.txt, pom.xml, etc.
    return {
      frameworks: ['react', 'express', 'django'],
      buildTools: ['webpack', 'vite'],
      testFrameworks: ['jest', 'pytest']
    };
  }
}
```

## Plugin Development Guide

### 1. Create Plugin Structure

```
my-plugin/
├── package.json
├── index.js
├── lib/
│   ├── analyzer.js
│   └── utils.js
└── test/
    └── analyzer.test.js
```

### 2. Implement Plugin Interface

```javascript
// index.js
const { AnalyzerPlugin } = require('cognitive-triangulation-mcp');

class MyCustomPlugin extends AnalyzerPlugin {
  constructor() {
    super({
      name: 'my-custom-analyzer',
      version: '1.0.0',
      type: 'analyzer',
      supportedFileTypes: ['.custom']
    });
  }

  async initialize(context) {
    this.logger = context.logger;
    this.config = context.config;
    // Initialize any resources
  }

  async analyze(file, content) {
    this.logger.info(`Analyzing ${file.path}`);
    
    // Your analysis logic here
    const entities = this.extractEntities(content);
    const relationships = this.extractRelationships(content);
    
    return {
      entities,
      relationships,
      metrics: {
        customMetric: 42
      }
    };
  }

  extractEntities(content) {
    // Custom entity extraction logic
    return [];
  }

  extractRelationships(content) {
    // Custom relationship extraction logic
    return [];
  }
}

module.exports = MyCustomPlugin;
```

### 3. Package Configuration

```json
{
  "name": "my-custom-analyzer",
  "version": "1.0.0",
  "main": "index.js",
  "cognitive-triangulation-plugin": {
    "type": "analyzer",
    "supportedFileTypes": [".custom"],
    "configuration": {
      "enableAdvancedAnalysis": {
        "type": "boolean",
        "default": false,
        "description": "Enable advanced analysis features"
      }
    }
  }
}
```

## Plugin Configuration

Plugins can be configured in the MCP server configuration:

```javascript
{
  "plugins": {
    "enabled": [
      "javascript-analyzer",
      "python-analyzer",
      "framework-detector"
    ],
    "custom": [
      "./plugins/my-custom-analyzer"
    ],
    "options": {
      "javascript-analyzer": {
        "parseJSX": true,
        "inferTypes": true
      },
      "my-custom-analyzer": {
        "enableAdvancedAnalysis": true
      }
    }
  }
}
```

## Plugin API

### Context Object

```javascript
{
  logger: {
    debug(message, meta),
    info(message, meta),
    warn(message, meta),
    error(message, meta)
  },
  config: {
    // Plugin-specific configuration
  },
  storage: {
    // Access to storage adapters
  },
  eventBus: {
    on(event, handler),
    emit(event, data)
  },
  cache: {
    get(key),
    set(key, value, ttl)
  }
}
```

### Events

Plugins can listen to and emit events:

```javascript
// Listen to events
context.eventBus.on('file:analyzed', (data) => {
  // React to file analysis completion
});

// Emit events
context.eventBus.emit('custom:event', {
  pluginName: this.name,
  data: customData
});
```

## Plugin Testing

### Unit Testing

```javascript
// test/analyzer.test.js
const MyCustomPlugin = require('../index');

describe('MyCustomPlugin', () => {
  let plugin;
  
  beforeEach(() => {
    plugin = new MyCustomPlugin();
  });
  
  test('should extract entities correctly', async () => {
    const content = '...';
    const result = await plugin.analyze(
      { path: 'test.custom' },
      content
    );
    
    expect(result.entities).toHaveLength(3);
    expect(result.entities[0].type).toBe('custom_entity');
  });
});
```

### Integration Testing

```javascript
const { MCPServer } = require('cognitive-triangulation-mcp');
const MyCustomPlugin = require('./my-custom-plugin');

// Test plugin integration with MCP server
const server = new MCPServer({
  plugins: {
    custom: [MyCustomPlugin]
  }
});

await server.start();
// Run analysis with custom plugin
```

## Security Considerations

1. **Sandboxing**: Plugins run in a sandboxed environment
2. **Resource Limits**: CPU and memory usage are monitored
3. **File Access**: Plugins only access files through provided APIs
4. **Validation**: All plugin outputs are validated
5. **Error Isolation**: Plugin errors don't crash the server

## Performance Guidelines

1. **Streaming**: Process large files in chunks
2. **Caching**: Use provided cache for expensive operations
3. **Async Operations**: Use async/await for I/O operations
4. **Batching**: Process multiple files in batches when possible
5. **Progress Reporting**: Report progress for long operations

## Publishing Plugins

1. **NPM Registry**: Publish to npm with `cognitive-triangulation-plugin` keyword
2. **Plugin Registry**: Submit to official plugin registry
3. **Documentation**: Include comprehensive documentation
4. **Examples**: Provide usage examples
5. **Tests**: Include test suite with >80% coverage

## Plugin Examples

### Language Support Plugin

```javascript
class RustAnalyzerPlugin extends AnalyzerPlugin {
  async analyze(file, content) {
    // Use tree-sitter or other parser
    const ast = await this.parseRust(content);
    
    // Extract Rust-specific entities
    const entities = this.extractFromAST(ast, {
      structs: true,
      enums: true,
      traits: true,
      impls: true,
      functions: true,
      modules: true
    });
    
    // Extract Rust-specific relationships
    const relationships = this.extractRelationships(ast, {
      'implements': 'trait implementation',
      'derives': 'derive macros',
      'uses': 'use statements'
    });
    
    return { entities, relationships };
  }
}
```

### Code Quality Plugin

```javascript
class CodeQualityPlugin extends ValidatorPlugin {
  async validate(analysis) {
    const issues = [];
    
    // Check for code smells
    for (const entity of analysis.entities) {
      if (entity.type === 'function' && entity.complexity > 10) {
        issues.push({
          type: 'warning',
          message: 'High cyclomatic complexity',
          entity: entity.id,
          severity: 2
        });
      }
    }
    
    return { issues };
  }
}
```

### Custom Transformer Plugin

```javascript
class GraphEnhancerPlugin extends TransformerPlugin {
  async transform(graph) {
    // Add custom metrics to nodes
    for (const node of graph.nodes) {
      node.properties.customScore = this.calculateScore(node);
    }
    
    // Add inferred relationships
    const inferredEdges = this.inferRelationships(graph);
    graph.edges.push(...inferredEdges);
    
    return graph;
  }
}
```