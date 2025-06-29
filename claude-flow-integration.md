# Claude Flow Integration Guide

## Overview

The Cognitive Triangulation Pipeline integrates seamlessly with Claude Flow, providing powerful code analysis capabilities through the Model Context Protocol (MCP). This guide covers advanced integration patterns, best practices, and real-world usage examples.

## Table of Contents

- [Installation and Setup](#installation-and-setup)
- [MCP Server Architecture](#mcp-server-architecture)
- [Claude Flow Commands](#claude-flow-commands)
- [Advanced Integration Patterns](#advanced-integration-patterns)
- [Memory-Driven Workflows](#memory-driven-workflows)
- [Swarm Coordination](#swarm-coordination)
- [Batch Processing Strategies](#batch-processing-strategies)
- [Error Handling and Recovery](#error-handling-and-recovery)
- [Performance Optimization](#performance-optimization)
- [Security Considerations](#security-considerations)

## Installation and Setup

### Prerequisites

- Node.js 18+ installed
- Neo4j 5+ running locally or accessible
- Redis 6+ for queue management
- Claude Flow CLI installed

### Quick Setup

1. **Install the MCP server:**
   ```bash
   npm install cognitive-triangulation-mcp
   ```

2. **Configure Claude Code:**
   Add to your Claude configuration file:
   ```json
   {
     "mcpServers": {
       "cognitive-triangulation": {
         "command": "node",
         "args": ["node_modules/cognitive-triangulation-mcp/src/mcp-server.js"],
         "env": {
           "NEO4J_URI": "bolt://localhost:7687",
           "NEO4J_USER": "neo4j",
           "NEO4J_PASSWORD": "your-password",
           "REDIS_URL": "redis://localhost:6379",
           "LOG_LEVEL": "info"
         }
       }
     }
   }
   ```

3. **Verify installation:**
   ```bash
   ./claude-flow mcp status
   ./claude-flow mcp tools | grep cognitive-triangulation
   ```

## MCP Server Architecture

The MCP server exposes the Cognitive Triangulation Pipeline's capabilities through standardized tools:

```
┌─────────────────────────────────────┐
│         Claude Flow CLI             │
├─────────────────────────────────────┤
│          MCP Protocol               │
├─────────────────────────────────────┤
│    Cognitive Triangulation MCP      │
│  ┌─────────────────────────────┐   │
│  │     Tool Handlers           │   │
│  ├─────────────────────────────┤   │
│  │   Pipeline Orchestrator     │   │
│  ├─────────────────────────────┤   │
│  │  BullMQ Queue Management    │   │
│  ├─────────────────────────────┤   │
│  │   SQLite + Neo4j Storage    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Claude Flow Commands

### Basic Analysis

```bash
# Analyze a single project
./claude-flow sparc "Analyze the codebase at /path/to/project using cognitive-triangulation"

# Analyze with specific patterns
./claude-flow sparc "Analyze only JavaScript files in /path/to/project, excluding tests"

# Quick analysis with defaults
./claude-flow sparc run analyzer "Use cognitive-triangulation to map dependencies in /path/to/project"
```

### Advanced Orchestration

```bash
# Multi-stage analysis workflow
./claude-flow sparc "
1. Use cognitive-triangulation to analyze /path/to/project
2. Store the POI count in memory as 'project_stats'
3. Query all IMPORTS relationships with confidence > 0.8
4. Generate a dependency report
"

# Parallel analysis of multiple projects
./claude-flow swarm "Analyze all microservices in /path/to/services" \
  --strategy analysis \
  --mode distributed \
  --parallel \
  --max-agents 10
```

## Advanced Integration Patterns

### 1. Progressive Analysis Pattern

Analyze large codebases incrementally:

```bash
# Stage 1: Discover and categorize files
./claude-flow sparc "
Use cognitive-triangulation.extractPOIs to scan /project
Store file categories in memory as 'file_analysis'
"

# Stage 2: Analyze critical paths first
./claude-flow sparc "
Read 'file_analysis' from memory
Analyze core modules first using cognitive-triangulation
Store results as 'core_analysis'
"

# Stage 3: Complete analysis
./claude-flow sparc "
Complete full analysis based on 'core_analysis' priorities
Build final knowledge graph
"
```

### 2. Differential Analysis Pattern

Track changes between analyses:

```bash
# Initial baseline
./claude-flow sparc "
Analyze /project with cognitive-triangulation
Store graph snapshot in memory as 'baseline_DATE'
"

# After changes
./claude-flow sparc "
Analyze /project again
Compare with 'baseline_DATE' from memory
Report new dependencies and removed connections
"
```

### 3. Cross-Repository Analysis

Analyze dependencies across multiple repositories:

```bash
# Create analysis workflow
cat > cross-repo-analysis.yml << EOF
name: Cross-Repository Analysis
memory:
  shared: true
steps:
  - name: Analyze Frontend
    tool: cognitive-triangulation.analyzeCodebase
    params:
      projectPath: ./frontend
    output: frontend_graph
  
  - name: Analyze Backend
    tool: cognitive-triangulation.analyzeCodebase
    params:
      projectPath: ./backend
    output: backend_graph
  
  - name: Find Cross-Dependencies
    tool: cognitive-triangulation.queryRelationships
    params:
      query:
        crossProject: true
        relationshipType: "DEPENDS_ON"
EOF

./claude-flow workflow cross-repo-analysis.yml
```

## Memory-Driven Workflows

### Storing Analysis Metadata

```bash
# Store analysis configuration
./claude-flow memory store "analysis_config" '{
  "includePatterns": ["**/*.js", "**/*.ts"],
  "excludePatterns": ["**/node_modules/**"],
  "maxConcurrency": 20,
  "confidenceThreshold": 0.7
}'

# Use stored configuration
./claude-flow sparc "
Read 'analysis_config' from memory
Use it to analyze /project with cognitive-triangulation
"
```

### Building Analysis History

```bash
# Automated daily analysis with history
./claude-flow sparc "
1. Get current date
2. Analyze /project with cognitive-triangulation
3. Count total POIs and relationships
4. Append results to 'analysis_history' in memory
5. If POI count changed by >10%, alert user
"
```

## Swarm Coordination

### Distributed Codebase Analysis

```bash
# Launch analysis swarm
./claude-flow swarm "Deep analysis of monorepo at /large-project" \
  --strategy analysis \
  --mode hierarchical \
  --parallel \
  --max-agents 20 \
  --monitor

# The swarm will:
# 1. Divide the codebase into logical chunks
# 2. Spawn specialized agents for different file types
# 3. Coordinate through shared memory
# 4. Aggregate results into unified graph
```

### Specialized Agent Roles

```javascript
// In swarm mode, agents specialize:
{
  "agents": [
    {
      "role": "scout",
      "task": "Discover and categorize files",
      "tool": "cognitive-triangulation.extractPOIs"
    },
    {
      "role": "analyzer",
      "task": "Deep analysis of complex files",
      "tool": "cognitive-triangulation.analyzeCodebase"
    },
    {
      "role": "resolver",
      "task": "Resolve cross-file relationships",
      "tool": "cognitive-triangulation.queryRelationships"
    },
    {
      "role": "builder",
      "task": "Construct final knowledge graph",
      "tool": "cognitive-triangulation.buildKnowledgeGraph"
    }
  ]
}
```

## Batch Processing Strategies

### Efficient Large-Scale Analysis

```bash
# Create batch configuration
cat > batch-analysis.js << 'EOF'
const projects = [
  '/path/to/project1',
  '/path/to/project2',
  '/path/to/project3'
];

const batchConfig = {
  concurrent: 3,
  timeout: 3600000, // 1 hour per project
  retries: 2,
  errorHandling: 'continue'
};

// Store in memory for workflow
EOF

# Execute batch analysis
./claude-flow sparc "
1. Load batch configuration from batch-analysis.js
2. For each project, run cognitive-triangulation analysis
3. Store results in memory with project name as key
4. Generate consolidated report when complete
"
```

### Incremental Processing

```bash
# Setup incremental analysis
./claude-flow memory store "last_analysis_timestamp" "$(date -u +%s)"

# Run incremental analysis
./claude-flow sparc "
1. Read 'last_analysis_timestamp' from memory
2. Find files modified since timestamp
3. Use cognitive-triangulation to analyze only changed files
4. Update the knowledge graph incrementally
5. Store new timestamp
"
```

## Error Handling and Recovery

### Resilient Analysis Workflows

```bash
# Create resilient workflow with checkpoints
./claude-flow sparc "
1. Start cognitive-triangulation analysis of /project
2. Every 100 files, store progress in memory as 'analysis_checkpoint'
3. If analysis fails, resume from last checkpoint
4. On completion, cleanup checkpoint data
"
```

### Error Recovery Patterns

```javascript
// Automatic retry with exponential backoff
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'Neo4j connection timeout',
    'Redis connection lost',
    'LLM rate limit exceeded'
  ]
};

// Store for use in workflows
await memory.store('retry_config', JSON.stringify(retryConfig));
```

## Performance Optimization

### Parallel Processing Configuration

```bash
# Optimize for large codebases
./claude-flow memory store "performance_config" '{
  "fileAnalysis": {
    "batchSize": 50,
    "concurrency": 20,
    "timeout": 300000
  },
  "llmAnalysis": {
    "maxTokensPerRequest": 4000,
    "parallelRequests": 5,
    "cacheEnabled": true
  },
  "graphBuilding": {
    "batchSize": 1000,
    "transactionSize": 500
  }
}'

# Use optimized configuration
./claude-flow sparc "
Apply 'performance_config' from memory
Analyze /large-project with cognitive-triangulation
Monitor performance metrics
"
```

### Resource Management

```bash
# Monitor resource usage during analysis
./claude-flow monitor &
MONITOR_PID=$!

# Run analysis with resource limits
./claude-flow sparc "
Set max memory usage to 4GB
Set CPU cores to 8
Analyze /project with cognitive-triangulation
Report resource usage statistics
"

kill $MONITOR_PID
```

## Security Considerations

### Secure Configuration

```bash
# Store sensitive configuration securely
./claude-flow memory store "secure_config" '{
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "encrypted": true,
    "certificatePath": "/path/to/cert"
  },
  "analysis": {
    "excludePatterns": ["**/*.env", "**/*secret*", "**/*password*"]
  }
}' --encrypt

# Use secure configuration
./claude-flow sparc "
Load encrypted 'secure_config' from memory
Apply security filters
Analyze /project with cognitive-triangulation
"
```

### Audit Logging

```bash
# Enable comprehensive audit logging
export AUDIT_LOG_PATH=/var/log/cognitive-triangulation/audit.log

./claude-flow sparc "
Enable audit logging for cognitive-triangulation
Analyze /sensitive-project
Log all file access and analysis operations
Generate compliance report
"
```

## Best Practices

1. **Always use memory for configuration**: Store analysis configurations in Claude Flow memory for consistency across runs.

2. **Implement progressive analysis**: Start with high-level analysis and progressively dive deeper based on results.

3. **Monitor long-running analyses**: Use `./claude-flow monitor` to track progress and resource usage.

4. **Leverage swarm mode for large codebases**: Distributed analysis significantly reduces time for large projects.

5. **Regular graph maintenance**: Schedule periodic cleanup of orphaned nodes and relationships.

6. **Version your analysis workflows**: Store workflow definitions in version control alongside your code.

7. **Use appropriate confidence thresholds**: Adjust confidence levels based on your accuracy vs. completeness needs.

## Troubleshooting

### Common Issues and Solutions

1. **Neo4j Connection Failures**
   ```bash
   # Test connection
   ./claude-flow sparc "Test Neo4j connection for cognitive-triangulation"
   
   # Reset connection
   ./claude-flow sparc "Reset cognitive-triangulation database connections"
   ```

2. **Memory Exhaustion**
   ```bash
   # Clear analysis cache
   ./claude-flow memory cleanup --prefix "analysis_cache"
   
   # Reduce batch sizes
   ./claude-flow memory store "batch_size" "10"
   ```

3. **Slow Analysis Performance**
   ```bash
   # Profile analysis performance
   ./claude-flow sparc "
   Profile cognitive-triangulation analysis of /project
   Identify bottlenecks
   Suggest optimizations
   "
   ```

## Example Use Cases

### 1. Architectural Validation
```bash
./claude-flow sparc "
Use cognitive-triangulation to analyze /project
Find all violations of layered architecture
Report any UI components directly accessing database
"
```

### 2. Dependency Management
```bash
./claude-flow sparc "
Analyze /project for circular dependencies
Generate dependency graph visualization
Suggest refactoring to break cycles
"
```

### 3. Code Quality Metrics
```bash
./claude-flow sparc "
Calculate complexity metrics using cognitive-triangulation
Identify files with high coupling
Rank components by maintainability
"
```

## Conclusion

The Cognitive Triangulation MCP integration with Claude Flow provides a powerful platform for automated code analysis. By leveraging the patterns and practices in this guide, you can build sophisticated code intelligence workflows that scale from small projects to large enterprise codebases.

For more information and updates, visit the [project repository](https://github.com/yourusername/cognitive-triangulation-mcp).