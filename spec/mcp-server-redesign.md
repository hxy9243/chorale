---
title: "Chorale MCP Server & UX Redesign"
description: "Unified HTTP UI and MCP service on port 1685, single CLI entry point, ~/.chorale/ filesystem persistence, and multi-agent plugin interfaces"
category: "architecture"
date: 2026-09-10
status: "approved"
source_files:
  - bin/chorale.mjs
  - server/cli.mjs
  - server/api_server.mjs
  - server/mcp/index.mjs
  - server/runtime.mjs
  - server/version.mjs
  - server/store.mjs
  - server/views.mjs
  - server/mcp/tools/file-management.mjs
  - server/mcp/tools/sheet-management.mjs
  - server/mcp/tools/workspace.mjs
  - server/utils/measure-ops.mjs
  - server/utils/music-xml.mjs
  - src/hooks/usePluginMcpBridge.ts
test_files:
  - test/mcp-server.node.mjs
  - test/cli-runtime.node.mjs
  - test/measure-ops.node.mjs
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/annotations-and-proposals.md
  - spec/file-workspace-architecture.md
---

# Chorale MCP Server & UX Redesign

## 1. Executive Summary

Chorale is redesigned from a monolithic script and fragmented plugin wrappers into a unified, modular music workspace service. The service operates on a single fixed port (**1685**), combining:
1. Static Web UI delivery (built React/Vite workspace from `dist/`).
2. REST API endpoints for workspace synchronization, document CRUD, view heartbeats, and direct tool execution.
3. Model Context Protocol (MCP) transports (HTTP/SSE transport on `/sse` and stdio bridge for command-line clients).
4. Local document persistence strictly backed by the filesystem in `~/.chorale/` instead of browser sandbox storage.
5. A single executable CLI command (`chorale`) that idempotently ensures the service is running and launches the UI in the user's browser, preferring agent harness webviews (Codex, Antigravity, Claude) when available.

---

## 2. Core Architecture

### 2.1 Single CLI Entry Point (`chorale`)
- Path: `bin/chorale.mjs` (linked in `package.json` under `"bin": { "chorale": "./bin/chorale.mjs" }`).
- **Command Behavior:**
  - `chorale` or `chorale start`:
    1. Sends a probe request to `http://127.0.0.1:1685/v1/health`.
    2. If healthy, reports that the service is already running (idempotent no-op).
    3. If not running, launches the HTTP + MCP server in the background on port 1685 and waits for its health response.
    4. Opens the workspace in the browser: checks for active agent harness environments (e.g. Codex webview via environment variables, Antigravity desktop browser, Claude environment) before falling back to system-default browser (`google-chrome`, `xdg-open`, `open`, `start`).
  - `chorale mcp` or `chorale --stdio`:
    - Ensures the background HTTP service is active, then exposes a stdio adapter whose tools all forward to that daemon. It must not construct an independent document or view store.
  - `chorale status`:
    - Reports health and recorded runtime metadata without launching a daemon.
  - `chorale stop`:
    - Gracefully stops only the healthy daemon whose PID and port match recorded runtime metadata.
  - `chorale upgrade`:
    - Automatically pulls the latest release (fetching latest git commits and rebuilding workspace assets when run in a source checkout, or updating via package manager for package installs), then gracefully restarts the verified background daemon while preserving the local score store. Supports `--skip-pull` or `--no-pull` to bypass pulling if desired.
  - `chorale help`, `chorale --help`, or `chorale -h`:
    - Displays usage instructions, available CLI commands, and supported flags.
  - `chorale version`, `chorale --version`, or `chorale -v`:
    - Displays current Chorale package version.
  - `chorale --serve`:
    - Internal foreground daemon mode. It owns the process lock and lifecycle metadata; it is not the normal user-facing launch command.

### 2.1.1 Runtime lifecycle

- `~/.chorale/runtime.json` records the daemon PID, executable path, package version, port, and start time after the server begins listening.
- `~/.chorale/runtime.lock` is held for the daemon lifetime. Startup removes it only when its recorded PID is no longer alive.
- The port is always 1685. If another healthy Chorale daemon wins a startup race, the contender succeeds as a no-op. If an unrelated process owns the port, startup fails without terminating that process.
- Graceful shutdown removes runtime metadata and the lock. An interrupted process leaves stale metadata that the next launch can safely recover.

### 2.2 Network & Protocol Boundary (Port 1685)
- Standard port: **1685** (`http://127.0.0.1:1685`).
- **HTTP Endpoints:**
  - `GET /`: Serves static web UI (`dist/index.html` and assets).
  - `GET /v1/health`: Returns `{ service: "chorale-service", version, port: 1685, pid, status: "ok" }`.
  - `GET /v1/workspace`: Returns active workspace JSON state.
  - `PUT /v1/workspace`: Persists full workspace state.
  - `PUT /v1/workspace/documents`: Persists updated documents array via atomic last-write-wins (no optimistic revision locking or 409 Conflict errors).
  - `PUT /v1/workspace/active-document`: Sets active document ID.
  - `GET /v1/files`: Lists files saved in `~/.chorale/`.
  - `GET /v1/scores/:id`: Retrieves a single document by ID.
  - `POST /v1/tools/:toolName`: Invokes an MCP tool directly via HTTP JSON-RPC.
  - `GET /sse`: MCP Server-Sent Events stream.
  - `POST /messages`: MCP SSE message receiver.
  - `GET /v1/views/:viewId`: Retrieves active view snapshot.
  - `PUT /v1/views/:viewId`: Updates view snapshot (heartbeat + measure selection).
  - `GET /v1/views/:viewId/commands`: Polling endpoint for view commands.
  - `POST /v1/views/:viewId/commands/:commandId/ack`: Command acknowledgment.

