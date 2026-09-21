---
title: "music21 Harmony Evidence"
description: "Managed music21 installation and read-only harmonic-evidence tool for agent analysis"
category: "agent-tools"
date: 2026-09-20
updated: 2026-09-20
status: "implemented"
source_files:
  - server/music21.mjs
  - server/python/music21_harmony.py
  - server/python/requirements-music21.txt
  - server/mcp/tools/sheet-management.mjs
  - server/cli.mjs
  - skills/chorale-score/SKILL.md
  - skills/chorale-score/references/chord-progression-analysis.md
  - INSTALL.md
  - docs/harmony-analysis-benchmark.md
test_files:
  - test/music21.node.mjs
  - test/mcp-server.node.mjs
  - test/cli-runtime.node.mjs
  - test/codex-package.node.mjs
related_specs:
  - spec/codex-plugin.md
  - spec/mcp-server-redesign.md
  - spec/agent-evaluation.md
---

# music21 Harmony Evidence

## Product boundary

Chorale exposes music21 as fallible, read-only evidence for an agent performing harmonic analysis. It does not silently create annotations and it does not treat chordification or a passage-wide key estimate as ground truth. The agent must reconcile the evidence with the written score, local-key context, non-chord tones, voice leading, and cadential syntax before proposing or applying an annotation.

## Installation

`chorale setup music21` creates a managed Python virtual environment at `~/.chorale/music21-venv` and installs the benchmarked dependency `music21==9.9.1`. Installation is explicit because it requires Python 3.10+ and network access. Score creation, reading, editing, playback, and annotations continue to work when music21 is unavailable.

At runtime Chorale resolves Python in this order:

1. `CHORALE_MUSIC21_PYTHON`, when explicitly configured.
2. The managed virtual environment.
3. A compatible `python3` or `python` already containing music21.

The tool reports the actual music21 version used. The managed setup remains pinned to the evaluated version.

## MCP contract

`analyze_harmony` accepts an optional document, written-measure range, or connected-view selection. The range is limited to 16 measures so its evidence remains bounded and reviewable.

The result includes:

- the immutable score document ID and revision;
- the analyzed written-measure range;
- the music21 and Python versions;
- one passage-wide estimated key;
- onset-aligned chordified slices with sounding pitches and literal bass;
- candidate root, quality, inversion, and Roman numeral for each slice;
- explicit warnings about ornaments, suspensions, tonicization, modulation, and boundary errors.

The tool never writes score state. Missing Python, missing music21, parse failures, timeouts, and oversized ranges return structured errors.

## Agent workflow

1. Read every target measure with `read_measure` and verify measure identity, pickups, and layout-only indices.
2. Call `analyze_harmony` for the same bounded range.
3. Treat its pitches and literal bass as evidence. Check sustained notes, ties, and voice identity in the score.
4. Treat the estimated key and chord labels as candidates. Correct them using phrase context, cadence evidence, applied-function syntax, and non-chord-tone behavior.
5. State uncertainty where multiple reductions remain plausible.
6. Add or edit annotations only after the normal consistency audit and revision guard.

## Acceptance criteria

- `chorale setup music21` installs the pinned dependency into the managed environment and reports its version.
- `analyze_harmony` works through direct HTTP, SSE, and stdio MCP paths because all paths share the authoritative daemon handlers.
- The Codex package contains the Python helper, pinned requirements file, updated skill, and tool schema.
- The tool is read-only and bounded to 16 written measures.
- Unavailable dependencies return `MUSIC21_UNAVAILABLE` with the setup command.
- Automated tests cover installation orchestration, runner parsing, MCP registration, bounded-range behavior, and package contents.

