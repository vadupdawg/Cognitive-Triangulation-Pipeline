# MCP Integration for Cognitive Triangulation Pipeline

This project now includes an MCP (Model Context Protocol) server that allows Claude Code to use the Cognitive Triangulation Pipeline for analyzing project structures.

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Test the MCP server:**
```bash
npm run start:mcp
```

3. **Run the test suite:**
```bash
node test-mcp.js
```

## Integration with Claude Code

### Option 1: Local Configuration

Add this to your Claude Code MCP configuration file (`~/.claude/mcp_config.json`):

```json
{
  "servers": {
    "cognitive-triangulation": {
      "command": "node",
      "args": ["/absolute/path/to/Cognitive-Triangulation-Pipeline/src/mcp-server-simple.js"],
      "description": "Cognitive Triangulation Pipeline for project structure analysis"
    }
  }
}
```

### Option 2: NPM Global Install (when published)

```bash
npm install -g cognitive-triangulation-mcp
```

Then add to MCP config:
```json
{
  "servers": {
    "cognitive-triangulation": {
      "command": "cognitive-triangulation-mcp",
      "description": "Cognitive Triangulation Pipeline for project structure analysis"
    }
  }
}
```

## Available Tools

### 1. analyzeCodebase
Analyzes an entire codebase and builds a knowledge graph.

**Parameters:**
- `projectPath` (string, required): Path to the project directory

**Example:**
```json
{
  "projectPath": "/path/to/your/project"
}
```

### 2. extractPOIs
Extracts Points of Interest (POIs) from specific files.

**Parameters:**
- `filePaths` (array of strings, required): Array of file paths to analyze

**Example:**
```json
{
  "filePaths": [
    "/path/to/file1.js",
    "/path/to/file2.py"
  ]
}
```

## Using with Claude Flow

Once configured, you can use the Cognitive Triangulation Pipeline in Claude Flow:

```bash
# Use in SPARC analyzer mode
claude-flow sparc run analyzer "Use cognitive triangulation to analyze my project structure"

# Use in coder mode with project understanding
claude-flow sparc run coder "Refactor the authentication system using cognitive triangulation insights"

# Use in architect mode
claude-flow sparc run architect "Design new features based on cognitive triangulation analysis"
```

## Full Integration (Coming Soon)

The full integration will include:
- `buildKnowledgeGraph`: Build Neo4j knowledge graph
- `queryRelationships`: Query relationships with confidence scores
- `cleanupGraph`: Maintain graph integrity

## Requirements

For full functionality, the following services need to be running:
- Redis (for BullMQ job queues)
- Neo4j (for knowledge graph storage)
- SQLite (automatic, for transient data)

## Development

To extend the MCP server:

1. Edit `src/mcp-server-simple.js`
2. Add new tools in the `setupTools()` method
3. Implement handlers for the tools
4. Update this documentation

## Troubleshooting

1. **Server won't start**: Check that all dependencies are installed
2. **Tools not working**: Verify Redis and Neo4j are running
3. **Permission errors**: Ensure the script has execute permissions

## Architecture

The MCP server acts as a bridge between Claude Code and the Cognitive Triangulation Pipeline:

```
Claude Code <-> MCP Protocol <-> MCP Server <-> Cognitive Triangulation Pipeline
                (JSON-RPC 2.0)                   (Agents, Workers, Queues)
```

This modular design allows the pipeline to be used independently or as part of Claude Code's enhanced capabilities.