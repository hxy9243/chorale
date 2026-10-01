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

### Correctness and score invariants

- **Voice alignment:** Multi-voice scores with alphabetic/named voice IDs (e.g. `V:S`, `V:B`, `V:Soprano`, `V:Bass`) are normalized to parallel parts before analysis so sonorities align simultaneously across voices rather than stacking sequentially.
- **Single-measure analysis:** Analyzing single measures produces valid evidence via stream partition or direct sonority resolution without returning empty slices.
- **Key signature & clef inheritance:** Excerpt analysis inherits the active key signature, time signature/meter, unit note length (`L:`), and voice clefs in effect at the start of the requested range, ensuring note spellings, sounding durations, and sounding pitches reflect prior modulations.
- **Polytonal and voice-specific key scoping:** Scores with voice-specific or polytonal key signatures preserve the base tune key in global headers and scope key changes to the specific voice, preventing soprano modulations from inadvertently altering bass accidental rules.
- **Directive comment immunity:** Inline comments (`%`) containing syntax like `[K:G]` or clef directives are stripped prior to directive parsing so comments cannot alter the active score state.
- **Intra-passage key changes:** Key changes inside the analyzed range are recognized during analysis, assigning accurate sounding accidentals and updating candidate local keys and Roman numerals.
- **Clef sequence integrity:** Initial voice declarations and earlier measures retain their original clefs even if a voice switches clefs later in the passage.
- **Split repeat continuity:** Measures split across repeat barlines preserve the parent measure number and properly offset second-half sonorities by the duration of the first half.

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
- Single-measure analysis returns valid non-empty evidence.
- Named voices like S/B are analyzed simultaneously in parallel rather than sequentially.
- Excerpts after key changes return accurate sounding pitches (e.g. F♯ in G major) by inheriting active headers and unit note length.
- Voice-specific key changes remain isolated to their voice without corrupting parallel parts.
- Comments containing directives like `[K:G]` do not alter score key or clefs.
- Key changes inside the analyzed passage update sounding accidentals and local candidate keys.
- Earlier measures never inherit later clef changes.
- Split repeat bars maintain accurate measure numbering and offset alignment.
- Unavailable dependencies return `MUSIC21_UNAVAILABLE` with the setup command.
- Automated tests cover installation orchestration, runner parsing, MCP registration, bounded-range behavior, package contents, and harmonic correctness invariants.


