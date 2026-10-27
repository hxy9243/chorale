---
title: "DCML Mozart Harmony Analysis Pilot"
description: "Reproducible, contamination-aware evaluation of deterministic and small-model harmony analysis"
category: "evaluation"
date: 2026-09-19
status: "experimental"
source_files:
  - experiments/dcml-harmony-eval/pyproject.toml
  - experiments/dcml-harmony-eval/src/chorale_dcml_eval
  - experiments/dcml-harmony-eval/SKILL.md
test_files:
  - experiments/dcml-harmony-eval/tests
related_specs:
  - spec/agent-evaluation.md
  - spec/agent-analysis-and-annotations.md
---

# DCML Mozart harmony-analysis pilot

## Decision being tested

Chorale is primarily an existing-repertoire understanding product (approximately
85% of intended use, versus 15% interactive composition). This pilot tests whether
deterministic `music21` evidence plus a narrow analytical skill improves smaller
Codex models' recovery of expert DCML harmony labels from symbolic Mozart piano
scores. It is an evaluation experiment, not a release claim or a replacement for
the credential-free v0.0.1 agent gate.

## Conditions

For the same held-out passages, compare:

1. `music21`: deterministic onset slices, key estimation, chord/root/quality,
   inversion, and Roman-numeral heuristics;
2. `model_score_only`: a named small model receives sanitized symbolic note events
   and the common output schema/instructions;
3. `model_skill_evidence`: the same model and effort receives the same events plus
   deterministic evidence and the versioned `SKILL.md` analytical procedure.
4. `bachi`: the pretrained BACHI classical checkpoint receives score-derived
   MusicXML and predicts chord boundaries, literal root, quality, and bass;
5. `model_skill_bachi`: Terra receives the same sanitized score facts and skill as
   the guided condition plus BACHI's predicted spans as explicitly fallible
   proposals. It must verify, correct, merge, or split those proposals rather than
   copy them, and must infer local key and Roman numeral itself.
6. `model_skill_bachi_fewshot`: Astra receives exactly condition 5 plus a short,
   versioned block of synthetic contrastive examples covering recurring error
   classes. The examples contain no held-out passage, filename, or reference label.
7. `model_skill_evidence_fewshot`: Astra receives exactly condition 3 plus the same
   frozen contrastive block used in condition 6. This isolates whether the examples
   complement `music21` evidence without changing the score, skill, schema, model,
   effort, or examples.

The original run uses GPT-5.6 Terra and GPT-5.6 Luna at medium reasoning. The
exploratory extension adds GPT-6 Astra at medium reasoning to conditions 2 and 3,
and Terra at medium reasoning to condition 5. Existing Terra and Luna records are
reused byte-for-byte rather than sampled again. The runner must not silently
substitute another model. An unavailable model is recorded as an execution failure,
separately from musical accuracy.

A second exploratory extension runs Astra at medium reasoning on conditions 5 and
6. The contrastive block is frozen before inference and differs from condition 5 by
one appended prompt section only. Its categories are derived from observed errors on
the same six passages, so any gain is prompt-tuning evidence rather than a held-out
generalization result. The examples are deliberately synthetic and teach error
classes—tonicization versus modulation, relative-key ambiguity, unsupported
sevenths, chromatic alteration/inversion, and augmented-sixth recognition—without
encoding the evaluated answers.

A third exploratory extension runs Astra at medium reasoning on condition 7. It
reuses the six condition-3 records byte-for-byte as the baseline and makes six new
calls with the frozen contrastive block. Because the examples were derived from
errors on these same passages, this remains tuned prompt-ablation evidence rather
than a held-out accuracy estimate.

A fourth exploratory extension runs GPT-5.6 Sol at medium reasoning on condition 3
without changing the prompt, evidence, schema, passages, or evaluator. It is a
model-capacity reference against the existing Terra-medium and Astra-medium records;
all earlier predictions are reused byte-for-byte. Aggregate and passage-level
regressions must both be reported before choosing an integration candidate.

