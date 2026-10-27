# DCML Mozart harmony-analysis pilot results

Run ID: `pilot-20260919`  
Corpus: `DCMLab/mozart_piano_sonatas` at `5337257a5318711e6302cfe85c3f1a6ade3c6271` (`v2.3`)  
License: CC BY-NC-SA 4.0 (noncommercial pilot; attribution retained)  
Models: `gpt-5.6-terra`, `gpt-5.6-luna`, reasoning `medium`  
Actual monetary cost: unavailable from ChatGPT-authenticated Codex JSONL; token usage and latency are reported where supplied.

## Result

| Model | Condition | Scored | Reduced harmony | Local key | Root | Quality | Inversion | Boundary F1 (≤¼ qb) | Unsupported evidence | Mean latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | model_score_only | 6/6 | 15.5% | 31.2% | 62.5% | 48.1% | 59.5% | 74.5% | 16.5% | 186.9 s |
| gpt-5.6-luna | model_skill_evidence | 6/6 | 12.7% | 49.0% | 52.1% | 40.0% | 58.6% | 57.4% | 0.0% | 163.8 s |
| gpt-5.6-terra | model_score_only | 6/6 | 15.9% | 32.9% | 58.1% | 47.8% | 70.7% | 74.7% | 5.8% | 92.5 s |
| gpt-5.6-terra | model_skill_evidence | 6/6 | 21.5% | 56.4% | 61.8% | 49.5% | 64.5% | 73.4% | 0.0% | 81.0 s |
| music21-9.9.1 | music21 | 6/6 | 9.9% | 49.0% | 49.9% | 10.0% | 61.1% | 45.0% | 0.0% | 0.0 s |

“Reduced harmony” is duration-weighted exact agreement on normalized local key plus the full DCML chord token. Root spelling, chord quality, inversion, and boundaries remain separate so one normalization choice cannot hide another error.

## Corpus selection

Development-only movements were `K279-1` and `K280-2`; no held-out labels or passages were used as prompt examples. The six scored passages come from six other complete movements/works, reducing direct prompt tuning leakage.

| Opaque case | Auditable source passage | Measures | Quarter-beats | Note heads | Gold spans | Why selected |
|---|---|---:|---:|---:|---:|---|
| case-a1 | K310-1 mc 86–93 | 8 | 32 | 180 | 23 | A-minor development passage with dense attacks and chromatic dominant function |
| case-b2 | K533-1 mc 75–82 | 8 | 32 | 82 | 28 | F-major work, locally dominant, with independent lines and alla-breve texture |
| case-c3 | K570-2 mc 10–17 | 8 | 32 | 202 | 42 | Slow E-flat-major passage with ornaments, sustained voices, and high label density |
| case-d4 | K576-1 mc 74–81 | 8 | 24 | 118 | 19 | Late D-major 6/8 writing with contrapuntal and figurated activity |
| case-e5 | K281-1 mc 56–63 | 8 | 16 | 152 | 21 | B-flat-major movement's minor-key episode and return with applied dominants |
| case-f6 | K457-1 mc 43–50 | 8 | 32 | 74 | 14 | C-minor work, locally in III, with sparse but chromatically complex harmony |

Coverage: 48 written measures, 168 quarter-beats, and 147 chord-bearing reference spans.

## Execution and usage

- `gpt-5.6-luna` / `model_score_only`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=88884, output_tokens=42829, reasoning_output_tokens=26671.
- `gpt-5.6-luna` / `model_skill_evidence`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=20736, input_tokens=124773, output_tokens=48707, reasoning_output_tokens=17471.
- `gpt-5.6-terra` / `model_score_only`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=88884, output_tokens=29340, reasoning_output_tokens=16813.
- `gpt-5.6-terra` / `model_skill_evidence`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=27648, input_tokens=124773, output_tokens=25277, reasoning_output_tokens=11590.
- `music21-9.9.1` / `music21`: 0 execution failures; schema-valid rate 100.0%; usage not reported.

Each model call ran in a fresh bubblewrap namespace. Only one opaque sanitized case, the output schema, and—in the guided condition—the task skill plus deterministic evidence were mounted. Shell, code execution, apps, plugins, browser/computer use, skill search, recommendations, image generation, and multi-agent features were disabled. The corpus clone, gold TSVs, repository, prior predictions, and scoring outputs were not mounted. Predictions were saved before the evaluator joined them to gold.

## Representative aligned cases

### gpt-5.6-luna / model_score_only
- Correct in case-c3 at displayed m. 1 + 0 qb to m. 1 + 1/2 qb: reference `E- major I`; prediction `Eb major I`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `C major V6/4/vi`.

### gpt-5.6-luna / model_skill_evidence
- Correct in case-a1 at displayed m. 2 + 3 qb to m. 3 + 0 qb: reference `A minor V7`; prediction `A minor V7`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-5.6-terra / model_score_only
- Correct in case-c3 at displayed m. 1 + 0 qb to m. 1 + 1/2 qb: reference `E- major I`; prediction `Eb major I`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `C major vii°/iii`.

### gpt-5.6-terra / model_skill_evidence
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### music21-9.9.1 / music21
- Correct in case-a1 at displayed m. 2 + 1 qb to m. 2 + 2 qb: reference `A minor iio6`; prediction `A minor iio6`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor II#3`.

## Interpretation and recommendation

Observed guided-minus-score-only reduced-harmony deltas: `gpt-5.6-terra` +5.6%; `gpt-5.6-luna` -2.8%.

**Next-release recommendation: no-ship for authoritative or default model analysis.** Terra with skill/evidence changed reduced harmony by +5.6% and reached 21.5%, but its inversion and boundary results remain mixed. Luna changed reduced harmony by -2.8%. Advance only the better guided design to a larger blinded, repeated-sample benchmark; keep any product exposure experimental, reviewable, and clearly separated from deterministic facts.

Do not treat this pilot as general Mozart accuracy or ship model-authored harmony as authoritative. Use the result to decide whether evidence-assisted analysis merits a larger, blinded benchmark with more works, multiple samples, human adjudication, and explicit special-chord coverage. Even a positive delta supports only an experimental, reviewable analysis path; deterministic note/time facts should remain visibly distinct from heuristic harmonic interpretation.

## Limitations

- Six passages are a small, deliberately varied pilot; confidence intervals and repeated-sample variance are not estimated.
- Public, famous repertoire may be memorized even when filenames and annotations are hidden. The mid-movement selection lowers but cannot remove that risk.
- `music21` chordification treats every sounding pitch literally; ornaments and suspensions can produce analytically implausible candidates.
- The reduced exact metric does not yet fully decompose DCML changes, relative-root chains, pedals, or augmented-sixth special encodings.
- Cadence and phrase-boundary accuracy is intentionally not reported; voice-leading has no complete DCML gold standard here.
- The note facet contains note heads, not explicit rests. Silence is inferred only from the absence of active note segments.

## Reproduce

```bash
cd experiments/dcml-harmony-eval
uv sync --extra dev --frozen
uv run chorale-dcml-eval run \
  --corpus /path/to/mozart_piano_sonatas-at-5337257a \
  --run-dir /tmp/chorale-dcml-eval-run \
  --results-dir results/pilot-20260919 \
  --models gpt-5.6-terra gpt-5.6-luna --effort medium
```

The corpus checkout must be at the exact pinned commit. The run directory contains private gold joins and must stay outside model-visible staging and version control.
