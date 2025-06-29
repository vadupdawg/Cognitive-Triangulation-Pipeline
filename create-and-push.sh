#!/bin/bash

echo "🚀 Creating and pushing to GitHub repository"
echo "==========================================="

# Check if gh CLI is available
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI found!"
    
    # Check if authenticated
    if gh auth status &> /dev/null; then
        echo "✅ Already authenticated with GitHub"
        
        # Create the repository
        echo "📦 Creating repository on GitHub..."
        gh repo create Cognitive-Triangulation-Pipeline \
            --public \
            --description "Automated Backend Analysis and Code Knowledge with MCP Integration" \
            --source=. \
            --remote=origin \
            --push
            
        echo "✅ Repository created and code pushed!"
        echo "🔗 View at: https://github.com/$(gh api user -q .login)/Cognitive-Triangulation-Pipeline"
    else
        echo "❌ Not authenticated. Running: gh auth login"
        gh auth login
    fi
else
    echo "❌ GitHub CLI not installed."
    echo ""
    echo "Option 1: Install GitHub CLI"
    echo "  brew install gh  # macOS"
    echo "  Then run: gh auth login"
    echo ""
    echo "Option 2: Create repository manually"
    echo "  1. Go to https://github.com/new"
    echo "  2. Name: Cognitive-Triangulation-Pipeline"
    echo "  3. Then run: git push -u origin main"
    echo ""
    echo "Option 3: Use Personal Access Token"
    echo "  1. Go to GitHub Settings > Developer settings > Personal access tokens"
    echo "  2. Generate token with 'repo' scope"
    echo "  3. Run: git push https://YOUR_TOKEN@github.com/vadupdawg/Cognitive-Triangulation-Pipeline.git main"
fi