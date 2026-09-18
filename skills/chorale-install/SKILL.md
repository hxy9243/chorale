---
name: chorale-install
description: Install, launch, upgrade, and connect the Chorale CLI and its local MCP daemon across Codex, Claude, and Antigravity.
---

# Chorale Installation and MCP Setup

Chorale uses a single local background daemon running at `http://127.0.0.1:1685`. It owns the browser workspace, persistent score store (`~/.chorale/`), and MCP tools.

## 1. Install for Development

```bash
# 1. Install dependencies
npm install

# 2. Build the interactive web workspace
npm run build

# 3. Link the CLI globally so `chorale` is available in PATH
npm link
```

For a released package, install `@chorale/cli` globally instead. Both approaches expose the `chorale` command.

## 2. Launch and Inspect

```bash
# Start the service and open default browser workspace (idempotent)
chorale

# Check status without starting a service
chorale status

# Gracefully stop the verified daemon
chorale stop

# Restart the verified daemon after an update
chorale upgrade
```

- `chorale` is idempotent: it starts the daemon in the background only when its health endpoint is unavailable, then opens the browser workspace. Never start a second server or choose a fallback port.
- `chorale status` does not launch a daemon. It reports the healthy process and its runtime metadata.
- `chorale stop` terminates only the daemon whose PID and port match `~/.chorale/runtime.json`.
- `chorale upgrade` gracefully stops the running daemon and starts the updated executable while preserving score data in `~/.chorale/`.

## 3. Agent MCP Integration

The stdio adapter (`chorale mcp`) ensures the background HTTP daemon is alive on port 1685 and forwards all tool calls to it. UI state, selection reads, and score mutations are therefore shared seamlessly between AI agents and the browser workspace.

### A. Google Antigravity (AGY)

Skills and references are maintained centrally in `skills/`.

**Option 1: Antigravity Plugin (Recommended)**
Run the packaging command to automatically stage the skills into the plugin bundle, then install:
```bash
# 1. Package the plugin (automatically copies skills/ to plugins/antigravity/skills/)
npm run package:antigravity

# 2. Install the plugin into Antigravity
agy plugin install plugins/antigravity
```

**Option 2: Global Configuration & Direct MCP**
Copy or symlink the skills globally and register the MCP server:
```bash
# Auto-copy skills into global config
mkdir -p ~/.gemini/config/skills
cp -r skills/chorale-score ~/.gemini/config/skills/
cp -r skills/chorale-install ~/.gemini/config/skills/
```
And add to `.agents/mcp_config.json` or `~/.gemini/antigravity/mcp_config.json`:
```json
{
  "mcpServers": {
    "chorale": {
      "command": "chorale",
      "args": ["mcp"]
    }
  }
}
```

### B. OpenAI Codex

**Option 1: Codex Plugin via Local Marketplace (Recommended)**
Run the packaging script to automatically bundle the CLI, MCP server, and copy `skills/`:
```bash
# 1. Package the plugin (auto-copies skills/ into plugins/chorale-codex-plugin/skills/)
npm run package:codex

# 2. Register local marketplace and add plugin
codex plugin marketplace add /path/to/chorale
codex plugin add chorale-codex-plugin@chorale-local
```

**Option 2: Direct MCP Registration**
Register the stdio adapter using the Codex CLI:
```bash
codex mcp add chorale -- chorale mcp
```
For a development checkout without `npm link`, configure the absolute script path:
```bash
codex mcp add chorale -- node /absolute/path/to/chorale/bin/chorale.mjs mcp
```

### C. Claude (Claude Code & Claude Desktop)
Add Chorale to your Claude MCP configuration (e.g. `~/.config/Claude/claude_desktop_config.json` or project `.mcp.json`):

**Option 1: Stdio Transport (Recommended)**
```json
{
  "mcpServers": {
    "chorale": {
      "command": "chorale",
      "args": ["mcp"]
    }
  }
}
```

**Option 2: SSE Transport**
```json
{
  "mcpServers": {
    "chorale": {
      "url": "http://127.0.0.1:1685/sse"
    }
  }
}
```

## 4. Upgrade Process

After pulling latest changes or upgrading the package:

```bash
chorale upgrade
```

`chorale upgrade` preserves all score files in `~/.chorale/`. Start a new Codex or agent task when the tool catalog changes.

## 5. Verification

Verify that the service is running and healthy:

```bash
chorale status
curl -s http://127.0.0.1:1685/v1/health
```

Expected response format:
```json
{"service":"chorale-service","version":"0.0.0","port":1685,"pid":12345,"status":"ok"}
```
