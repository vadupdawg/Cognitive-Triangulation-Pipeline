# Modular MCP Server Architecture for Cognitive Triangulation Pipeline

## Executive Summary

This document outlines the modular architecture for transforming the Cognitive Triangulation Pipeline into an MCP (Model Context Protocol) server that can operate standalone or integrate with Claude Code/Flow systems.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ MCP Protocol│  │   Transport  │  │  Message Router        │ │
│  │   Handler   │  │  (stdio/ws)  │  │  & Dispatcher          │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Core Modules Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Project    │  │   Analysis   │  │    Relationship        │ │
│  │  Mapping    │  │   Engine     │  │    Resolution          │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    Plugin System Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Language   │  │  Framework   │  │    Custom Analysis     │ │
│  │  Plugins    │  │  Detectors   │  │    Providers           │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                 Resource Management Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Database   │  │    Queue     │  │      Cache             │ │
│  │  Manager    │  │   Manager    │  │     Manager            │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCP Protocol Handler (`/src/mcp-server/core/`)

**Purpose**: Implements the MCP protocol specification for communication with Claude and other MCP clients.

**Key Modules**:
- `MCPServer.js` - Main server class implementing MCP protocol
- `MessageHandler.js` - Processes incoming MCP messages
- `ResponseBuilder.js` - Constructs MCP-compliant responses
- `ProtocolValidator.js` - Validates message format and content

**Interface**:
```javascript
class MCPServer {
  constructor(config: MCPServerConfig)
  async start(): Promise<void>
  async stop(): Promise<void>
  registerTool(name: string, handler: ToolHandler): void
  registerResource(name: string, provider: ResourceProvider): void
}
```

### 2. Transport Layer (`/src/mcp-server/core/transport/`)

**Purpose**: Provides multiple transport mechanisms for MCP communication.

**Modules**:
- `StdioTransport.js` - Standard input/output transport
- `WebSocketTransport.js` - WebSocket-based transport
- `TransportInterface.js` - Common transport interface

### 3. Project Mapping Module (`/src/mcp-server/modules/project-mapping/`)

**Purpose**: Encapsulates the cognitive triangulation pipeline's project analysis capabilities.

**Key Components**:
```javascript
interface ProjectMapper {
  async analyzeProject(path: string, options?: AnalysisOptions): Promise<ProjectStructure>
  async getEntityGraph(projectId: string): Promise<EntityGraph>
  async queryRelationships(query: RelationshipQuery): Promise<Relationship[]>
  async getProjectSummary(projectId: string): Promise<ProjectSummary>
}
```

**Sub-modules**:
- `EntityDiscovery.js` - Wraps EntityScout functionality
- `CodeAnalyzer.js` - Interfaces with file analysis workers
- `RelationshipMapper.js` - Relationship resolution interface
- `GraphQueryEngine.js` - Neo4j query interface

### 4. Analysis Engine (`/src/mcp-server/modules/analysis/`)

**Purpose**: Coordinates the analysis pipeline and manages job orchestration.

**Components**:
- `AnalysisOrchestrator.js` - Manages analysis workflow
- `JobScheduler.js` - Interfaces with BullMQ queue system
- `WorkerPool.js` - Manages analysis worker processes
- `ResultAggregator.js` - Collects and processes analysis results

### 5. Plugin System (`/src/mcp-server/plugins/`)

**Purpose**: Provides extensibility for custom analysis and language support.

**Plugin Interface**:
```javascript
interface AnalysisPlugin {
  name: string
  version: string
  supportedFileTypes: string[]
  async analyze(filePath: string, content: string): Promise<AnalysisResult>
  async extractRelationships(analysis: AnalysisResult): Promise<Relationship[]>
}
```

**Built-in Plugins**:
- `JavaScriptPlugin.js` - Enhanced JS/TS analysis
- `PythonPlugin.js` - Python-specific analysis
- `JavaPlugin.js` - Java code analysis
- `ConfigPlugin.js` - Configuration file analysis

### 6. Resource Management (`/src/mcp-server/resources/`)

**Purpose**: Manages external resources and connections.

**Components**:
- `DatabasePool.js` - SQLite/Neo4j connection management
- `CacheManager.js` - Redis cache interface
- `QueueManager.js` - BullMQ queue management
- `ResourceLifecycle.js` - Resource initialization/cleanup

## MCP Tool Definitions

### 1. Project Analysis Tools

