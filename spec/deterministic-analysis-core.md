---
title: Deterministic analysis core and paired evaluation
status: implemented
date: 2026-10-25
source_files:
  - server/python/music21_core.py
  - server/python/music21_analysis.py
  - server/music21-python.mjs
  - electron/ai/sheetTools.ts
  - electron/ai/systemPrompt.ts
  - electron/ai/agentProfiles.ts
  - skills/chorale-score/references/music21-python.md
  - scripts/core-analysis-pilot.cjs
  - scripts/core-analysis-report.mjs
test_files:
  - test/music21-python.node.mjs
  - test/music21-core.node.mjs
related_specs:
  - spec/music21-python-tool.md
  - spec/music21-harmony-evidence.md
  - spec/agent-evaluation.md
  - spec/agent-tools-and-profiles.md
---

# Deterministic analysis core

## Goal and boundary

Make the assistant better at discussing exact musical facts. A deterministic
detector supplies compact, located evidence; the assistant explains its musical
significance and proposes optional revisions. Passing these checks does not
establish musical quality or complete theoretical correctness.

Keep ONE existing `analyze_music21` interface. Do not add a tool per check, a
catalog tool, or a second public analysis tool. Preserve existing custom snippets
and `analyze_harmony`. Add one trusted helper in the existing Python namespace:

```python
result = analyze(
    checks=['parallels', 'crossing', 'overlap', 'spacing', 'ranges', 'melodic'],
    voice_order=['S', 'A', 'T', 'B'],
    profile='chorale',
)
```

The tool schema stays unchanged. Put detailed options and semantics in the
on-demand skill reference, with one short usage hint in the tool description.
The helper uses the authoritative event representation and music21 interval /
voice-leading routines, not a second ABC parse or unconstrained generated code
for each common check. It inherits the existing 16-written-measure, sandbox,
timeout, output and revision limits. The native, Python-free, 32-measure engine
from the earlier brainstorm remains a separate unimplemented portability proposal.

## High-value analysis roadmap

| Priority | Analysis | Evidence and interpretation boundary |
| --- | --- | --- |
| P0 | Parallel perfect fifths/octaves | Same-direction nonzero motion; octave-equivalent spelled perfect intervals; contrary motion separate |
| P0 | Voice crossing and overlap | Explicit high-to-low identity, exact before/after pitches; no inferred reordering |
| P0 | Upper-voice spacing and SATB ranges | Explicit chorale profile and four ordered voices; warning-level conventions |
| P0 | Melodic augmented/diminished intervals and leaps over an octave | Located interval facts; advice depends on style |
| P1 | Motion summaries, direct outer-voice fifths/octaves, leap recovery | Preserve soprano-step exceptions and rest/tie continuity before adding policy |
| P1 | Rhythmic alignment, register/tessitura summaries, note-density | Separate valid pickups/tuplets/polyrhythm from errors; reuse shared timing |
| P1 | Exact/transposed motif recurrence and locked-material preservation | Explicit transformations and source spans; no stylistic resemblance claim |
| P2 | Preparation/resolution, suspensions, chordal sevenths | Requires contextual harmonic labels and uncertainty; never infer from vertical dissonance alone |
| P2 | Leading-tone tendencies, local key and cadence evidence | Written key is insufficient during tonicization; keep hypotheses distinct |
| P2 | Chord root/quality and phrase interpretation | Fallible interpretive evidence, evaluated separately from interval arithmetic |

## Core contract

`analyze(checks=None, voice_order=None, profile='free', max_findings=100)`:

- `checks`: nonempty unique subset of the six P0 group names; omitted means all.
- `voice_order`: optional explicit complete list of voice IDs high to low. It must
  contain exactly the voices in the selected pitched input, without duplicates.
  Crossing/overlap need this order. Spacing/ranges also need `profile='chorale'`
  and exactly four ordered voices, mapped to S/A/T/B. Missing assumptions produce
  diagnostics and skipped checks, never guessed roles. `free` reports geometric
  parallels as informational observations, not prohibited keyboard doubling.
- `max_findings`: integer 1..500. Stable sort, deterministic IDs excluding severity
  and document revision, honest `totalFindings` and `truncated`. IDs identify facts
  within the returned score revision, not transferable proof after edits.
- Output: `schemaVersion`, `profile`, `findings`, `diagnostics`, `coverage`,
  `totalFindings`, `truncated`. Outer tool retains document/revision/actual engine
  version, sandbox and duration. Findings include rule, severity, voices, exact
  rational quarter-length positions, pitches, spelled intervals, motion where
  relevant, source event IDs, and an ID. Positions use original written measures;
  quarter-length offsets are zero-based, independent of time-signature beat unit.

Only explicit monophonic voices are supported for line checks. Exclude an entire
voice if any of its events overlap in the selected range (including notated
chords); emit a diagnostic. Do not sort chord pitches into invented melodic lines.
Ties remain merged, held notes participate in vertical sonorities, and silence
breaks successions. Compare pairs at the union of their onsets/releases; require
both voices sounding on both sides, with no intervening silence. Repeated pitches
and oblique motion cannot be parallel-motion findings. Exclude unisons from the
parallel-octave rule. P5 to d5 is not two perfect fifths.

