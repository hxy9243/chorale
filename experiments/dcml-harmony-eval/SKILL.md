---
name: dcml-mozart-harmony-analysis
description: Analyze a bounded, sanitized Mozart piano passage as explicit harmonic spans using deterministic note/time evidence. Use only for the evidence-assisted condition in the DCML pilot.
version: 1
---

# Bounded harmony analysis

Return only the requested JSON object. Do not search the web, identify the work,
or use remembered published analyses. Treat `music21` candidates as fallible
evidence, never as gold labels.

## Procedure

1. Align all note events by exact rational quarter-beat onset. Carry a note until
   its duration ends; ties are one sounding event, not fresh harmony changes.
2. At each plausible harmonic boundary, collect all sounding pitch spellings and
   identify the literal lowest pitch independently. Preserve chromatic spelling.
3. Infer the passage key and any local tonicization from several adjacent slices,
   not from a single vertical sonority. Prefer a stable local key unless a cadence
   or sustained functional progression establishes a change.
4. Separate structural chord tones from ornaments only when metric position,
   approach, continuation, and resolution support that reading. Weak-beat passing
   and neighbor tones should not force a new chord; a strong-beat dissonance may.
5. Infer root and quality from the structural pitch classes, then infer inversion
   from the sounding bass. Do not infer inversion from note order or the candidate
   label. Use `root`, `first`, `second`, or `third`; use `unknown` if evidence is
   genuinely insufficient.
6. Express the result as Roman numeral in the stated local key. Preserve applied
   targets and seventh-chord figures (for example `V7/V`, `V65`, `ii6`). Do not
   collapse inversions or local-key changes for a superficially higher score.
7. Merge adjacent slices only when local key, root, quality, and inversion describe
   the same structural harmony. A boundary should reflect a musical change rather
   than every note onset.
8. For every predicted span, cite at least one exact measure/offset slice and list
   only pitches actually sounding there. The cited bass must be the literal lowest
   sounding pitch, even when it is a non-chord tone.

## Uncertainty

Keep confidence calibrated. Prefer `unknown` to invented precision. The task scores
local key, root, quality, inversion, label, and span boundaries separately, so one
uncertain field need not contaminate the others.