```javascript
{
  name: "analyze_project",
  description: "Analyze a project directory and build entity graph",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Project directory path" },
      options: {
        type: "object",
        properties: {
          depth: { type: "number", description: "Analysis depth" },
          includeTests: { type: "boolean" },
          languages: { type: "array", items: { type: "string" } }
        }
      }
    },
    required: ["path"]
  }
}
```

### 2. Query Tools

```javascript
{
  name: "query_entities",
  description: "Query entities and their relationships",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      query: {
        type: "object",
        properties: {
          entityType: { type: "string" },
          name: { type: "string" },
          includeRelationships: { type: "boolean" }
        }
      }
    },
    required: ["projectId", "query"]
  }
}
```

### 3. Navigation Tools

```javascript
{
  name: "find_definition",
  description: "Find where an entity is defined",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      entityName: { type: "string" },
      entityType: { type: "string", enum: ["function", "class", "variable", "module"] }
    },
    required: ["projectId", "entityName"]
  }
}
```

## Integration Patterns

### 1. Standalone Mode

```javascript
// Start MCP server as standalone process
const server = new MCPServer({
  transport: 'stdio',
  pipeline: {
    targetDirectory: process.cwd(),
    workers: 4,
    cache: 'redis://localhost:6379'
  }
});

await server.start();
```

### 2. Claude Code Integration

```javascript
// Integration with Claude Code/Flow
const mcpIntegration = new MCPClaudeIntegration({
  server: 'cognitive-triangulation',
  capabilities: ['project-mapping', 'code-analysis', 'relationship-resolution']
});

// Register with Claude Flow
claudeFlow.registerMCPServer(mcpIntegration);
```

### 3. Library Mode

```javascript
// Use as a library without MCP protocol
const { ProjectMapper } = require('cognitive-triangulation-mcp');

const mapper = new ProjectMapper();
const analysis = await mapper.analyzeProject('./my-project');
```

## Separation of Concerns

### 1. Protocol Layer
- **Responsibility**: MCP protocol implementation
- **Independence**: No knowledge of analysis logic
- **Interface**: Message-based communication

### 2. Analysis Layer
- **Responsibility**: Code analysis and relationship mapping
- **Independence**: Can run without MCP protocol
- **Interface**: Promise-based API

### 3. Storage Layer
- **Responsibility**: Data persistence and caching
- **Independence**: Pluggable storage backends
- **Interface**: Abstract storage interface

### 4. Plugin Layer
- **Responsibility**: Extensible analysis capabilities
- **Independence**: Self-contained plugin modules
- **Interface**: Standard plugin API

## Configuration Schema

```javascript
{
  server: {
    transport: "stdio" | "websocket",
    port: number,
    host: string
  },
  pipeline: {
    workers: number,
    batchSize: number,
    timeout: number,
    llm: {
      provider: string,
      model: string,
      apiKey: string
    }
  },
  storage: {
    sqlite: { path: string },
    neo4j: { uri: string, auth: object },
    redis: { url: string }
  },
  plugins: {
    enabled: string[],
    custom: string[]
  }
}
```

## Deployment Options

### 1. Docker Container
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "mcp:server"]
```

### 2. NPM Package
```bash
npm install cognitive-triangulation-mcp
npx cognitive-mcp serve --transport stdio
```

### 3. Embedded Mode
```javascript
const { createMCPServer } = require('cognitive-triangulation-mcp');
const server = createMCPServer(config);
```

## Security Considerations

1. **Input Validation**: All file paths and queries validated
2. **Sandboxing**: Plugin code runs in isolated context
3. **Access Control**: Project-level access restrictions
4. **Rate Limiting**: Analysis request throttling
5. **Resource Limits**: Memory and CPU usage constraints

## Performance Optimization

1. **Incremental Analysis**: Only analyze changed files
2. **Result Caching**: Cache analysis results by file hash
3. **Parallel Processing**: Distribute work across workers
4. **Lazy Loading**: Load graph data on demand
5. **Streaming Results**: Stream large result sets

## Monitoring and Observability

1. **Metrics**:
   - Analysis throughput
   - Query response times
   - Cache hit rates
   - Worker utilization

2. **Logging**:
   - Structured JSON logs
   - Log levels: debug, info, warn, error
   - Request/response tracing

3. **Health Checks**:
   - Database connectivity
   - Queue system status
   - Worker pool health

## Future Enhancements

1. **Real-time Analysis**: Watch mode for continuous analysis
2. **Distributed Mode**: Multi-node deployment support
3. **AI Enhancement**: Improved LLM integration
4. **Visual Tools**: Web-based visualization interface
5. **API Gateway**: REST/GraphQL API support