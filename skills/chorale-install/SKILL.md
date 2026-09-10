---
name: chorale-install
description: Step-by-step installation, build, and MCP integration instructions for the Chorale music workspace across Codex, Claude, and Antigravity.
---

# Chorale Installation & Agent Setup

This skill guides agents and users through installing, building, launching, and integrating Chorale with AI agent harnesses.

---

## 1. Prerequisites & Installation

Chorale requires **Node.js v20+** and **npm**.

```bash
# 1. Install dependencies
npm install

# 2. Build the interactive web workspace
npm run build

# 3. (Optional) Link the CLI globally so `chorale` is available in PATH
npm link
```

---

## 2. Launching the Service (`chorale`)

Chorale uses a single CLI entry point (`bin/chorale.mjs` or `chorale`):

```bash
# Start the service (or run via npx)
chorale

# Or via npm
npm start
```

### Behavior:
- **Port 1685:** Binds `http://127.0.0.1:1685` serving the Web UI, REST API, and MCP SSE transport.
- **Idempotent No-Op:** If the service is already running on port 1685, it skips initialization and immediately opens the workspace in the browser.
- **Browser Launch:** Opens the UI in the user's browser, preferring agent harness browsers (Codex webview, Antigravity, Claude) when running inside an agent environment.
- **Persistent Storage:** Stores all files and workspaces in `~/.chorale/` (`~/.chorale/store.json` and `~/.chorale/scores/`).

### Background / Daemon Mode:
```bash
node bin/chorale.mjs --daemon
```

---

## 3. Agent MCP Integration

### A. Claude (Claude Code & Claude Desktop)
Add Chorale to your Claude MCP configuration (e.g. `~/.config/Claude/claude_desktop_config.json` or project `.mcp.json`):

**Option 1: Stdio Transport (Recommended)**
```json
{
  "mcpServers": {
    "chorale": {
      "command": "node",
      "args": ["/path/to/chorale/bin/chorale.mjs", "mcp"]
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

---

### B. Codex
In your Codex environment or project configuration:
```json
{
  "mcpServers": {
    "chorale": {
      "command": "node",
      "args": ["/path/to/chorale/bin/chorale.mjs", "mcp"],
      "cwd": "/path/to/chorale"
    }
  }
}
```

---

### C. Antigravity
In Antigravity's MCP configuration (`~/.gemini/antigravity/mcp/chorale/` or project config):
```json
{
  "mcpServers": {
    "chorale": {
      "command": "node",
      "args": ["/path/to/chorale/bin/chorale.mjs", "mcp"]
    }
  }
}
```

---

## 4. Verification

Verify that the service is running and healthy:

```bash
# Check service health
curl -s http://127.0.0.1:1685/v1/health

# List locally managed score files
curl -s http://127.0.0.1:1685/v1/files
```
Expected response:
```json
{"service":"chorale-service","version":"1.0.0","port":1685,"status":"ok"}
```
