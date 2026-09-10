---
title: "Chorale Codex Plugin"
description: "Local MCP prototype and staged extraction contract for the score-focused Codex plugin"
category: "architecture"
date: 2026-09-08
status: "in-progress"
source_files:
  - server.mjs
  - .mcp.json
  - .codex-plugin/plugin.json
  - .agents/plugins/marketplace.json
  - skills/chorale-score/SKILL.md
  - plugins/chorale-codex-plugin/.mcp.json
  - plugins/chorale-codex-plugin/.codex-plugin/plugin.json
  - plugins/chorale-codex-plugin/server.mjs
  - plugins/chorale-codex-plugin/skills/chorale-score/SKILL.md
  - scripts/package-codex-plugin.mjs
  - src/hooks/useDocumentStore.ts
  - src/hooks/usePluginMcpBridge.ts
  - src/music/scoreSnapshot.ts
  - src/music/annotationMutations.ts
test_files:
  - test/package.node.mjs
  - test/server.node.mjs
  - src/hooks/usePluginMcpBridge.test.ts
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/annotations-and-proposals.md
  - spec/file-workspace-architecture.md
---

# Chorale Codex Plugin

## Product boundary

The plugin is a score-focused page for importing music, selecting written
measures, annotating, reviewing bounded changes, auditioning, and preserving
revisions while Codex owns the conversation. It has no provider configuration
or embedded chat surface. The standalone Electron application remains intact.

## M0 prototype

The first implementation is deliberately limited to a local stdio MCP server.
It provides durable ABC documents, bounded measure reads, annotation proposals,
and a render tool with an MCP Apps UI resource. The component is optional: all
data tools remain useful in a host that cannot render an MCP Apps iframe.
The packaged MCP declaration launches the executable plugin-local wrapper at
`./scripts/launch_chorale_mcp`. The wrapper resolves `server.mjs` from its own
installed location and selects a Node runtime supplied by Codex before falling
back to `PATH`. This keeps startup independent of both the task workspace and
the host's shell environment.

The repository is also the durable `chorale-local` marketplace root. Its
marketplace manifest points at the bounded runtime package under
`plugins/chorale-codex-plugin`. Codex installations must register this main
checkout, not an ephemeral feature worktree, so removing a completed worktree
cannot make the MCP tools disappear from newly created tasks. The runtime
package contains a bundled server plus mirrored MCP declaration, manifest,
skill, and built UI. `npm run package:codex` regenerates it without copying Git
metadata, `.agents` worktrees, or repository dependencies into Codex's cache.

The prototype store is a local JSON file selected by `CHORALE_PLUGIN_STORE`.
This is not the long-term document service. It makes startup, persistence, and
MCP contracts testable without sharing the standalone application's IndexedDB
state or creating two hidden writers to that state.

## Automatic view connection and routing

Opening the normal Chorale URL is sufficient to connect a score view. Query
parameters such as `plugin=1` may alter presentation, and explicit `viewId` or
`choraleBridge` values remain diagnostic overrides, but none is required for
ordinary MCP connectivity.

Every page publishes a unique, ephemeral view identity plus its focus and
visibility state. View heartbeats expire, so closed or suspended pages do not
remain routing candidates. A selection tool without an explicit `viewId`
resolves the only live view, or prefers the uniquely focused visible view when
several pages are connected. If several candidates remain, the tool chooses
the most recently focused candidate and returns a structured ambiguity warning
instead of silently pretending that a hard-coded view is authoritative.

When inspecting active views, callers invoke `get_active_view` to query what the user
is viewing (document, revision, active tab, editor visibility, and selection) or
`get_workspace_state` to inspect the full workspace inventory headlessly. Read tools
such as `read_measure_selection` execute strictly as fast reads without side-effecting
browser launches, returning `VIEW_NOT_CONNECTED` when no view is open, or a clean
success response with `selection: null` when connected with no highlighted measures.
Opening the browser workspace is explicitly controlled via `open_chorale_ui({ documentId? })`.

The stdio adapter must preserve structured tool failures returned by the daemon
(`VIEW_NOT_CONNECTED`, `SELECTION_MISMATCH`, `INVALID_RANGE`, and similar codes).
Only transport or health-check failures may be translated to `DAEMON_UNAVAILABLE`.

## Authoritative-state rule

For the plugin build, every data tool and page mutation must go through one
document service. UI state (selection, open surfaces, scroll, and playback
connectivity) is view-scoped and ephemeral. A later service extraction replaces
the JSON adapter with SQLite behind the same interface; it must not retain
separate UI and MCP copies of a document.

## Initial MCP contract

| Tool | Contract |
| --- | --- |
| `open_chorale_ui` | Launch the interactive workspace in default browser (optional `documentId`). |
| `get_active_view` | Query focused view: active document, revision, active tab, selection, editor visibility. |
| `get_workspace_state` | Query overall workspace headlessly: active document, document count, view count. |
| `create_score` | Persist ABC as revision 1 and return a document summary. |
| `list_scores` | Return bounded summaries without mounting UI. |
| `get_score_summary` | Return title, revision, measure count, and annotation count. |
| `read_measure_range` | Return exactly the requested inclusive written-measure range (`SELECTION_MISMATCH` on view mismatch). |
| `read_measure_selection` | Fast read of user-selected measures; returns `selection: null` if unselected. |
| `edit_score` | Authoritatively replace ABC source with revision concurrency guard. |
| `add_annotations` | Append structured analytical annotations with optimistic revision guard. |
| `edit_annotations` | Update label, body, or measure bounds of an existing annotation. |
| `delete_annotations` | Remove annotations by ID with revision guard. |
| `render_score_workspace` | Return the optional MCP Apps resource for a chosen document. |

Every mutation includes the expected revision and creates a receipt. M0 uses
the document revision as its optimistic guard. M1 extends this to independent
annotation versions, idempotency receipts, and atomic score-edit proposals.

## Security and host behavior

The server uses stdio, writes only to its configured local store, and accepts
no network input. The UI resource has no external connections. UI actions must
feature-detect the MCP Apps bridge; they must never assume a particular Codex
or ChatGPT presentation. A production service binds only to loopback and adds
session authentication before any browser-page transport is introduced.

## Extraction sequence

1. Validate M0 in a real local Codex client: create/import, read an exact
   selected range, display an annotation, and reopen the document.
2. Extract parsing, revision, and annotation operations into a shared pure
   document service with a SQLite storage adapter and event stream.
3. Add the score-focused page entry point, reusing `SheetMusicView`,
   `AbcEditor`, `AudioPlayer`, and overlays without the chat/provider bundle.
4. Add captured view/selection contexts, proposal review, and page-mediated
   playback acknowledgements.
5. Package migration and clean-install coverage only after the complete loop
   works against the verified host surface.

## M0 acceptance checks

- Invalid or out-of-range measure reads return a structured error.
- A stale annotation proposal cannot mutate the document.
- Reopening with the same store preserves the score and annotations.
- Data tools work without the UI resource.
- The render tool is distinct from ordinary reads so a data read never remounts
  a score page.
