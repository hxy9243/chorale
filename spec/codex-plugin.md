---
title: "Chorale Codex Plugin"
description: "Local MCP architecture, CLI integration, and staged extraction contract for the score-focused Codex plugin"
category: "architecture"
date: 2026-09-08
updated: 2026-09-13
status: "implemented"
source_files:
  - .npmrc
  - package.json
  - .github/workflows/ci.yml
  - bin/chorale.mjs
  - server/mcp/index.mjs
  - server/api_server.mjs
  - server/store.mjs
  - server/views.mjs
  - server/music21.mjs
  - server/python/music21_harmony.py
  - server/python/requirements-music21.txt
  - server/mcp/tools/file-management.mjs
  - server/mcp/tools/sheet-management.mjs
  - server/mcp/tools/workspace.mjs
  - .codex-plugin/plugin.json
  - .agents/plugins/marketplace.json
  - tools/package-codex.mjs
  - tools/launch_chorale_mcp
  - skills/chorale-score/SKILL.md
  - skills/chorale-score/references/basic-usage.md
  - skills/chorale-score/references/abc-syntax-and-rules.md
  - skills/chorale-score/references/chord-progression-analysis.md
  - skills/chorale-score/references/voice-leading-and-general-analysis.md
  - skills/chorale-score/references/counterpoint-and-forms.md
  - skills/chorale-score/references/styles-and-composers.md
  - docs/harmony-analysis-benchmark.md
  - src/hooks/usePluginMcpBridge.ts
test_files:
  - test/mcp-server.node.mjs
  - test/music21.node.mjs
  - test/codex-package.node.mjs
  - test/install.smoke.mjs
  - test/measure-ops.node.mjs
  - src/hooks/usePluginMcpBridge.test.ts
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/annotations-and-proposals.md
  - spec/file-workspace-architecture.md
  - spec/mcp-server-redesign.md
  - spec/music21-harmony-evidence.md
---

# Chorale Codex Plugin

## Product Boundary

The plugin is a score-focused workspace for importing music, selecting written measures, annotating, reviewing bounded changes, auditioning, and preserving revisions while Codex owns the agent conversation. It has no provider configuration or embedded chat surface. The standalone Electron application remains intact on branch `electron`.

## Architecture & CLI Entry Point

Chorale is accessed as an independent CLI tool (`chorale` or `bin/chorale.mjs mcp`) that operates on port **1685** and persists score data in `~/.chorale/` (`chorale.db` and mirrored `.abc` files).

1. **Stdio MCP Server**: Codex connects to `chorale mcp` over stdio. If the background HTTP server on port 1685 is not already running, `bin/chorale.mjs` automatically spawns it as a detached process and proxies mutations so changes immediately reflect in any open workspace.
2. **On-Demand Browser Launch**: Opening the browser workspace is explicitly controlled via `open_ui({ documentId? })`. Codex harness browser environments (e.g. `CODEX_BROWSER_COMMAND`) are preferred before falling back to system browsers.
3. **Local Marketplace Manifest**: The repository acts as a local marketplace root (`.agents/plugins/marketplace.json`) pointing to `plugins/chorale-codex-plugin` or runs directly via `.codex-plugin/plugin.json`.
4. **Optional Harmony Evidence**: `chorale setup music21` creates a pinned managed Python environment. The read-only `analyze_harmony` tool invokes it through the authoritative daemon and fails with an actionable structured error when unavailable.

Run `npm run package:codex` before installing from the local marketplace. It builds the UI and replaces the generated package with the current CLI, bundled dependencies, and skills. The installed package uses the same port 1685 service and `chorale.db` as the browser. It must not include the retired `server.mjs`, `codex-plugin-store.json`, or port 43171 daemon. After a package update, reinstall it and start a new Codex task to attach the current tool contract.

## Automatic View Connection & Routing

Opening the Chorale workspace (`http://127.0.0.1:1685/`) is sufficient to connect a score view.
- Every open page publishes a unique, ephemeral view identity via heartbeats on `/v1/views/:viewId`.
- Read tools such as `read_measure` execute as fast reads: when measure numbers are omitted and a view is connected with a live measure selection, it reads the active selection on the sheet canvas.
- If no view is connected or no measures are highlighted, `read_measure` defaults to reading from measure 1 without triggering an unwanted browser launch.

## MCP Tool Contract

The MCP server exposes 18 registered tool names; `edit_measure` is the backward-compatible alias of `edit_measures`:

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
| `analyze_harmony` | Return fallible, read-only music21 key and chord evidence for up to 16 written measures or active canvas selection. |
| `insert_measure` | Insert new measure(s) before/after a target measure with revision guard. |
| `edit_measures` | Replace written measures across a span with replacement ABC notation (supports variable length; aliased as `edit_measure`). |
| `delete_measures` | Delete written measures across a specified span with revision guard. |
| `add_notation` | Append structured analytical annotations (chord, Roman numeral, text) to measures. |
| `edit_notations` | Update label, body, kind, chord symbol, or measure bounds of an existing notation. |
| `delete_notations` | Remove annotations by ID with revision guard. |
| `list_notations` | List annotations on a score or within a measure span. |

## Acceptance Checks

- Out-of-range measure operations return structured error codes.
- Stale mutations without matching `expectedRevision` fail closed.
- Reopening preserves all scores and annotations across restarts (`~/.chorale/chorale.db`).
- Data tools operate fully headlessly without requiring the browser UI.
- `analyze_harmony` never mutates annotations and reports the actual music21 runtime version plus explicit candidate-quality warnings.
- The `render_score_workspace` tool is distinct from ordinary reads so a data read never remounts a score page.

## CLI installation artifact

Source dependency installs and npm pack run `prepare` to build the workspace. Direct global Git-source installation remains unverified; the documented quick start uses a source checkout and local dependency installation. The package explicitly includes `dist/`, the CLI, server modules, Python helper and requirements, and skills, even though generated assets are gitignored. Supported Node versions are 22.13+ on the 22.x line and 24+, covering the build/test tool requirements. Optional music21 evidence requires Python 3.10+ and an explicit `chorale setup music21` install. The import converter still declares a Node 20-only engine; see RELEASE.md for that unresolved support mismatch. `npm run test:install` packs and installs the actual artifact into an isolated prefix, checks served browser assets, and verifies durable score data after server restart. This check is blocking in CI and is distinct from browser interaction coverage.

The pinned Git-based `abc-utils` dependency is bundled into npm archives so installing the finished artifact does not need to fetch or rebuild that Git dependency.

The source checkout opts into npm 12 Git fetching for dependencies declared directly in its package.json using `.npmrc` (`allow-git=root`); this does not alter the user global npm configuration.
