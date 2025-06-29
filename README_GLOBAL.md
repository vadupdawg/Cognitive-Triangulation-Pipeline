# 🌍 Cognitive Triangulation MCP - Globale Installatie

## Quick Start voor Globale Installatie

### 1. Clone & Installeer

```bash
# Clone het project
git clone https://github.com/jouw-username/cognitive-triangulation-mcp.git
cd cognitive-triangulation-mcp

# Installeer dependencies
npm install

# Link globaal (voor development)
npm link

# OF installeer direct vanaf GitHub
npm install -g git+https://github.com/jouw-username/cognitive-triangulation-mcp.git
```

### 2. Configureer voor Claude Code

```bash
# Run het setup script
./setup-global-mcp.sh
```

Of doe het handmatig - voeg dit toe aan `~/.claude/mcp_config.json`:

```json
{
  "servers": {
    "cognitive-triangulation": {
      "command": "cognitive-triangulation-mcp",
      "description": "Cognitive Triangulation Pipeline - Analyze code structure with multi-perspective LLM analysis"
    }
  }
}
```

### 3. Klaar!

Open een **nieuwe** Claude Code sessie overal op je systeem:

```bash
cd /any/project/directory
claude
```

De Cognitive Triangulation MCP is nu automatisch beschikbaar!

## Gebruik

In elke Claude Code sessie kun je nu zeggen:

- "Analyze this project structure using cognitive triangulation"
- "Use cognitive triangulation to map out how this codebase works"
- "Extract POIs from the src directory"
- "Show me the relationships between components using cognitive triangulation"

## Voordelen van Globale Installatie

✅ **Altijd beschikbaar** - In elke Claude Code sessie  
✅ **Geen configuratie per project** - Eenmaal instellen  
✅ **Automatic updates** - Update één keer, werkt overal  
✅ **Consistent** - Zelfde versie in alle projecten  

## Updates

```bash
# Als gelinkt met npm link
cd /path/to/cognitive-triangulation-mcp
git pull
npm install

# Als geïnstalleerd vanaf GitHub  
npm update -g cognitive-triangulation-mcp
```

## Troubleshooting

### Command niet gevonden?
```bash
# Check installatie
npm list -g cognitive-triangulation-mcp

# Check PATH
echo $PATH
npm bin -g
```

### MCP niet beschikbaar in Claude Code?
1. Herstart Claude Code (nieuwe terminal)
2. Check `~/.claude/mcp_config.json`
3. Test command: `cognitive-triangulation-mcp`

## Voor Developers

Als je aan de code werkt:

```bash
# In project directory
npm link  # Maakt symlink

# Wijzigingen zijn direct beschikbaar
# Geen herinstallatie nodig!

# Om te verwijderen
npm unlink
```

---

**Tip**: De globale installatie is ideaal voor dagelijks gebruik. Voor development gebruik `npm link` zodat je wijzigingen direct kunt testen.