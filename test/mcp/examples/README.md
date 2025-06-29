# MCP Test Example Projects

This directory contains example projects used for testing the MCP server's cognitive triangulation capabilities.

## Example Projects

### 1. simple-express-api
A basic Express.js REST API demonstrating:
- Route handlers
- Middleware usage
- Service layer pattern
- Database connections

### 2. react-todo-app
A React application showcasing:
- Component relationships
- State management
- API integration
- Custom hooks

### 3. microservices-demo
A microservices architecture example with:
- Service-to-service communication
- Shared libraries
- Message queue integration
- API gateway pattern

### 4. typescript-library
A TypeScript library project featuring:
- Complex type definitions
- Generic interfaces
- Abstract classes
- Decorators

## Usage

These projects are automatically used by the test suite. To test manually:

```javascript
const MCPServer = require('../src/mcp/server');
const server = new MCPServer();
await server.start();

// Connect and analyze
const client = new WebSocket('ws://localhost:3003');
// ... analyze example project
```

## Structure Requirements

Each example project should:
1. Have clear, identifiable relationships between modules
2. Include various programming patterns
3. Be small enough for quick testing
4. Represent real-world code structures