# Installing & Configuring Chorale (CLI, Skill & MCP Server)

Chorale is an independent music workspace, CLI tool, and Model Context Protocol (MCP) server for AI coding agents (**OpenAI Codex**, **Claude Code & Desktop**, **Google Antigravity**, and compatible MCP clients).

It provides deterministic score inspection, bounded measure reads, safe musical mutations, harmonic annotations, and an interactive score workspace running on port **1685** backed by persistent local storage in `~/.chorale/`.

---

## 1. System Architecture

Chorale functions as a standalone CLI application (`chorale`) that launches and manages a background HTTP service while attaching to AI agents over standard MCP transports (stdio and SSE):

```
┌─────────────────────────────────────────┐
│        AI Coding Agent Harness          │
│   (Codex / Antigravity / Claude Code)   │
└────────────────────┬────────────────────┘
                     │ MCP stdio / SSE transport
                     ▼
┌─────────────────────────────────────────┐
│          Chorale CLI & Server           │
│   (chorale / bin/chorale.mjs mcp)       │
│      http://127.0.0.1:1685/             │
│  - REST API & SSE on port 1685          │
│  - Durable storage: ~/.chorale/         │
└────────────────────┬────────────────────┘
                     │ On-demand browser launch
                     │ (open_ui / automatic daemon)
                     ▼
┌─────────────────────────────────────────┐
│      Interactive Music Workspace        │
│   (Built Web App from dist/ on :1685)   │
│   http://127.0.0.1:1685/?file=<docId>   │
└─────────────────────────────────────────┘
```

### Key Principles:
- **Single Authoritative Daemon (Port 1685)**: Binds `http://127.0.0.1:1685` serving the interactive web workspace, REST tool endpoints, and MCP Server-Sent Events (SSE) stream.
- **Shared State via Stdio Proxy**: The stdio adapter (`chorale mcp`) forwards all tool calls to the background HTTP daemon, ensuring that AI agent queries, measure edits, and browser UI state share identical document revisions and selection context.
- **Headless by Default**: All score creation, measure inspection, and edits work headlessly without requiring a browser window to be open.
- **On-Demand Browser Launch**: Agents call `open_ui` to open or activate a specific score in the user's browser whenever visual interaction or playback review is desired.
- **Durable Local Storage**: Saves score documents and revisions directly into `~/.chorale/store.json` and mirrored ABC files in `~/.chorale/scores/`.

---

## 2. Prerequisites & Quick Build

Ensure you have **Node.js (v20+)** and **npm** installed.

```bash
# 1. Clone the repository
git clone https://github.com/hxy9243/chorale.git
cd chorale

# 2. Install dependencies
npm install

# 3. Build the web workspace
npm run build

# 4. (Optional but recommended) Link CLI globally into your PATH
npm link

# 5. Run verification test suite
npm test
```

After `npm link`, the `chorale` command will be accessible anywhere in your shell. For a published package, `npm install --global @chorale/cli` provides the same command.

---

## 3. CLI Usage & Lifecycle Management

The CLI binary is located at `bin/chorale.mjs` (or `chorale` when linked globally):

```bash
# Start the service and open default browser workspace (idempotent no-op if already running)
chorale

# Check daemon health, port, and PID without starting a service
chorale status

# Gracefully stop only the verified Chorale daemon recorded in ~/.chorale/runtime.json
chorale stop

# Restart the verified daemon after a package update, preserving score data
chorale upgrade

# Show command line help and available options
chorale help

# Connect via MCP stdio transport (used by AI agents; ensures background daemon is active)
chorale mcp
```

### Command Behavior:
- `chorale` (or `chorale start`): Idempotent launch. Checks `http://127.0.0.1:1685/v1/health`. If running, opens the workspace in the default browser. If not running, launches the HTTP + MCP server in the background, waits for health, and opens the browser.
- `chorale mcp`: Starts the MCP stdio adapter. Ensures the background service is running on port 1685 and proxies all score tool calls to it.
- `chorale status`: Reports health, port, and PID from recorded runtime metadata without starting a daemon.
- `chorale stop`: Stops only the healthy daemon whose PID and port match `~/.chorale/runtime.json`.
- `chorale upgrade`: Stops the verified daemon, spawns the updated version, and preserves score data in `~/.chorale/`.
- `chorale help`: Displays usage guidance, available commands, and options.

---

## 4. Agent Setup & MCP Configuration

### A. Google Antigravity (AGY)

#### Workspace Integration (Project-Specific)
When working within the Chorale repository, Antigravity automatically detects:
- **Skill:** [`.agents/skills/chorale-score/SKILL.md`](./.agents/skills/chorale-score/SKILL.md)
- **MCP Configuration:** [`.agents/mcp_config.json`](./.agents/mcp_config.json)

```json
{
  "mcpServers": {
    "chorale": {
      "command": "node",
      "args": ["./bin/chorale.mjs", "mcp"]
    }
  }
}
```

#### Global Machine Installation (Available Across All Workspaces)
To make Chorale available in any workspace in Google Antigravity:
1. Add the MCP server entry to `~/.gemini/antigravity/mcp_config.json`:
   ```json
   {
     "mcpServers": {
       "chorale": {
         "command": "node",
         "args": [
           "/absolute/path/to/chorale/bin/chorale.mjs",
           "mcp"
         ]
       }
     }
   }
   ```