A fifth exploratory extension freezes a fresh twenty-passage benchmark before any
new inference: ten eight-measure windows from ten previously unused DCML Mozart
movements and ten eight-measure windows from ten previously unused pieces in the
official BACHI classical validation partition. Every model receives exactly the
condition-3 prompt (sanitized score facts, `music21` evidence, and `SKILL.md`) with
no few-shot examples and no BACHI predictions. The requested model/effort pairs are
GPT-5.6 Luna xhigh, GPT-5.6 Terra xhigh, GPT-5.6 Sol high, and GPT-6 Astra medium.
The runner must make eighty fresh calls and must not reuse the earlier six-passage
predictions.

The wide-benchmark selection seed is 20260921. DCML sampling excludes the two
development movements and all six prior held-out movements, uses distinct source
movements, and admits windows with 8--80 non-empty reference harmony labels. BACHI
sampling first reproduces the published piece split with seed 42, excludes the eight
pieces already used for the specialist cross-check, shuffles the remaining validation
pieces with seed 20260921, and takes the first ten with a parseable MusicXML source.
Within each BACHI piece, an eight-measure window is selected reproducibly before
inference. The frozen manifest records all source identifiers and offsets.

A sixth exploratory extension adds three non-OpenAI models through the Pi agent and
OpenRouter: `deepseek/deepseek-v4.1-flash`, `z-ai/glm-5.2`, and
`moonshotai/kimi-k3`, each at Pi's `high` reasoning level. It reuses the identical
frozen twenty passages, deterministic evidence, `SKILL.md`, prediction schema,
condition-3 prompt, and scorer. Pi has no output-schema command equivalent, so the
same JSON Schema is appended as compact prompt text; tools, extensions, discovered
skills, context files, and sessions are disabled. Provider-reported model IDs,
latency, token usage, and billed cost are captured per call. These sixty predictions
are compared with the eighty existing Codex predictions, not pooled across corpora.
If OpenRouter rejects Pi's catalog-wide maximum-output reservation, the retry may
apply a recorded output cap above the largest successful task answer; model,
reasoning level, prompt, evidence, and scorer remain unchanged.

The specialist is also evaluated on eight pieces sampled from the official BACHI
classical validation partition. The official piece-level split is reproduced with
seed 42; eight validation identifiers are then selected with seed 20260920 and
recorded before inference. This is a checkpoint-validation cross-check, not an
independent test set, because validation data can influence model selection.

## Corpus and split

The source is `DCMLab/mozart_piano_sonatas`, pinned by full Git commit. The corpus
license and citation are recorded in the run manifest. Six bounded passages from
six distinct movements are selected to cover major/minor keys, simple chordal and
more contrapuntal/figurated textures, inversions, tonicization, and local-key
changes. At least two additional whole movements are development-only; held-out
passages and their gold labels are never used in examples or prompt tuning.

The checked-in selection manifest records movement, measure span, split, selection
rationale, and measured duration/label coverage. Selection is frozen before model
scoring. A rerun after inspecting held-out results must use a new run ID and be
marked exploratory.

## Contamination boundary

DCML MuseScore files contain harmony, cadence, phrase, figured-bass, lyrics, and
other markup. Neither those files nor `harmonies/`, `chords/`, repository history,
filenames containing analytical answers, or evaluation outputs may be visible to a
model run.

Preparation occurs in a gold-side process that:

- loads note and measure tables rather than annotated MuseScore sources;
- copies only normalized note/rest facts needed for the selected passage;
- strips free text and all answer-bearing columns;
- assigns opaque case IDs for inference;
- validates an allowlist schema and scans serialized inference inputs for forbidden
  label, cadence, phrase, annotator, harmony, and source-path tokens;
- writes sanitized inference bundles to a newly created staging directory outside
  both the corpus clone and repository.

The model runner receives only one sanitized case, common instructions, and (for
conditions 3 and 7) the skill, deterministic evidence, and optional static
contrastive block, or (for conditions 5 and 6) the skill, BACHI proposals, and
optional static contrastive block. It runs with a read-only sandbox,
no web search, and a working directory containing no gold or prior results. Raw model
text and parsed predictions are copied out only after the process exits. Gold is joined
by the scorer afterward. Residual memorization remains possible because Mozart's
sonatas and some analyses are public; this pilot measures task behavior, not proof of
training-data independence. BACHI was trained on When-in-Rome and DCML, so its
result on the six Mozart passages is explicitly reported as an in-domain
cross-reference and never as out-of-sample generalization.

