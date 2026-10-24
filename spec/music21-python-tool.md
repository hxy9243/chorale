---
title: Sandboxed music21 Python analysis
status: implemented
date: 2026-10-23
source_files:
  - server/music21-python.mjs
  - server/music21.mjs
  - server/daemon-mutations.mjs
  - server/python/music21_analysis.py
  - electron/ai/sheetTools.ts
  - electron/ai/systemPrompt.ts
  - electron/ai/toolEvents.ts
  - vite.main.config.ts
  - server/mcp/tools/sheet-management.mjs
  - skills/chorale-score/SKILL.md
test_files:
  - test/music21-python.node.mjs
  - src/agent/__tests__/music21Tool.test.ts
  - scripts/music21-examples.mjs
  - scripts/electron-music21-smoke.mjs
related_specs:
  - spec/music21-harmony-evidence.md
  - spec/desktop-chat-restoration.md
---

# Sandboxed music21 Python analysis

Expose `analyze_music21` to the Electron tutor and MCP clients. It accepts a
bounded written-measure range and a short Python snippet, and returns JSON
analysis, captured stdout, engine version, source revision, timing and sandbox
details. It never edits the score or creates annotations. The agent reads the
passage first; results are evidence for reviewable suggestions, not ground truth.
Keep the existing predefined `analyze_harmony` tool available.

The desktop tool uses its immutable prompt-time snapshot. MCP resolves the
authoritative document revision before extracting input. Chorale's shared score
semantics supplies pitch spelling, voice identity, exact rational offsets and
durations; music21 receives a constructed Score, not a reparsed ABC excerpt.
Provide `score`, `events`, `measures`, `music21` and `result`; code sets `result`
to a JSON-serializable value. Measure numbers and provenance refer to the original
written score, including pickups and carry-in notes. Analysis can mutate its
private in-memory score without changing the document.

On Linux, execution requires Bubblewrap with user, PID, mount and network
namespaces; drop capabilities, isolate the session, clear the host environment,
and mount only the interpreter/runtime libraries and runner read-only. No user
home, score database, credentials or host network is available. Temporary writes
live in a private scratch filesystem. Set hard CPU, address-space, file-size,
process and descriptor limits before executing the snippet. Bound source, code,
events, wall time and output; abort/cancel kills the worker. If the sandbox is
missing or unavailable, return a structured error and never retry unsandboxed.
Other platforms currently report the same explicit unsupported-sandbox error.

Review examples use real music21 and OS sandbox execution with controlled Pi
responses for a reproducible tool-calling conversation. Label simulated provider
responses clearly; do not claim live model reasoning. Save score ABC, exact code,
tool request/response, structured JSONL traces and a human-readable report with
expected musical facts and observed results. Include hostile file/network and
timeout probes so the isolation claim has execution evidence.

The worker also requires libseccomp and denies child processes, sockets, nested
namespace/mount operations and privileged kernel interfaces before running code.
