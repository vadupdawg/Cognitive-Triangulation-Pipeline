#!/bin/bash

echo "📦 Pushing Cognitive Triangulation MCP to GitHub"
echo "=============================================="

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Show what will be pushed
echo ""
echo "📊 Commits to push:"
git log origin/main..HEAD --oneline

echo ""
echo "📁 Files changed:"
git diff --stat origin/main..HEAD

echo ""
echo "🚀 Ready to push to GitHub!"
echo ""
echo "Run these commands:"
echo ""
echo "1. If the repository doesn't exist yet, create it on GitHub:"
echo "   Go to: https://github.com/new"
echo "   Name: Cognitive-Triangulation-Pipeline"
echo "   Make it public or private as you prefer"
echo ""
echo "2. If you need to change the remote URL:"
echo "   git remote set-url origin https://github.com/YOUR_USERNAME/Cognitive-Triangulation-Pipeline.git"
echo ""
echo "3. Push the changes:"
echo "   git push -u origin main"
echo ""
echo "4. If you get authentication errors, you might need a personal access token:"
echo "   - Go to GitHub Settings > Developer settings > Personal access tokens"
echo "   - Generate a new token with 'repo' permissions"
echo "   - Use the token as your password when git asks"
echo ""
echo "Alternative: Use SSH instead of HTTPS:"
echo "   git remote set-url origin git@github.com:YOUR_USERNAME/Cognitive-Triangulation-Pipeline.git"
echo ""

# Show current remote
echo "Current remote configuration:"
git remote -v