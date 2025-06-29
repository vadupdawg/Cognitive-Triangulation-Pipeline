#!/bin/bash

# Setup script for MCP integration with Claude Code

echo "🚀 Setting up Cognitive Triangulation Pipeline MCP Server"
echo "========================================================"

# Get the absolute path of the current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create MCP config directory if it doesn't exist
MCP_CONFIG_DIR="$HOME/.claude"
mkdir -p "$MCP_CONFIG_DIR"

# Create or update MCP config
MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp_config.json"

# Check if config file exists
if [ -f "$MCP_CONFIG_FILE" ]; then
    echo "📄 Found existing MCP config at $MCP_CONFIG_FILE"
    echo "   Adding cognitive-triangulation server..."
    
    # Backup existing config
    cp "$MCP_CONFIG_FILE" "$MCP_CONFIG_FILE.backup"
    
    # Use jq to add our server (install jq if not available)
    if command -v jq &> /dev/null; then
        jq --arg path "$SCRIPT_DIR/src/mcp-server-simple.js" \
           '.servers["cognitive-triangulation"] = {
              "command": "node",
              "args": [$path],
              "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
            }' "$MCP_CONFIG_FILE" > "$MCP_CONFIG_FILE.tmp" && mv "$MCP_CONFIG_FILE.tmp" "$MCP_CONFIG_FILE"
    else
        echo "⚠️  jq not found. Please manually add the following to $MCP_CONFIG_FILE:"
        echo ""
        cat << EOF
{
  "servers": {
    "cognitive-triangulation": {
      "command": "node",
      "args": ["$SCRIPT_DIR/src/mcp-server-simple.js"],
      "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
    }
  }
}
EOF
    fi
else
    echo "📄 Creating new MCP config at $MCP_CONFIG_FILE"
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "servers": {
    "cognitive-triangulation": {
      "command": "node",
      "args": ["$SCRIPT_DIR/src/mcp-server-simple.js"],
      "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
    }
  }
}
EOF
fi

# Test the MCP server
echo ""
echo "🧪 Testing MCP server..."
# Create a simple test by running the server and sending a test request
(
    # Start server in background
    npm run start:mcp > /tmp/mcp-test.log 2>&1 &
    SERVER_PID=$!
    
    # Wait a moment for server to start
    sleep 2
    
    # Kill the server
    kill $SERVER_PID 2>/dev/null
    
    # Check if server started successfully
    if grep -q "MCP Server listening on stdio" /tmp/mcp-test.log; then
        echo "✅ MCP server is working correctly!"
        rm -f /tmp/mcp-test.log
        exit 0
    else
        echo "❌ MCP server test failed. Check the logs:"
        cat /tmp/mcp-test.log
        rm -f /tmp/mcp-test.log
        exit 1
    fi
)

echo ""
echo "✨ Setup complete!"
echo ""
echo "📖 Next steps:"
echo "1. Restart Claude Code to load the new MCP server"
echo "2. Use the cognitive triangulation tools in your Claude Code sessions"
echo "3. Example: Ask Claude to 'analyze this project structure using cognitive triangulation'"
echo ""
echo "📚 Available tools:"
echo "   - analyzeCodebase: Analyze entire codebases"
echo "   - extractPOIs: Extract Points of Interest from specific files"
echo ""
echo "For more information, see MCP_INTEGRATION.md"