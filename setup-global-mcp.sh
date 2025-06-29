#!/bin/bash

# Setup script for GLOBAL MCP integration with Claude Code

echo "🌍 Setting up GLOBAL Cognitive Triangulation Pipeline MCP Server"
echo "=============================================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if the package is globally installed
if ! command -v cognitive-triangulation-mcp &> /dev/null; then
    echo -e "${RED}❌ cognitive-triangulation-mcp is not globally installed.${NC}"
    echo ""
    echo "Please install it first using one of these methods:"
    echo ""
    echo "1. From this directory (recommended for development):"
    echo "   npm link"
    echo ""
    echo "2. From GitHub:"
    echo "   npm install -g git+https://github.com/your-username/cognitive-triangulation-mcp.git"
    echo ""
    exit 1
fi

# Get the path to the global command
GLOBAL_COMMAND=$(which cognitive-triangulation-mcp)
echo -e "${GREEN}✅ Found global installation at: $GLOBAL_COMMAND${NC}"

# Create MCP config directory if it doesn't exist
MCP_CONFIG_DIR="$HOME/.claude"
mkdir -p "$MCP_CONFIG_DIR"

# Create or update MCP config
MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp_config.json"

# Check if config file exists
if [ -f "$MCP_CONFIG_FILE" ]; then
    echo "📄 Found existing MCP config at $MCP_CONFIG_FILE"
    echo "   Updating cognitive-triangulation server to use global command..."
    
    # Backup existing config
    cp "$MCP_CONFIG_FILE" "$MCP_CONFIG_FILE.backup.$(date +%s)"
    
    # Use jq to update our server configuration
    if command -v jq &> /dev/null; then
        jq '.servers["cognitive-triangulation"] = {
              "command": "cognitive-triangulation-mcp",
              "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
            }' "$MCP_CONFIG_FILE" > "$MCP_CONFIG_FILE.tmp" && mv "$MCP_CONFIG_FILE.tmp" "$MCP_CONFIG_FILE"
        echo -e "${GREEN}✅ Updated MCP configuration${NC}"
    else
        echo -e "${YELLOW}⚠️  jq not found. Please manually update $MCP_CONFIG_FILE${NC}"
        echo ""
        echo "Add or update this configuration:"
        cat << EOF
{
  "servers": {
    "cognitive-triangulation": {
      "command": "cognitive-triangulation-mcp",
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
      "command": "cognitive-triangulation-mcp",
      "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
    }
  }
}
EOF
    echo -e "${GREEN}✅ Created MCP configuration${NC}"
fi

# Test the global command
echo ""
echo "🧪 Testing global MCP server..."
(
    # Test by running briefly
    timeout 2 cognitive-triangulation-mcp > /tmp/mcp-global-test.log 2>&1
    
    if grep -q "MCP Server listening on stdio" /tmp/mcp-global-test.log; then
        echo -e "${GREEN}✅ Global MCP server is working correctly!${NC}"
        rm -f /tmp/mcp-global-test.log
    else
        echo -e "${RED}❌ Global MCP server test failed${NC}"
        echo "Error log:"
        cat /tmp/mcp-global-test.log
        rm -f /tmp/mcp-global-test.log
        exit 1
    fi
)

echo ""
echo -e "${GREEN}✨ Global setup complete!${NC}"
echo ""
echo "📖 The Cognitive Triangulation MCP is now available globally!"
echo ""
echo "Next steps:"
echo "1. Open a NEW terminal window"
echo "2. Start Claude Code anywhere: claude"
echo "3. The MCP server will be automatically available"
echo ""
echo "📚 Available tools in any Claude Code session:"
echo "   - analyzeCodebase: Analyze entire codebases"
echo "   - extractPOIs: Extract Points of Interest from specific files"
echo ""
echo "Example usage:"
echo '   "Use cognitive triangulation to analyze this project"'
echo '   "Extract POIs from src/ using cognitive triangulation"'
echo ""
echo -e "${YELLOW}Note: Restart any existing Claude Code sessions to load the updated configuration${NC}"