### 2.3 Local SQLite Storage (`~/.chorale/chorale.db`)
- Root directory: `~/.chorale/` (overrideable via `CHORALE_HOME`, `CHORALE_DB_PATH`, or `CHORALE_STORE_PATH`).
- Storage engine:
  - `~/.chorale/chorale.db`: Local SQLite database powered by Node.js standard library `node:sqlite` (`DatabaseSync`), operating in WAL mode with foreign keys enabled.
  - Relational schema: `documents`, `workspace_documents` (preserves file rail ordering), `document_versions`, `document_history`, and `workspace` (singleton tracking revision and layout preferences).
  - `~/.chorale/scores/`: Raw exported/mirrored ABC files (`${documentId}.abc`).
- ACID transactions: Granular updates to documents, versions, history entries, and workspace preferences run inside immediate SQLite transactions with WAL concurrency safety.

---

## 3. Modular Server Architecture (`server/`)

The backend daemon is cleanly partitioned into REST API, persistence, CLI runtime, and an embedded MCP module:

```
server/
├── api_server.mjs          # Node.js HTTP server hosting UI, REST API (/v1/*), and SSE MCP
├── cli.mjs                 # CLI command handler (chorale start, chorale mcp, etc.)
├── daemon-mutations.mjs    # Tool mutation proxying to daemon
├── runtime.mjs             # Process lock, PID metadata, port constants
├── store.mjs               # Durable LocalDocumentStore (SQLite ~/.chorale/chorale.db)
├── version.mjs             # Chorale version metadata
├── views.mjs               # In-memory ViewSnapshotStore tracking live browser views
├── mcp/
│   ├── index.mjs           # McpServer instance & tool registration
│   └── tools/              # 16 MCP agent tools
│       ├── file-management.mjs # File operations: create, list, delete, import, export
│       ├── sheet-management.mjs# Musical mutations: read, insert, edit, delete measures & notations
│       └── workspace.mjs       # UI & workspace: open_ui, get_workspace_state, render_score_workspace
└── utils/
    ├── measure-ops.mjs     # Measure parsing and manipulation logic
    └── music-xml.mjs       # MusicXML conversion utilities
```

### 3.1 File Management Tools
- `create_new_file`: Creates a new score document with title and optional ABC source (or default piano template).
- `list_files`: Lists all files in the workspace with ID, title, revision, measure count, annotation count, and timestamp.
- `delete_file`: Deletes a score document by ID.
- `import_file`: Imports a file from disk path or string content (`.xml`, `.musicxml`, `.mxl`, `.abc`), converts to canonical ABC, and saves to `~/.chorale/`.
- `export_file`: Exports a score document to ABC or MusicXML, returning the text content or writing to an output file path.

### 3.2 Sheet Management Tools
- `read_measure`: Reads written ABC notation for specified measure range (or currently selected measures in live view).
- `insert_measure`: Inserts new measures at a target index (before/after) with specified content or blank bars.
- `edit_measures`: Replaces written measures across specified span with replacement ABC notation (supports variable measure lengths; aliased as `edit_measure` for backward compatibility).
- `delete_measures`: Removes written measures across specified span.
- `add_notation`: Adds harmonic, Roman numeral, or analytical annotations to measures.
- `edit_notations`: Edits existing annotations by ID.
- `delete_notations`: Deletes annotations by ID.
- `list_notations`: Lists annotations on a score or measure span.

### 3.3 Workspace Tools
- `open_ui`: Launches the browser to `http://127.0.0.1:1685/?file=<documentId>`, preferring agent harness webviews.
- `get_workspace_state`: Returns current document inventory, active score summary, and connected views.
- `render_score_workspace`: UI resource provider for MCP Apps iframe hosts.

---

## 4. Multi-Agent Plugin Interfaces

### 4.1 Codex
- Manifest under `plugins/codex/plugin.json`.
- Configures skill directory and stdio/SSE MCP server endpoint pointing to `chorale mcp`.

### 4.2 Claude
- Configuration template `plugins/claude/.mcp.json` and desktop configuration snippet.
- Connects either via stdio command `chorale mcp` or SSE endpoint `http://127.0.0.1:1685/sse`.

### 4.3 Antigravity
- Manifest `plugins/antigravity/plugin.json` and `plugins/antigravity/mcp_config.json`.
- Registers `chorale` MCP server via `chorale mcp`.

---

## 5. Skills & Installation Guide

- `skills/chorale-install/SKILL.md`: Comprehensive skill guiding agents on installing dependencies (`npm install`), building the UI (`npm run build`), launching the service (`npx chorale`), and integrating with MCP clients.
- `skills/chorale-score/SKILL.md`: Comprehensive musical workflow skill guiding agents on reading measures, composing new sheets, importing MusicXML, and proposing harmonic analysis.
