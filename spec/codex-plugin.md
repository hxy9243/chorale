---
title: "Chorale Codex Plugin"
description: "Local MCP architecture, CLI integration, and staged extraction contract for the score-focused Codex plugin"
category: "architecture"
date: 2026-09-08
updated: 2026-09-13
status: "implemented"
source_files:
  - bin/chorale.mjs
  - mcp/index.mjs
  - mcp/server.mjs
  - mcp/store.mjs
  - mcp/views.mjs
  - mcp/tools/file-management.mjs
  - mcp/tools/sheet-management.mjs
  - mcp/tools/workspace.mjs
  - .codex-plugin/plugin.json
  - .agents/plugins/marketplace.json
  - tools/package-codex.mjs
  - tools/launch_chorale_mcp
  - skills/chorale-score/SKILL.md
  - src/hooks/usePluginMcpBridge.ts
test_files:
  - test/mcp-server.node.mjs
  - test/codex-package.node.mjs
  - test/measure-ops.node.mjs
  - src/hooks/usePluginMcpBridge.test.ts
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/annotations-and-proposals.md
  - spec/file-workspace-architecture.md
  - spec/mcp-server-redesign.md
---

# Chorale Codex Plugin

## Product Boundary

The plugin is a score-focused workspace for importing music, selecting written measures, annotating, reviewing bounded changes, auditioning, and preserving revisions while Codex owns the agent conversation. It has no provider configuration or embedded chat surface. The standalone Electron application remains intact on branch `electron`.

## Architecture & CLI Entry Point

Chorale is accessed as an independent CLI tool (`chorale` or `bin/chorale.mjs mcp`) that operates on port **1685** and persists score data in `~/.chorale/` (`store.json` and mirrored `.abc` files).

1. **Stdio MCP Server**: Codex connects to `chorale mcp` over stdio. If the background HTTP server on port 1685 is not already running, `bin/chorale.mjs` automatically spawns it as a detached process and proxies mutations so changes immediately reflect in any open workspace.
2. **On-Demand Browser Launch**: Opening the browser workspace is explicitly controlled via `open_ui({ documentId? })`. Codex harness browser environments (e.g. `CODEX_BROWSER_COMMAND`) are preferred before falling back to system browsers.
3. **Local Marketplace Manifest**: The repository acts as a local marketplace root (`.agents/plugins/marketplace.json`) pointing to `plugins/chorale-codex-plugin` or runs directly via `.codex-plugin/plugin.json`.

Run `npm run package:codex` before installing from the local marketplace. It builds the UI and replaces the generated package with the current CLI, bundled dependencies, and skills. The installed package uses the same port 1685 service and `store.json` as the browser. It must not include the retired `server.mjs`, `codex-plugin-store.json`, or port 43171 daemon. After a package update, reinstall it and start a new Codex task to attach the current tool contract.

## Automatic View Connection & Routing

Opening the Chorale workspace (`http://127.0.0.1:1685/`) is sufficient to connect a score view.
- Every open page publishes a unique, ephemeral view identity via heartbeats on `/v1/views/:viewId`.
- Read tools such as `read_measure` execute as fast reads: when measure numbers are omitted and a view is connected with a live measure selection, it reads the active selection on the sheet canvas.
- If no view is connected or no measures are highlighted, `read_measure` defaults to reading from measure 1 without triggering an unwanted browser launch.

## MCP Tool Contract

The MCP server exposes 16 modular tools:

| Tool | Contract |
| --- | --- |
| `open_ui` | Launch the interactive workspace in default browser (optional `documentId`). |
| `get_workspace_state` | Query overall workspace headlessly: document count, connected views, active view. |
| `render_score_workspace` | Return the optional MCP Apps resource (`ui://chorale/workspace-v1.html`) for a score. |
| `create_new_file` | Persist a new score document with title and ABC notation to `~/.chorale/`. |
| `list_files` | Return bounded summaries of all score files in `~/.chorale/`. |
| `delete_file` | Delete a score file by document ID. |
| `import_file` | Import a score from disk or string content (`.xml`, `.musicxml`, `.mxl`, `.abc`). |
| `export_file` | Export a score document to ABC, JSON, or an output disk path. |
| `read_measure` | Read written ABC notation for specific measure(s) or active canvas selection. |
| `insert_measure` | Insert new measure(s) before/after a target measure with revision guard. |
| `edit_measure` | Replace written measures across a span with replacement ABC notation. |
| `delete_measures` | Delete written measures across a specified span with revision guard. |
| `add_notation` | Append structured analytical annotations (chord, Roman numeral, text) to measures. |
| `edit_notations` | Update label, body, kind, chord symbol, or measure bounds of an existing notation. |
| `delete_notations` | Remove annotations by ID with revision guard. |
| `list_notations` | List annotations on a score or within a measure span. |

## Acceptance Checks

- Out-of-range measure operations return structured error codes.
- Stale mutations without matching `expectedRevision` fail closed.
- Reopening preserves all scores and annotations across restarts (`~/.chorale/store.json`).
- Data tools operate fully headlessly without requiring the browser UI.
- The `render_score_workspace` tool is distinct from ordinary reads so a data read never remounts a score page.
