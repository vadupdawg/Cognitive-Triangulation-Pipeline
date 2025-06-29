# 🎯 Laatste Stappen - Na GitHub Push

## 1. Test de globale installatie

```bash
# Installeer globaal vanaf jouw GitHub
npm install -g git+https://github.com/vadupdawg/Cognitive-Triangulation-Pipeline.git

# Of als je al gelinkt hebt met npm link, is dit niet nodig
```

## 2. Configureer Claude Code (eenmalig)

```bash
# Dit heb je waarschijnlijk al gedaan, maar check het even:
cat ~/.claude/mcp_config.json

# Moet dit bevatten:
{
  "servers": {
    "cognitive-triangulation": {
      "command": "cognitive-triangulation-mcp",
      "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
    }
  }
}
```

## 3. Test het!

Open een **nieuwe** terminal (belangrijk!) en ga naar een willekeurig project:

```bash
cd ~/Projects/een-ander-project
claude
```

Test commando's:
- "Use cognitive triangulation to analyze this project"
- "Show me the structure of this codebase using cognitive triangulation"
- "Extract POIs from the src directory"

## 4. Voor andere gebruikers

Zij kunnen nu gewoon:

```bash
# Installeren
npm install -g git+https://github.com/vadupdawg/Cognitive-Triangulation-Pipeline.git

# Configureren  
curl -s https://raw.githubusercontent.com/vadupdawg/Cognitive-Triangulation-Pipeline/main/setup-global-mcp.sh | bash

# Gebruiken
claude
```

## ✅ Checklist

- [ ] GitHub repository is online
- [ ] `npm install -g` werkt
- [ ] `cognitive-triangulation-mcp` command is beschikbaar
- [ ] `~/.claude/mcp_config.json` bevat de juiste configuratie
- [ ] Claude Code herkent de MCP server in nieuwe sessies

## 🐛 Troubleshooting

**MCP niet beschikbaar in Claude?**
1. Start een NIEUWE terminal
2. Check: `which cognitive-triangulation-mcp`
3. Check: `cat ~/.claude/mcp_config.json`

**Command not found?**
```bash
npm list -g cognitive-triangulation-mcp
# Als niet geïnstalleerd, run npm install -g weer
```

## 🎉 Klaar!

Je hebt nu een globale MCP server die:
- In elke Claude Code sessie beschikbaar is
- Project structuren kan analyseren
- POIs kan extraheren
- Makkelijk te updaten is met `npm update -g`