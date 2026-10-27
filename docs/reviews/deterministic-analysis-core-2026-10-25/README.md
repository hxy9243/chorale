# Deterministic analysis core: implementation and paired pilot

Date: 2026-10-25 (America/Vancouver). The P0 implementation extends the existing
`analyze_music21` namespace with one `analyze(...)` helper. No new public tool or
input-schema fields were added. The roadmap, implementation sequence, contracts
and evaluation plan are in [the specification](../../../spec/deterministic-analysis-core.md).

## What the pilot supports

Computed evidence improved reconstruction of the **ten selected positive core
facts** from **4/10 to 10/10** when correct pitches, voice pairs and locations
were all required. Pattern/location recognition without exact pitches rose from
7/10 to 10/10. It did **not** reliably improve the entire explanation: the after
arm invented spacing warnings on one of two clean controls and introduced other
wrong-octave and interval explanations. Treat this as a useful detector and an
exploratory assistant experiment, not a validated automatic tutor.

These are agent-audited source facts, not independent human gold labels. The
full claim ledger is [claim-ledger.json](claim-ledger.json). The implementing
agent checked the literal ABC pitches and source locations separately from the
helper output. Human musical review remains pending.

## Implementation

Core groups are parallels, crossing, overlap, spacing, ranges and melodic
intervals. The helper uses music21 interval/voice-leading routines over Chorale's
authoritative tie-merged events. Same-direction motion, spelling, rest gaps,
held notes, explicit roles, diagnostics and truncation are handled in trusted
code rather than reimplemented by each model snippet.

```python
result = analyze(
    checks=['parallels', 'crossing', 'overlap', 'spacing', 'ranges', 'melodic'],
    voice_order=['S', 'A', 'T', 'B'],
    profile='chorale',
)
```

Details live in the existing [music21 skill reference](../../../skills/chorale-score/references/music21-python.md).
The always-present tool description stays short; Electron receives the check
catalog only in its selected voice-leading profile. The initial longer system
hint exceeded the existing 1,500-token estimate test by seven tokens; it was
shortened without raising that ceiling. The tool schema is unchanged.

This implementation uses the existing Python sandbox, with its **Linux-only
custom-analysis availability and 16-measure limit**. The native Python-free,
32-measure design remains a future portability proposal. No annotation evidence
validation, automatic repairs, local-key error rules or chordal line inference
were added. Shared score semantics and the harmonic-analysis entry point were
not changed.

## Experiment protocol

- Author: GPT-6 Astra High subagent, six original four-measure passages. Its
  [author notes](author-notes.md) and [provisional references](provisional-references.json)
  are preserved. References were excluded from both analysis arms.
- Analyst: **GPT-6.1 Sol, low reasoning**, through the existing Chorale Codex
  OAuth provider. Twelve completed independent calls, one before/after pair per
  passage. Same model, system prompt, question, source score and settings.
- Before: notation plus question. After: identical base messages plus actual
  compact helper output. This tests supplied evidence, not autonomous tool
  selection, a full tutor conversation, or performance on user scores.
- Every baseline was persisted before the first pilot evidence was computed.
  A check also compared each pair's base messages/settings and verified all
  twelve visible responses ended normally. The actual engine was music21
  **10.5.0 / Python 3.12.3**; compatibility was tested separately with 9.9.2.
- Codex rejected explicit temperature in preflight. Rejected artifacts are
  preserved under `rejected-preflight/`. Both scored arms omit temperature and
  use provider defaults; one sample per arm cannot estimate variance. Internal
  SDK retries were not individually instrumented.
- Inputs, parsed notes, requests, visible responses, evidence, usage and a run
  manifest are saved. Credentials stay inside Electron main and are not saved
  in this bundle. Opaque model reasoning is not exported.

The original Astra range reference used G5 as the soprano ceiling. The existing
Chorale convention and frozen implementation spec use A5. Therefore the
author-specific A5 range advisory was excluded from error scoring; the original
reference was retained unchanged. This is a policy difference, not an engine
miss or evidence of a musical mistake.

## Before/after cases

