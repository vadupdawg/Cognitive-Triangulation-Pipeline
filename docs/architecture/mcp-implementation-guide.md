# MCP Server Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the modular MCP server architecture for the Cognitive Triangulation Pipeline. This document is intended for developers implementing the architecture defined in the architecture documents.

## Implementation Phases

### Phase 1: Core MCP Server (Priority: High)

**Components to Implement**:

1. **MessageHandler.js** (`/src/mcp-server/core/MessageHandler.js`)
   ```javascript
   class MessageHandler {
     constructor(server) {
       this.server = server;
     }
     
     async handle(message) {
       // Route messages to appropriate handlers
       // Handle: initialize, tools/list, tools/call, resources/list, etc.
     }
   }
   ```

2. **ResponseBuilder.js** (`/src/mcp-server/core/ResponseBuilder.js`)
   ```javascript
   class ResponseBuilder {
     buildResponse(id, result) {
       return { jsonrpc: '2.0', id, result };
     }
     
     buildError(id, code, message, data) {
       return { jsonrpc: '2.0', id, error: { code, message, data } };
     }
     
     buildInitialization(params) {
       // Build initialization response
     }
   }
   ```

3. **ProtocolValidator.js** (`/src/mcp-server/core/ProtocolValidator.js`)
   ```javascript
   class ProtocolValidator {
     validateMessage(message) {
       // Validate JSON-RPC 2.0 format
       // Check required fields
       // Return { valid: boolean, errors: [] }
     }
   }
   ```

4. **Transport Layer** (`/src/mcp-server/core/transport/`)
   - `index.js` - Transport factory
   - `StdioTransport.js` - Read from stdin, write to stdout
   - `BaseTransport.js` - Common transport interface

### Phase 2: Pipeline Integration (Priority: High)

**Components to Implement**:

1. **ProjectMapper.js** (`/src/mcp-server/modules/project-mapping/ProjectMapper.js`)
   ```javascript
   class ProjectMapper {
     constructor(pipelineConfig) {
       this.pipelineConfig = pipelineConfig;
     }
     
     async analyzeProject(path, options) {
       // Create new pipeline instance
       // Run analysis
       // Return session info
     }
   }
   ```

2. **Session Manager** (`/src/mcp-server/core/SessionManager.js`)
   ```javascript
   class SessionManager {
     constructor() {
       this.sessions = new Map();
     }
     
     createSession(type, config) {
       // Create unique session
       // Initialize resources
       // Return session ID
     }
     
     getSession(id) {
       // Retrieve active session
     }
     
     closeSession(id) {
       // Cleanup session resources
     }
   }
   ```

### Phase 3: Built-in Plugins (Priority: Medium)

**Directory Structure**:
```
src/mcp-server/plugins/
├── base/
│   ├── BasePlugin.js
│   ├── AnalyzerPlugin.js
│   └── DetectorPlugin.js
├── javascript/
│   └── JavaScriptAnalyzer.js
├── python/
│   └── PythonAnalyzer.js
└── framework/
    └── FrameworkDetector.js
```

**Implementation Steps**:

1. Create base plugin classes
2. Implement language-specific analyzers
3. Add framework detection logic
4. Create plugin loader and registry

### Phase 4: CLI Integration (Priority: Medium)

1. **Create MCP CLI** (`/src/mcp-server/cli.js`)
   ```javascript
   #!/usr/bin/env node
   const { MCPServer } = require('./core/MCPServer');
   const yargs = require('yargs');
   
   const argv = yargs
     .command('serve', 'Start MCP server', {
       transport: { default: 'stdio' },
       port: { default: 3000 }
     })
     .argv;
   
   // Start server based on CLI args
   ```

2. **Update package.json**
   ```json
   {
     "bin": {
       "cognitive-mcp": "./src/mcp-server/cli.js"
     }
   }
   ```

### Phase 5: Testing Infrastructure (Priority: High)

**Test Structure**:
```
tests/mcp-server/
├── unit/
│   ├── core/
│   │   ├── MCPServer.test.js
│   │   ├── MessageHandler.test.js
│   │   └── ProtocolValidator.test.js
│   └── plugins/
│       └── JavaScriptAnalyzer.test.js
├── integration/
│   ├── pipeline-integration.test.js
│   └── plugin-system.test.js
└── e2e/
    └── mcp-protocol.test.js
```

## Key Implementation Patterns

### 1. Error Handling

```javascript
try {
  // Operation
} catch (error) {
  if (error instanceof AnalysisError) {
    // Handle analysis-specific errors
    return this.responseBuilder.buildError(
      message.id,
      -32001,
      'Analysis failed',
      { file: error.filePath, phase: error.phase }
    );
  }
  // Handle general errors
  throw error;
}
```

### 2. Async Operations

