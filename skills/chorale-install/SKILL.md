---
name: chorale-install
description: Install, launch, upgrade, and connect the Chorale CLI and its local MCP daemon across Codex, Claude, and Antigravity.
---

# Chorale Installation and MCP Setup

Chorale uses a single local background daemon running at `http://127.0.0.1:1685`. It owns the browser workspace, persistent score store (`~/.chorale/`), and MCP tools.

## 1. Install from Source or a Release Archive

Use Node.js 22.13+ on the 22.x line, or 24+. For a source checkout:

```bash
git clone https://github.com/hxy9243/chorale.git
cd chorale

# 1. Install dependencies (also builds through prepare)
npm ci

# 2. Build the interactive web workspace
npm run build

# 3. Link the CLI globally so `chorale` is available in PATH
npm link
```

For v0.0.1, download the built `chorale-0.0.1.tgz` asset from the GitHub release and run `npm install --global /path/to/chorale-0.0.1.tgz`. The archive includes the browser workspace. There is no published `@chorale/cli` package. Direct global GitHub-URL installation is not supported in this release; use the source build or archive.

## 2. Launch and Inspect

```bash
# Start the service and open default browser workspace (idempotent)
chorale

# Check status without starting a service
chorale status

# Gracefully stop the verified daemon
chorale stop

# Pull latest release and restart the verified daemon
chorale upgrade
```

- `chorale` is idempotent: it starts the daemon in the background only when its health endpoint is unavailable, then opens the browser workspace. Never start a second server or choose a fallback port.
- `chorale status` does not launch a daemon. It reports the healthy process and its runtime metadata.
- `chorale stop` terminates only the daemon whose PID and port match `~/.chorale/runtime.json`.
- `chorale upgrade` pulls git changes and rebuilds a source checkout, then restarts the daemon. Private archive installs require installing the new archive first, then `chorale upgrade --skip-pull`. SQLite score data remains in `~/.chorale/`; legacy JSON libraries are not migrated.

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

To upgrade Chorale to the latest release:

```bash
chorale upgrade
```

In a source checkout, `chorale upgrade` pulls git changes, rebuilds the workspace and restarts the daemon. For an archive install, install the new archive explicitly, then run `chorale upgrade --skip-pull`; the private package does not fetch npm registry updates. Back up the SQLite library before updating. Rebuild and reinstall plugin bundles after source updates, and start a new agent task to load updated tools.

## 5. Verification

Verify that the service is running and healthy:

```bash
chorale status
curl -s http://127.0.0.1:1685/v1/health
```

Expected response format:
```json
{"service":"chorale-service","version":"0.0.1","port":1685,"pid":12345,"status":"ok"}
```