## Event and label contracts

Musical positions use `(movement, measure_count, beat)` with exact rational beat
values. Normalized note facts retain staff/voice identity, written and sounding
pitch spelling, MIDI number, onset, duration, tie state, and the lowest sounding
pitch. Tied notes are carried across slices; simultaneous onsets are aligned before
analysis. Score-measure labels remain available for reporting, but internal alignment
uses the corpus measure-count plus rational beat to avoid printed-number ambiguity.

Predictions are spans with start and exclusive end positions plus:

- local key tonic and mode;
- Roman-numeral degree/alteration and chord quality;
- inversion (`root`, `first`, `second`, `third`, or `unknown`);
- optional literal chord root and confidence;
- a bounded list of claims, each citing measure and beat evidence.

DCML labels are normalized without erasing distinctions: global/local key, numeral,
form/figured bass, root, quality, and inversion remain separate fields. Compound and
applied chords retain their secondary target. Unsupported or unparseable labels are
reported and excluded only from the metric that requires that field.

## Metrics

Report per condition/model and macro-averaged across passages:

- schema-valid response rate and execution-failure count;
- duration-weighted exact normalized harmony agreement;
- duration-weighted local-key accuracy;
- duration-weighted root, quality, and inversion accuracy where the gold supports it;
- boundary precision/recall/F1 within an explicitly reported beat tolerance;
- unsupported note-claim rate, checked only against deterministic note/time facts;
- latency, token usage, and monetary cost only when the execution interface supplies
  those values.

For BACHI, local-key and Roman-numeral accuracy are not defined because the
checkpoint predicts only root, quality, bass, and boundaries. The six-passage table
therefore reports root, quality, inversion derived from predicted bass, boundary F1,
and coverage only. The eight-piece BACHI validation sample reports duration-weighted
micro and equal-piece macro root, quality, bass, and full root-quality-bass accuracy,
plus boundary precision/recall/F1 at the same quarter-beat tolerance.

That limitation applies to scoring the BACHI *checkpoint*. The BACHI corpus files
also carry local-key and Roman-numeral reference columns. In the fifth extension,
LLM predictions on BACHI windows are therefore scored for local key, Roman numeral,
root, quality, inversion (derived from the reference bass), and boundaries using the
same metric implementation as DCML. Results remain stratified by corpus because
annotation conventions and repertoire differ; no pooled exact-harmony percentage is
used as the headline result.

Boundary and label metrics are separate: a label can be musically correct over an
incorrect span. Cadence/phrase metrics are omitted unless a reliable, separately
tested alignment is implemented. Voice-leading claims are factual diagnostics only;
DCML provides no complete voice-leading gold standard, so no reference accuracy is
invented.

## Reproducibility and release interpretation

The run manifest captures corpus commit, selection hash, dependency lock, Python and
Codex versions, exact model IDs, effort, prompts, skill hash, per-call status, latency,
and available usage/cost. Predictions, metrics, and representative matched/mismatched
spans are machine-readable and linked to movement/measure/beat.

Tests must cover sanitation, tie-aware normalized events, rational alignment, DCML
label normalization, boundary scoring, duration-weighted scoring, and unsupported
claims. The report states the exact run command and distinguishes experiment failures
from pre-existing repository failures.

This six-passage pilot and exploratory specialist extension can justify whether to
invest in a larger blinded benchmark or ship an evidence-assisted analysis path
behind an experimental flag. The primary hybrid comparison is Terra score-only vs
Terra skill+music21 vs Terra skill+BACHI on the identical six cases. Astra is a
capacity probe, Sol is a same-prompt model reference, and the paired Astra
conditions with and without few-shots are prompt ablations, not substitutes for
repeated sampling. Neither the Mozart
cross-reference nor the BACHI validation subsample can support a general accuracy
claim about Mozart, DCML, BACHI, or repertoire analysis.
