# DCML Mozart harmony-analysis pilot

This experiment measures whether a narrow harmony-analysis skill and deterministic
`music21` evidence improve GPT-5.6 Terra and Luna over score-only prompting on six
held-out Mozart piano-sonata passages. It complements, but does not alter, Chorale's
credential-free `npm run test:eval` release gate.

The corpus is pinned to `DCMLab/mozart_piano_sonatas` commit
`5337257a5318711e6302cfe85c3f1a6ade3c6271` (release v2.3). Its repository states
CC BY-NC-SA 4.0; this is a noncommercial evaluation and results retain attribution.

## Run

```bash
git clone https://github.com/DCMLab/mozart_piano_sonatas.git /tmp/mozart_piano_sonatas
git -C /tmp/mozart_piano_sonatas checkout 5337257a5318711e6302cfe85c3f1a6ade3c6271

cd experiments/dcml-harmony-eval
uv sync --extra dev --frozen
uv run pytest
uv run chorale-dcml-eval run \
  --corpus /tmp/mozart_piano_sonatas \
  --run-dir /tmp/chorale-dcml-eval-run \
  --results-dir results/pilot-reproduction \
  --models gpt-5.6-terra gpt-5.6-luna \
  --effort medium
```

`--run-dir` must be outside the repository. It contains a private gold join and
ephemeral sanitized staging. Do not expose it to a model. Each inference call is
further isolated with bubblewrap and sees one opaque case only. Predictions are
saved before scoring reads gold.

For a credential-free deterministic-only smoke run, add `--skip-models`. Live
model execution requires an existing ChatGPT login in the local Codex CLI. The
runner never prints or copies credential contents.

## Outputs

- `REPORT.md`: concise method, results table, failure cases, limitations, and recommendation
- `metrics.json`: per-case and macro-averaged machine-readable metrics
- `run-manifest.json`: exact revisions, hashes, model settings, and versions
- `raw-model-predictions.json`: predictions and execution metadata captured before scoring
- `raw-deterministic-predictions.json`: music21 baseline spans
- `corpus-coverage.json`: selected passage duration and label coverage

This is a six-passage pilot, not a general accuracy claim. Public repertoire may
be memorized despite sanitation. Cadence, phrase, and voice-leading accuracy are
not reported because this run does not implement trustworthy aligned ground truth
for those tasks.

## Exploratory BACHI and Astra extension

`chorale-bachi-eval` exports the six sanitized cases, adapts BACHI's root-quality-
bass spans to this experiment, downloads the pinned eight-piece official-validation
sample, and scores it. The BACHI repository and classical checkpoint are external
inputs and are not vendored. BACHI currently needs two small music21 10 compatibility
changes in `inference.py`: call `bestName()` when it is callable and use
`part.flatten()` when available. Apply the checked-in compatibility patch with
`git -C /path/to/BACHI_Chord_Recognition apply /path/to/experiments/dcml-harmony-eval/patches/bachi-music21-10.patch`.

The main runner accepts explicit conditions and can merge prior result indexes:

```bash
uv run chorale-dcml-eval run \
  --corpus /tmp/mozart_piano_sonatas \
  --run-dir /tmp/chorale-dcml-exploratory \
  --results-dir results/exploratory-astra-bachi \
  --skip-models --exploratory \
  --reuse-model-results /path/to/original/model-run-index.json \
  --reuse-model-results /path/to/bachi/model-run-index.json \
  --reuse-model-results /path/to/astra/model-run-index.json \
  --reuse-model-results /path/to/terra-bachi/model-run-index.json \
  --bachi-validation-metrics /path/to/bachi-validation-metrics.json
```

The hybrid prompt names BACHI as fallible, withholds all validation/gold labels,
and asks Terra to verify, correct, merge, or split the proposed spans before deriving
its own key and Roman-numeral analysis.

`CONTRASTIVE_FEW_SHOTS.md` adds a brief synthetic prompt block for the
`model_skill_bachi_fewshot` condition. Run the paired Astra ablation with:

```bash
uv run chorale-dcml-eval run \
  --corpus /tmp/mozart_piano_sonatas \
  --run-dir /tmp/chorale-astra-bachi-ablation \
  --models gpt-6-astra --effort medium \
  --conditions model_skill_bachi model_skill_bachi_fewshot \
  --bachi-prediction-dir /path/to/bachi/contracts \
  --few-shot CONTRASTIVE_FEW_SHOTS.md --exploratory
```

The examples summarize error classes observed on this six-case benchmark, so their
result is a tuned prompt ablation. It must not be described as held-out accuracy.

To test the same frozen examples with deterministic `music21` evidence instead of
BACHI proposals, run the paired condition below and reuse the original Astra
`model_skill_evidence` records as its baseline:

```bash
uv run chorale-dcml-eval run \
  --corpus /tmp/mozart_piano_sonatas \
  --run-dir /tmp/chorale-astra-music21-fewshot \
  --models gpt-6-astra --effort medium \
  --conditions model_skill_evidence_fewshot \
  --few-shot CONTRASTIVE_FEW_SHOTS.md --exploratory
```
