---
title: "music21 Harmony Evidence"
description: "Managed music21 installation and read-only harmonic-evidence tool for agent analysis"
category: "agent-tools"
date: 2026-09-20
updated: 2026-10-01
status: "implemented"
source_files:
  - shared/score-timing.mjs
  - shared/score-timing.d.mts
  - shared/abc-source.mjs
  - shared/abc-source.d.mts
  - src/music/scoreSnapshot.ts
  - src/music/abcPresentation.ts
  - server/daemon-mutations.mjs
  - .github/workflows/ci.yml
  - server/music/score-semantics.mjs
  - server/music21.mjs
  - server/python/music21_harmony.py
  - server/python/requirements-music21.txt
  - server/mcp/tools/sheet-management.mjs
  - server/utils/measure-ops.mjs
  - server/cli.mjs
  - skills/chorale-score/SKILL.md
  - skills/chorale-score/references/chord-progression-analysis.md
  - INSTALL.md
  - docs/harmony-analysis-benchmark.md
test_files:
  - src/music/__tests__/scoreTimingParity.test.ts
  - test/score-semantics.node.mjs
  - test/score-timing.node.mjs
  - test/harmony-regression.node.mjs
  - test/fixtures/harmony-regression.mjs
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
- written key context (or null when conflicting/unknown), with `keySource`; the legacy `estimatedPassageKey` field is retained for compatibility and is not a statistical estimate;
- onset-aligned chordified slices with sounding pitches and literal bass;
- candidate root, quality, inversion, and Roman numeral for each slice;
- explicit warnings about fallible harmonic interpretation; unsupported literal notation returns a diagnostic instead of guessed evidence.

The tool never writes score state. Missing Python, missing music21, parse failures, timeouts, and oversized ranges return structured errors.

### Structured event boundary

Chorale determines all musical elements, timing, positions, sounding pitches, active accidentals, ties across barlines, and literal bass via `server/music/score-semantics.mjs`. It traverses the score with exact rational arithmetic and hands music21 structured event slices:

```json
{
  "schemaVersion": 1,
  "passageKey": "G major",
  "slices": [
    {
      "sliceId": "m1@0",
      "position": { "measure": 1, "offsetQuarterLength": "0" },
      "durationQuarterLength": "4",
      "soundingPitches": ["G3", "B3", "D4"],
      "literalBass": "G3",
      "localKey": "G major"
    }
  ]
}
```

music21 acts strictly as a lightweight chord and Roman numeral interpreter via `server/python/music21_harmony.py`, evaluating roots, qualities, inversions, and Roman numerals for the provided sonorities. This clean separation eliminates ABC-to-ABC rewriting and ensures music21 never parses ABC notation or reinterprets score layout.


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



## Canonical event repair (implementation contract)

The Node analysis path parses the complete score once and retains per-voice source identity, exact rational quarter-length onsets/releases, parsed key accidental tables and modes, and pitch-specific tie state. Written positions come from a shared pure written-measure mapper, not from line counts or music21 output. Leading repeat bars, pickups, split repeat fragments, final unterminated bars, and multimeasure rests must preserve the same written numbering across adapters.

- Fractions are reduced exact rationals; triplets and other tuplets are not quantized to a fixed denominator.
- Clef octave displacement and supported chromatic voice transposition affect sounding pitch. Ordinary clef changes affect display without creating a measure.
- Explicit accidentals are scoped to their written pitch/octave and reset at barlines. Tied continuations retain their original resolved pitch independently for each chord member.
- Slice boundaries include all overlapping onsets and releases, including carry-in from earlier measures, and are clipped against real measure intervals rather than assuming four quarter notes per bar.
- Parsed key/mode/accidental context is voice-local. Polytonal or unsupported functional context is reported as uncertain, not taken from the last voice. Unsupported microtones, percussion and unmodelled notation produce structured diagnostics rather than invented conventional pitches. Grace notes are rejected until their time treatment is explicitly supported.
- The versioned Python payload carries stable slice IDs. Python returns only harmonic interpretations; Node retains authority over the document, revision, literal evidence and range. Invalid, missing, duplicate or unexpected result IDs fail closed.
- Passage-key output is explicitly identified as written context, not presented as a statistically estimated key. No database or annotation migration is introduced.
- The required music21 CI lane fails if the interpreter or pinned dependency is unavailable; an optional-dependency lane verifies ordinary score features without music21. Regression comparisons use exact complete slice lists and real HTTP requests.

The existing source-editing APIs remain source-based. This change does not serialize normalized events back into score text or silently accept ambiguous source-editing boundaries.

### Supported-boundary diagnostics and resources

Grace-note timing, voice overlays (`&`), MIDI pitch/percussion directives, mid-bar meter changes, and incompatible polymeter currently return an explicit unsupported-notation/timing error. Pitched V:/K: chromatic transpose fields and octave clefs are supported. Other score operations do not require music21. Literal source remains unchanged. The timing allocator rejects oversized multi-rest expansion before allocation; analysis also bounds source bytes, voice/event count, field sizes, slices and total emitted pitch references.

The authoritative sequence is full original score → source-aware voice fields and shared written timing → resolved individual-pitch intervals → exact onset/release sweep clipped to requested measures → strict versioned music21 interpretation. Staff-level layout metadata is not allowed to overwrite another voice's key state. Source offsets survive blank-line preparation. The only bar spelling compatibility preprocessing is width-preserving `:|:` → `:: ` for abcjs; no analyzed excerpt is reserialized or passed to a second ABC parser.

The regression corpus includes real triplets, Dorian, leading repeats, multi-rest expansion, source-line pickups/split repeats, tied accidentals, octave scope, transposition, offset carry-in, 3/4 releases, shared-staff context, metadata-like comments and header voice declarations. Exact complete literal lists are checked both without Python and through HTTP plus the stdio daemon proxy; the required integration lane fails rather than skipping unavailable Python.

The generated Codex manifest forwards the explicit CHORALE_HOME, CHORALE_MUSIC21_PYTHON and CHORALE_PYTHON path overrides; packaged tests exercise the same helper path and canonical core.