| Passage | Before | After | Assessment |
| --- | --- | --- | --- |
| 01, clean SATB | Correctly states no core problems | Misreads tenor and bass an octave low; invents seven alto–tenor spacing warnings and disputes the empty checker | Clear regression |
| 02, outer fifths | Correctly locates S/B G4/C3 → A4/D3 at m1 beats 1→3 | Retains the same exact finding and labels the direct-octave exception separately | No target gain; already correct |
| 03, crossed voices | Finds both crossings, misses all three overlaps, and invents wide alto–tenor spacing from wrong octaves | Reports both crossings and all three overlaps with correct pitches; drops false spacing claims | Concrete gain |
| 04, ties/rests/octaves | Recognizes three octave successions but gives lower voices in wrong octaves; also invents alto–tenor spacing concerns | Gives all three successions with correct pitches and handles the held tenor/rest gap; retains one wrong interval sentence elsewhere | Target gain with residual prose error |
| 05, keyboard | Labels chord-position strands as inferred and avoids applying SATB rules | Explicitly explains RH exclusion and incomplete coverage; adds a wrong “inward” tritone-resolution description | Better applicability explanation; residual factual regression |
| 06, clean two-part | Correct core summary and correct final contrary motion | Still no core warnings, but misreads bass octaves and invents a final direct-octave explanation | Core result retained; broader explanation regresses |

Read the exact outputs: [01 before](astra-01-before.md) / [after](astra-01-after.md),
[02 before](astra-02-before.md) / [after](astra-02-after.md),
[03 before](astra-03-before.md) / [after](astra-03-after.md),
[04 before](astra-04-before.md) / [after](astra-04-after.md),
[05 before](astra-05-before.md) / [after](astra-05-after.md),
[06 before](astra-06-before.md) / [after](astra-06-after.md).

### One concrete correction

In passage 04, before says the tenor/bass move **C3/C2 → D3/D2**. The source
actually specifies **C4/C3 → D4/D3**; the clef alone does not transpose notes.
After states the correct octave placement and also correctly identifies
**F5/F4 → E5/E4** across m3 beat 3 to m4 beat 1, while preserving the earlier
soprano rest as a break in continuity.

The negative control matters just as much: passage 01's after response calls
the tenor's initial C4 “C3” and invents wide spacing. An empty findings list
does not supply enough note-level evidence to prevent that misreading.

## Context, time and cost

Provider-reported prompt tokens (uncached input + cache reads/writes):

| Passage | Before | After | Added |
| --- | ---: | ---: | ---: |
| 01 | 311 | 518 | 207 |
| 02 | 311 | 643 | 332 |
| 03 | 310 | 1,112 | 802 |
| 04 | 298 | 1,001 | 703 |
| 05 | 247 | 514 | 267 |
| 06 | 249 | 481 | 232 |
| Total | 1,726 | 4,269 | 2,543 |

The extra evidence averaged about **424 prompt tokens per passage**. Output
tokens fell from 5,748 to 4,138, so combined input/output rose from 7,474 to
8,407. Total model latency was 232.5 seconds before and 217.0 seconds after;
these single sequential samples do not establish a speed improvement.

SDK catalog cost estimates were $0.060932 before and $0.049918 after
($0.110850 combined). These are **not invoices or measured OAuth charges**;
billed cost is unavailable. The smaller after output, rather than lower input
cost, explains the lower catalog estimate. All numbers are in [metrics.json](metrics.json).

## Verification and next evaluation

Real core tests pass on music21 9.9.2 and 10.5.0, including exact located facts,
contrary/oblique/P5-to-d5/unison controls, silence, ties/carry-in, crossing,
overlap, spacing/ranges, melodic intervals, transposition, excluded chordal
voices, repeats, invalid options, deterministic output and truncation. Direct,
HTTP and stdio results match in full; immutable input and revision checks pass.
The Electron build, TypeScript check and lint pass; existing lint warnings are
recorded separately from errors. The full Node suite passed **255 tests** and
the final serialized Vitest run passed **994 tests across 106 files**. Earlier
aggregate attempts had UI failures while unrelated UI files/tests were being
edited concurrently; the affected files also passed a separate 130-test rerun.
All attempts and the final successful run are recorded in `verification.json`.

Recompute pairing, prompt usage and selected-claim scores without model calls:
`node scripts/core-analysis-report.mjs`. To run a fresh live experiment, prepare
a new output directory with public inputs and invoke
`scripts/core-analysis-pilot.cjs` with the repository's Electron executable and
that output directory. It uses the selected encrypted desktop connection.

Next, test compact **voice register/pitch facts alongside empty results** on a
new held-out set, and require exact-note citations for prose claims. Do not
tune that change on these six cases and then reuse them as final evidence.
Compare a stronger analyst in both arms, add human-reviewed real passages,
repeat calls to quantify variance, and assess autonomous helper use separately.
Contextual dissonance/function claims need their own scorecard rather than being
credited because core interval detection worked.

No claim of overall musical or pedagogical improvement is justified by this
six-pair synthetic pilot.