```javascript
async processAnalysis(sessionId) {
  const session = this.sessions.get(sessionId);
  
  // Update status
  session.status = 'analyzing';
  
  try {
    // Long-running operation
    const result = await session.pipeline.run();
    session.status = 'completed';
    return result;
  } catch (error) {
    session.status = 'failed';
    throw error;
  }
}
```

### 3. Plugin Loading

```javascript
async loadPlugins(pluginConfig) {
  const plugins = [];
  
  // Load built-in plugins
  for (const name of pluginConfig.enabled) {
    const Plugin = require(`./plugins/${name}`);
    const plugin = new Plugin(pluginConfig.options[name]);
    await plugin.initialize(this.context);
    plugins.push(plugin);
  }
  
  // Load custom plugins
  for (const path of pluginConfig.custom) {
    const Plugin = require(path);
    const plugin = new Plugin();
    await plugin.initialize(this.context);
    plugins.push(plugin);
  }
  
  return plugins;
}
```

### 4. Resource Management

```javascript
class ResourceManager {
  constructor(config) {
    this.config = config;
    this.connections = new Map();
  }
  
  async getDatabase(type = 'sqlite') {
    if (!this.connections.has(type)) {
      const connection = await this.createConnection(type);
      this.connections.set(type, connection);
    }
    return this.connections.get(type);
  }
  
  async closeAll() {
    for (const [type, connection] of this.connections) {
      await connection.close();
    }
    this.connections.clear();
  }
}
```

## Configuration Management

### Default Configuration

```javascript
const defaultConfig = {
  name: 'cognitive-triangulation-mcp',
  version: '1.0.0',
  transport: {
    type: 'stdio'
  },
  pipeline: {
    workers: 4,
    batchSize: 100,
    timeout: 300000
  },
  storage: {
    sqlite: { path: ':memory:' },
    redis: { url: 'redis://localhost:6379' }
  },
  plugins: {
    enabled: ['javascript', 'python'],
    custom: []
  }
};
```

### Environment Variables

```bash
# MCP Server Configuration
MCP_TRANSPORT=stdio
MCP_PORT=3000
MCP_WORKERS=4

# Storage Configuration
SQLITE_PATH=./data/analysis.db
REDIS_URL=redis://localhost:6379
NEO4J_URI=bolt://localhost:7687

# Plugin Configuration
MCP_PLUGINS_ENABLED=javascript,python,java
MCP_PLUGINS_PATH=./plugins
```

## Deployment Preparation

### 1. Docker Setup

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Expose ports
EXPOSE 3000

# Start server
CMD ["npm", "run", "mcp:server"]
```

### 2. NPM Scripts

```json
{
  "scripts": {
    "mcp:server": "node src/mcp-server/cli.js serve",
    "mcp:dev": "nodemon src/mcp-server/cli.js serve",
    "mcp:test": "jest tests/mcp-server",
    "mcp:build": "webpack --config mcp.webpack.config.js"
  }
}
```

### 3. CI/CD Pipeline

```yaml
# .github/workflows/mcp-server.yml
name: MCP Server CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run mcp:test
      - run: npm run mcp:build
```

## Performance Considerations

1. **Connection Pooling**: Reuse database connections
2. **Result Caching**: Cache analysis results by file hash
3. **Streaming**: Stream large results to avoid memory issues
4. **Worker Processes**: Use worker threads for CPU-intensive tasks
5. **Memory Management**: Implement session timeouts and cleanup

## Security Implementation

1. **Path Validation**: Sanitize all file paths
2. **Plugin Sandboxing**: Run plugins in VM context
3. **Rate Limiting**: Implement request throttling
4. **Authentication**: Add API key support for network transports
5. **Audit Logging**: Log all operations with user context

## Monitoring and Observability

1. **Structured Logging**: Use Winston with JSON format
2. **Metrics Collection**: Integrate with Prometheus
3. **Health Endpoints**: Implement health check endpoints
4. **Error Tracking**: Integrate with Sentry or similar
5. **Performance Monitoring**: Track analysis times and throughput

## Next Steps for Implementation Team

1. **Week 1-2**: Implement core MCP server and transport layer
2. **Week 3-4**: Integrate with existing pipeline
3. **Week 5-6**: Develop built-in plugins
4. **Week 7-8**: Testing and documentation
5. **Week 9-10**: Performance optimization and deployment prep

## Success Criteria

1. ✅ MCP server responds to protocol messages correctly
2. ✅ Can analyze projects through MCP tools
3. ✅ Plugin system loads and executes plugins
4. ✅ All tests pass with >80% coverage
5. ✅ Documentation complete and accurate
6. ✅ Performance meets or exceeds current pipeline
7. ✅ Security audit passed
8. ✅ Successfully integrated with Claude Code