# Globale Installatie van Cognitive Triangulation MCP

Deze handleiding legt uit hoe je de Cognitive Triangulation Pipeline als globale MCP server installeert voor Claude Code.

## Installatie Opties

### Optie 1: Installeer vanaf GitHub (Aanbevolen)

```bash
# Clone het project
git clone https://github.com/jouw-username/cognitive-triangulation-mcp.git
cd cognitive-triangulation-mcp

# Installeer dependencies
npm install

# Installeer globaal met npm link
npm link
```

### Optie 2: Installeer direct vanaf GitHub

```bash
npm install -g git+https://github.com/jouw-username/cognitive-triangulation-mcp.git
```

### Optie 3: Installeer vanaf NPM (wanneer gepubliceerd)

```bash
npm install -g cognitive-triangulation-mcp
```

## Configuratie voor Claude Code

Na globale installatie, voeg dit toe aan je Claude Code MCP configuratie (`~/.claude/mcp_config.json`):

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

## Verifieer Installatie

Test of de globale installatie werkt:

```bash
# Check of het command beschikbaar is
which cognitive-triangulation-mcp

# Test het direct
cognitive-triangulation-mcp
# (Ctrl+C om te stoppen)
```

## Gebruik in Claude Code

Na installatie en configuratie:

1. **Start een nieuwe Claude Code sessie**
2. **De MCP server is automatisch beschikbaar**
3. **Gebruik het met:**
   - "Analyze this project using cognitive triangulation"
   - "Extract POIs from these files using cognitive triangulation"
   - "Map out the structure of this codebase"

## Update de Globale Installatie

```bash
# Als geïnstalleerd met npm link
cd /pad/naar/cognitive-triangulation-mcp
git pull
npm install

# Als geïnstalleerd vanaf GitHub
npm update -g cognitive-triangulation-mcp

# Of herinstalleer
npm uninstall -g cognitive-triangulation-mcp
npm install -g git+https://github.com/jouw-username/cognitive-triangulation-mcp.git
```

## Deinstalleren

```bash
npm uninstall -g cognitive-triangulation-mcp
```

## Troubleshooting

### Command niet gevonden
Als `cognitive-triangulation-mcp` niet gevonden wordt:
1. Check je npm global prefix: `npm prefix -g`
2. Zorg dat het bin directory in je PATH staat
3. Herstart je terminal

### MCP server start niet in Claude Code
1. Check de logs: `~/.claude/logs/`
2. Test het command direct in terminal
3. Verifieer je MCP configuratie

### Permission errors
```bash
# Op macOS/Linux
sudo npm install -g cognitive-triangulation-mcp

# Of configureer npm om geen sudo te gebruiken
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

## Development Mode

Voor development, gebruik `npm link` in plaats van globale installatie:

```bash
# In de project directory
npm link

# Test wijzigingen direct zonder herinstallatie
# Wijzigingen in de code zijn direct beschikbaar

# Om te unlinking
npm unlink
```