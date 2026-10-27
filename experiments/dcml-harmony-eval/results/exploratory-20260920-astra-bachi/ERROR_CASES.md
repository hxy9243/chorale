# Error cases for prompt and few-shot design

These examples come from the scored six-passage extension. They are not training
examples for the current run. Any follow-up that inserts them into a prompt must use
a new exploratory run ID and a different evaluation split.

| Case and position | Sounding slice (bass first) | DCML reference | Astra + skill + music21 | Terra + skill + BACHI | Likely lesson |
|---|---|---|---|---|---|
| `case-b2`, m.3 + 0 qb | A3 D4 F5 | C major `V(64)/ii` | D minor `i64` | D minor `i64` | Do not turn every tonicized chord into a local-key change. Require evidence of sustained tonicization before changing local key. |
| `case-d4`, m.4 + 0 qb | E4 G#5 | A minor `V` | A minor `V7` | D minor `VII6` | Treat absent chord members cautiously; do not hallucinate a seventh from functional expectation. Use surrounding bass and resolution. |
| `case-f6`, m.3 + 1 qb | Bb3 E4 Db5 Db6 | E-flat major `#viio43/ii` | E-flat major `vii°43/ii` | E-flat major `viio7/ii` | Preserve chromatic alteration and inversion separately from root/quality. Literal root correctness is not enough. |
| `case-a1`, m.5 + 0 qb | F3 A4 | A minor `VI(9)` | A minor `VI` | C major `IV` | Added-note labels and local-key interpretation need separate decisions; a sparse onset may require the full span and retained tones. |
| `case-e5`, m.8 + 0 qb | F3 Ab3 Bb3 D4 Ab5 | B-flat major `V43/IV` | G minor `V43/VI` | G minor `V43/VI` | Relative-major/minor ambiguity can preserve the same sounding chord but invalidate the functional label. Delay a key switch without phrase-level evidence. |
| `case-f6`, m.2 + 2 qb | Db4 B4 B5 | E-flat major `It6/ii` | E-flat major `It6/ii` | E-flat major `viio7/VI` | Special augmented-sixth vocabulary is a useful targeted few-shot category for the weaker hybrid model. |

## Recommended few-shot structure

Use contrastive examples, not isolated “notes → answer” pairs. Each example should
show the same pitch content under two plausible analyses, then state the contextual
fact that decides between them:

1. exact ABC or onset-aligned score slice, including sustained notes and literal bass;
2. previous and next harmonic span;
3. two candidate analyses;
4. the deciding rule (key continuity, resolution, chromatic alteration, inversion, or
   non-chord-tone retention);
5. the final structured span.

The highest-value initial set is one example each for tonicization versus modulation,
relative-major/minor ambiguity, added-note retention, altered leading-tone spelling,
and augmented-sixth chords. Keep those examples development-only and evaluate on new
works so the gain is not prompt-set memorization.