2. (Optional) Copy the score skill to your global Antigravity skills directory:
   ```bash
   mkdir -p ~/.gemini/config/skills/chorale-score
   cp .agents/skills/chorale-score/SKILL.md ~/.gemini/config/skills/chorale-score/
   ```

---

### B. OpenAI Codex

Chorale can be registered in Codex using the MCP CLI adapter or installed via local plugin marketplace:

#### Option 1: Direct MCP Registration (Recommended)
```bash
codex mcp add chorale -- chorale mcp
```
Or with an absolute path for development checkouts without `npm link`:
```bash
codex mcp add chorale -- node /absolute/path/to/chorale/bin/chorale.mjs mcp
```

#### Option 2: Codex Plugin via Local Marketplace
Chorale includes a plugin manifest in [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json).
```bash
# 1. Build the production workspace
npm run build

# 2. Register repository as a local marketplace and install plugin
codex plugin marketplace add /absolute/path/to/chorale
codex plugin add chorale-codex-plugin@chorale-local
```

---

### C. Claude Code & Claude Desktop

#### Option 1: Stdio Transport (Recommended)
Add Chorale to your Claude configuration (`claude_desktop_config.json` or project `.mcp.json`):
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
*Note:* When launched via stdio, `chorale mcp` automatically starts the background daemon on port 1685 if it is not already running.

#### Option 2: SSE Transport
If you prefer connecting over HTTP Server-Sent Events to an already active Chorale daemon:
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

## 5. Upgrade Process

To upgrade Chorale after installing a newer package or pulling latest changes:

```bash
# For global npm package:
npm update --global @chorale/cli
chorale upgrade

# For source repository:
git pull origin main
npm install
npm run build
chorale upgrade
```

`chorale upgrade` preserves all score files and history in `~/.chorale/`. Start a new agent task when tool definitions are updated.

---

## 6. Verification & Health Checks

Verify that the background service is running and healthy:

```bash
# Check CLI status
chorale status

# Probe HTTP health endpoint
curl -s http://127.0.0.1:1685/v1/health

# List score documents in ~/.chorale/
curl -s http://127.0.0.1:1685/v1/files
```
Expected health response:
```json
{"service":"chorale-service","version":"0.0.0","port":1685,"pid":12345,"status":"ok"}
```

---

## 7. MCP Tool Reference

The Chorale MCP server registers 16 modular tools across file management, sheet operations, and workspace control:

### File Management Tools
| Tool | Description | Inputs |
| :--- | :--- | :--- |
| `create_new_file` | Create a new score document in `~/.chorale/` from ABC notation or default piano template. | `title` (string), optional `abcSource`, `composer`, `meter`, `key` |
| `list_files` | List all locally managed score files with ID, title, revision, measure count, and annotation count. | (none) |
| `delete_file` | Delete a score file from `~/.chorale/` by its document ID. | `documentId` (string) |
| `import_file` | Import a score file from disk path or string content (`.xml`, `.musicxml`, `.mxl`, `.abc`) into `~/.chorale/`. | optional `filePath`, `content`, `format` (`auto`/`musicxml`/`mxl`/`abc`), `title` |
| `export_file` | Export a score document from `~/.chorale/` to ABC, JSON, or a file on disk. | `documentId` (string), optional `format` (`abc`/`json`), optional `outputPath` |

### Sheet & Measure Operations
| Tool | Description | Inputs |
| :--- | :--- | :--- |
| `read_measure` | Read written ABC notation for specific measure(s) or the current user selection in the active view. | optional `documentId`, `startMeasure`, `endMeasure`, `voiceId`, `viewId` |
| `insert_measure` | Insert new measure(s) before or after a target measure in the score. | `documentId`, `targetMeasure`, optional `position` (`before`/`after`), optional `count`, optional `abcContent`, `expectedRevision` |
| `edit_measures` | Replace written measures across a specified span with replacement ABC notation (supports variable measure lengths; alias: `edit_measure`). | `documentId`, `startMeasure`, `endMeasure`, `replacementAbc`, optional `summary`, `expectedRevision` |
| `delete_measures` | Delete a range of measures from the score. | `documentId`, `startMeasure`, `endMeasure`, `expectedRevision` |
| `add_notation` | Add harmonic analysis, chord symbols, Roman numerals, or analytical notes to score measures. | `documentId`, `expectedRevision`, `notations` (array of `{ startMeasure, endMeasure, label, body, kind, chordSymbol, romanNumeral }`) |
| `edit_notations` | Update an existing notation/annotation on the score. | `documentId`, `notationId`, `updates` (object), `expectedRevision` |
| `delete_notations` | Delete one or more annotations by their IDs. | `documentId`, `notationIds` (array of strings), `expectedRevision` |
| `list_notations` | List all annotations for a score document or within a specified measure span. | `documentId`, optional `startMeasure`, optional `endMeasure` |

### Workspace & UI Tools
| Tool | Description | Inputs |
| :--- | :--- | :--- |
| `open_ui` | Launch the Chorale interactive score workspace on port 1685 in the user's browser, optionally activating a specific score. | optional `documentId` |
| `get_workspace_state` | Query overall workspace state headlessly: document count, connected views count, and focused view details. | (none) |
| `render_score_workspace` | Render the selected score in an interactive MCP Apps workspace view. | `documentId` (string) |