Shared parsing is unchanged. The adapter adds repeat/ending boundaries from the
existing timing entries. Diagnose boundaries in the selected range and skip
successions across them; never claim playback-order analysis. Perpetual ties are
not reattacks. No key-dependent error rules are enabled in P0.

`coverage` lists requested/executed checks, supported/excluded voices and skipped
transitions. It is incomplete when a requested check or voice is excluded, a
repeat transition is skipped, or findings are truncated. A clean empty result is
not a certificate for unsupported textures, outside-range transitions, or musical
quality. The helper captures its own copy of input before user code executes.

## Implementation sequence

1. Preserve existing custom-code and harmony contracts. Add this spec before
   implementation. Do not change shared pitch/timing extraction.
2. Add a trusted Python module using music21 pitch/interval/voice-leading helpers;
   test exact positive and negative cases, ordering, diagnostics and truncation.
3. Bind the helper into the existing worker before custom code; mount the trusted
   module read-only in Bubblewrap. Keep syscalls/network/host-file isolation.
4. Add repeat-boundary metadata in the JS adapter, retaining existing event
   fields. Add a short helper hint to Electron/MCP descriptions and system prompt;
   document detailed defaults, examples, unsupported cases and output in the
   existing skill reference. No tool registration or schema expansion.
5. Exercise real sandbox, HTTP, stdio proxy and desktop read-before-analysis /
   immutable-revision paths, as well as legacy custom code. Run repository gates.
6. Freeze the paired pilot protocol and source passages. Run both arms, save raw
   requests/results/evidence and compare located claims. Report negative results.

## Evaluation plan

### A. Deterministic correctness

Maintain separate hand-verified regression cases: P5/P8 positives; contrary and
oblique controls; P5 to d5; unison; shared rests; ties/carry-in; crossing vs unison;
overlap without crossing; upper spacing; explicit SATB ranges; augmented and
diminished melodic intervals; legal small leaps; transposition and accidentals;
repeat/ending boundaries; chordal exclusions; missing/invalid order; invalid
options; deterministic serialization; truncation. Match full located facts, not
only finding counts. Keep transport and Python-availability skips visible.

### B. Initial supplied-evidence pilot

The user approved SATB plus keyboard/edge controls, same analysis model in both
arms, and Astra generating original short musical passages. Astra authors six
four-measure passages with neutral titles/questions and PROVISIONAL reference
labels. It sees no checker implementation. Validate ABC duration/pitch positions
with the real parser; independently review expected intervals and every scored
claim. AI-written reference answers are not external ground truth.

- Freeze inputs, neutral questions, system prompt, model ID, provider, reasoning,
  temperature, output limit and scoring rubric before calls. Keep references out
  of prompts. Complete/persist all baselines before computing/adding evidence.
- Before: score + question + common system instructions.
- After: identical base messages + actual compact helper result for that score.
  This measures supplied evidence, not autonomous discovery, tool selection or
  the entire desktop tutoring workflow.
- Same model/settings in each pair; independent calls with no cross-arm history.
  Record requested and returned model IDs, provider, usage, reported cost if any,
  latency, failures/retries and finish reasons. Do not fabricate absent billing.
- Preserve raw prose; assess each claim against source notes, not by agreement
  with the checker. Classify correctly located core findings, missed findings,
  invented findings, wrong pitches/positions, invalid style generalization and
  appropriate abstention. Review before/after prose side by side for concrete
  factual changes and explanatory usefulness, separately from verbosity.
- Save an explicit claim ledger, passage-level deltas and all regressions. A
  six-pair synthetic pilot is exploratory and cannot establish general accuracy.

### C. Expansion and acceptance

After reviewing the pilot, collect real user passages and a larger frozen
held-out set separate from regression development. Add clean controls and
unsupported textures deliberately; avoid filling a benchmark with only planted
mistakes. Repeat paired calls to estimate variability. Report per-rule detection
precision/recall and location accuracy, false alarms on controls, abstention,
coverage, unsupported explanatory claims, tokens and latency. Evaluate autonomous
tool use separately, counting unnecessary calls, selection failures and evidence
misuse. Human musical review is needed before claiming pedagogical quality.

Proposed acceptance: exact regression expectations pass; existing isolation and
harmony tests stay green; every supported finding is source-located; incomplete
coverage is explicit; pilot contains no unchecked claim that improvement is
universal. Decide quantitative product thresholds only after the pilot exposes
the baseline and likely error costs. Do not promote an uncalibrated LLM judge.

## References

- [music21 voice-leading API](https://music21.org/music21docs/moduleReference/moduleVoiceLeading.html)
- [Langfuse dataset design](https://langfuse.com/academy/datasets)
- Existing paired-context review under `docs/reviews/music21-context-2026-10-24`
  in the desktop-restoration worktree, used as methodological precedent only.

## Initial result

P0 is implemented through the existing sandboxed tool; P1/P2 remain roadmap
items. The six-pair live pilot and raw outputs are in
`docs/reviews/deterministic-analysis-core-2026-10-25/README.md`.
Exact reconstruction of ten selected core findings improved 4/10 to 10/10,
but the evidence arm introduced a false spacing diagnosis on a clean control
and other prose errors. This is an exploratory agent-audited result, not
independent human validation or proof of overall tutoring improvement.
Evidence averaged about 424 additional prompt tokens per passage.
See the report's verification record for the exact test outcomes, including
aggregate UI-suite failures during concurrent UI edits.
