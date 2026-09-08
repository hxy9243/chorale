---
title: "Chorale Codex Plugin"
description: "Local MCP prototype and staged extraction contract for the score-focused Codex plugin"
category: "architecture"
date: 2026-09-08
status: "in-progress"
source_files:
  - plugins/chorale-codex-plugin/server.mjs
  - plugins/chorale-codex-plugin/.mcp.json
  - plugins/chorale-codex-plugin/skills/chorale-score/SKILL.md
  - src/hooks/useDocumentStore.ts
  - src/music/scoreSnapshot.ts
  - src/music/annotationMutations.ts
test_files:
  - plugins/chorale-codex-plugin/test/server.node.mjs
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
The packaged MCP declaration launches `./server.mjs` with `cwd` set to the
plugin root, so the same bundle works from both a source checkout and Codex's
installed plugin cache.

The prototype store is a local JSON file selected by `CHORALE_PLUGIN_STORE`.
This is not the long-term document service. It makes startup, persistence, and
MCP contracts testable without sharing the standalone application's IndexedDB
state or creating two hidden writers to that state.

## Authoritative-state rule

For the plugin build, every data tool and page mutation must go through one
document service. UI state (selection, open surfaces, scroll, and playback
connectivity) is view-scoped and ephemeral. A later service extraction replaces
the JSON adapter with SQLite behind the same interface; it must not retain
separate UI and MCP copies of a document.

## Initial MCP contract

| Tool | Contract |
| --- | --- |
| `create_score` | Persist ABC as revision 1 and return a document summary. |
| `list_scores` | Return bounded summaries without mounting UI. |
| `get_score_summary` | Return title, revision, measure count, and annotation count. |
| `read_measure_range` | Return exactly the requested inclusive written-measure range. |
| `propose_annotations` | Validate the base revision and append an assistant-origin annotation. |
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
