#!/bin/bash

# Setup script for GitHub repository preparation
# This script prepares the codebase for GitHub push

echo "🚀 Cognitive Triangulation MCP - GitHub Setup"
echo "============================================"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📝 Initializing git repository..."
    git init
fi

# Add all files
echo "📦 Adding files to git..."
git add .

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "Initial commit: Cognitive Triangulation Pipeline with MCP Server integration

- Complete pipeline implementation for code analysis
- MCP server for Claude Code integration
- Comprehensive test suite
- GitHub Actions CI/CD workflows
- Documentation and integration guides"

# Set up main branch
git branch -M main

# Display next steps
echo ""
echo "✅ Repository prepared for GitHub!"
echo ""
echo "Next steps:"
echo "1. Create a new repository on GitHub"
echo "2. Add the remote origin:"
echo "   git remote add origin https://github.com/yourusername/cognitive-triangulation-mcp.git"
echo "3. Push to GitHub:"
echo "   git push -u origin main"
echo ""
echo "4. Configure GitHub Secrets for CI/CD:"
echo "   - NPM_TOKEN (for npm publishing)"
echo "   - Any other deployment secrets"
echo ""
echo "5. Update the repository URL in package.json"
echo "6. Test the MCP server locally:"
echo "   npm install"
echo "   npm run start:mcp"
echo ""
echo "📚 See claude-flow-integration.md for detailed integration instructions"