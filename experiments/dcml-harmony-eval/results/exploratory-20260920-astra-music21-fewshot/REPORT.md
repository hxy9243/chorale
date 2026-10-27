# DCML Mozart harmony-analysis pilot results

Run ID: `exploratory-20260920-astra-music21-fewshot`  
Corpus: `DCMLab/mozart_piano_sonatas` at `5337257a5318711e6302cfe85c3f1a6ade3c6271` (`v2.3`)  
License: CC BY-NC-SA 4.0 (noncommercial pilot; attribution retained)  
Models: `BACHI-classical_film_kdec`, `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-6-astra`, reasoning `medium`  
Actual monetary cost: unavailable from ChatGPT-authenticated Codex JSONL; token usage and latency are reported where supplied.

## Result

| Model | Condition | Scored | Reduced harmony | Local key | Root | Quality | Inversion | Boundary F1 (≤¼ qb) | Unsupported evidence | Mean latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BACHI-classical_film_kdec | bachi | 6/6 | n/a | n/a | 58.0% | 58.9% | 76.3% | 72.6% | 1.8% | n/a s |
| gpt-5.6-luna | model_score_only | 6/6 | 15.5% | 31.2% | 62.5% | 48.1% | 59.5% | 74.5% | 16.5% | 186.9 s |
| gpt-5.6-luna | model_skill_evidence | 6/6 | 12.7% | 49.0% | 52.1% | 40.0% | 58.6% | 57.4% | 0.0% | 163.8 s |
| gpt-5.6-terra | model_score_only | 6/6 | 15.9% | 32.9% | 58.1% | 47.8% | 70.7% | 74.7% | 5.8% | 92.5 s |
| gpt-5.6-terra | model_skill_bachi | 6/6 | 26.6% | 61.1% | 70.9% | 56.3% | 73.7% | 76.6% | 4.9% | 205.7 s |
| gpt-5.6-terra | model_skill_evidence | 6/6 | 21.5% | 56.4% | 61.8% | 49.5% | 64.5% | 73.4% | 0.0% | 81.0 s |
| gpt-6-astra | model_score_only | 6/6 | 31.9% | 60.7% | 70.2% | 56.5% | 77.1% | 84.3% | 0.0% | 90.4 s |
| gpt-6-astra | model_skill_bachi | 6/6 | 35.0% | 59.4% | 77.6% | 62.1% | 83.8% | 86.0% | 0.0% | 93.8 s |
| gpt-6-astra | model_skill_bachi_fewshot | 6/6 | 44.0% | 81.6% | 74.5% | 66.0% | 78.3% | 84.8% | 0.0% | 98.1 s |
| gpt-6-astra | model_skill_evidence | 6/6 | 42.8% | 81.4% | 81.5% | 63.1% | 80.3% | 77.4% | 0.0% | 103.2 s |
| gpt-6-astra | model_skill_evidence_fewshot | 6/6 | 37.6% | 78.3% | 76.5% | 60.5% | 80.0% | 81.4% | 0.0% | 93.5 s |
| music21-9.9.1 | music21 | 6/6 | 9.9% | 49.0% | 49.9% | 10.0% | 61.1% | 45.0% | 0.0% | 0.0 s |

“Reduced harmony” is duration-weighted exact agreement on normalized local key plus the full DCML chord token. Root spelling, chord quality, inversion, and boundaries remain separate so one normalization choice cannot hide another error.
BACHI does not predict local key or Roman numeral, so those two cells are intentionally `n/a`; its inversion is derived from predicted root, quality, and bass.

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

- `BACHI-classical_film_kdec` / `bachi`: 0 execution failures; schema-valid rate 100.0%; usage not reported.
- `gpt-5.6-luna` / `model_score_only`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=88884, output_tokens=42829, reasoning_output_tokens=26671.
- `gpt-5.6-luna` / `model_skill_evidence`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=20736, input_tokens=124773, output_tokens=48707, reasoning_output_tokens=17471.
- `gpt-5.6-terra` / `model_score_only`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=88884, output_tokens=29340, reasoning_output_tokens=16813.
- `gpt-5.6-terra` / `model_skill_bachi`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=34048, input_tokens=102573, output_tokens=30485, reasoning_output_tokens=16152.
- `gpt-5.6-terra` / `model_skill_evidence`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=27648, input_tokens=124773, output_tokens=25277, reasoning_output_tokens=11590.
- `gpt-6-astra` / `model_score_only`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=8704, input_tokens=95946, output_tokens=17266, reasoning_output_tokens=3428.
- `gpt-6-astra` / `model_skill_bachi`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=107045, output_tokens=17893, reasoning_output_tokens=3708.
- `gpt-6-astra` / `model_skill_bachi_fewshot`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=109913, output_tokens=18634, reasoning_output_tokens=3374.
- `gpt-6-astra` / `model_skill_evidence`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=0, input_tokens=131835, output_tokens=19544, reasoning_output_tokens=2858.
- `gpt-6-astra` / `model_skill_evidence_fewshot`: 0 execution failures; schema-valid rate 100.0%; usage cache_write_input_tokens=0, cached_input_tokens=17408, input_tokens=134703, output_tokens=17615, reasoning_output_tokens=2004.
- `music21-9.9.1` / `music21`: 0 execution failures; schema-valid rate 100.0%; usage not reported.

Each model call ran in a fresh bubblewrap namespace. Only one opaque sanitized case, the output schema, and—in a guided condition—the task skill plus either deterministic evidence or BACHI proposals were mounted. Shell, code execution, apps, plugins, browser/computer use, skill search, recommendations, image generation, and multi-agent features were disabled. The corpus clone, gold TSVs, repository, prior predictions, and scoring outputs were not mounted. Predictions were saved before the evaluator joined them to gold.

## Representative aligned cases

### BACHI-classical_film_kdec / bachi
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `unknown unknown`.

### gpt-5.6-luna / model_score_only
- Correct in case-c3 at displayed m. 1 + 0 qb to m. 1 + 1/2 qb: reference `E- major I`; prediction `Eb major I`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `C major V6/4/vi`.

### gpt-5.6-luna / model_skill_evidence
- Correct in case-a1 at displayed m. 2 + 3 qb to m. 3 + 0 qb: reference `A minor V7`; prediction `A minor V7`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-5.6-terra / model_score_only
- Correct in case-c3 at displayed m. 1 + 0 qb to m. 1 + 1/2 qb: reference `E- major I`; prediction `Eb major I`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `C major vii°/iii`.

### gpt-5.6-terra / model_skill_bachi
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 7/2 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-5.6-terra / model_skill_evidence
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-6-astra / model_score_only
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-6-astra / model_skill_bachi
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-6-astra / model_skill_bachi_fewshot
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-6-astra / model_skill_evidence
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/V`.

### gpt-6-astra / model_skill_evidence_fewshot
- Correct in case-a1 at displayed m. 1 + 2 qb to m. 1 + 3 qb: reference `A minor VI`; prediction `A minor VI`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor V/v`.

### music21-9.9.1 / music21
- Correct in case-a1 at displayed m. 2 + 1 qb to m. 2 + 2 qb: reference `A minor iio6`; prediction `A minor iio6`.
- Incorrect in case-a1 at displayed m. 1 + 0 qb to m. 1 + 1 qb: reference `A minor III(7#2)`; prediction `A minor II#3`.

## Interpretation and recommendation

Observed guided-minus-score-only reduced-harmony deltas: `gpt-5.6-luna` -2.8%; `gpt-5.6-terra` +5.6%; `gpt-6-astra` +10.9%.

**Next-release recommendation: no-ship for authoritative or default model analysis.** Terra with skill/evidence changed reduced harmony by +5.6% and reached 21.5%, but its inversion and boundary results remain mixed.  Terra+BACHI reached 26.6%, +10.7% vs score-only and +5.1% vs skill+music21.  Astra+skill+music21 reached 42.8%, +10.9% vs Astra score-only, but remains far below an 85% product threshold.  Adding the same static contrastive block to Astra+skill+music21 reached 37.6%, a -5.2% change, with regressions on 3/6 passages. This is tuned exploratory evidence because the error classes came from this benchmark.  Astra+skill+BACHI reached 35.0%; adding the static contrastive block reached 44.0%, a +9.0% change. It nevertheless regressed on 4/6 individual passages. Because the error classes were selected from this benchmark, that few-shot delta is tuned exploratory evidence. Luna changed reduced harmony by -2.8%. Keep Astra+skill+music21 as the untuned reference and evaluate the contrastive/key-segmentation idea on a fresh blinded split before selecting it; keep any product exposure experimental, reviewable, and clearly separated from deterministic facts.

Do not treat this pilot as general Mozart accuracy or ship model-authored harmony as authoritative. Use the result to decide whether evidence-assisted analysis merits a larger, blinded benchmark with more works, multiple samples, human adjudication, and explicit special-chord coverage. Even a positive delta supports only an experimental, reviewable analysis path; deterministic note/time facts should remain visibly distinct from heuristic harmonic interpretation.

## Limitations

- Six passages are a small, deliberately varied pilot; confidence intervals and repeated-sample variance are not estimated.
- Public, famous repertoire may be memorized even when filenames and annotations are hidden. The mid-movement selection lowers but cannot remove that risk.
- `music21` chordification treats every sounding pitch literally; ornaments and suspensions can produce analytically implausible candidates.
- The reduced exact metric does not yet fully decompose DCML changes, relative-root chains, pedals, or augmented-sixth special encodings.
- Cadence and phrase-boundary accuracy is intentionally not reported; voice-leading has no complete DCML gold standard here.
- The note facet contains note heads, not explicit rests. Silence is inferred only from the absence of active note segments.
- The contrastive few-shot categories were chosen after inspecting errors on these same six passages. The examples are synthetic, but the resulting score is tuned-on-benchmark and not held-out accuracy.
- BACHI's eight-piece sample comes from its official validation partition, which may have influenced checkpoint selection; it is not a pristine external test.

## BACHI official-validation sample

Eight piece identifiers were randomly selected with seed 20260920 after reproducing BACHI's seed-42 piece split. Equal-piece macro prevents long works from dominating; duration-weighted values expose that duration imbalance.

| Aggregate | Root | Quality | Bass | Full chord | Boundary F1 (≤¼ qb) |
|---|---:|---:|---:|---:|---:|
| Equal-piece macro | 79.3% | 81.6% | 79.5% | 73.9% | 76.9% |
| Duration-weighted | 63.0% | 67.4% | 62.3% | 53.6% | 63.5% |

| Piece | Root | Quality | Bass | Full chord | Boundary F1 |
|---|---:|---:|---:|---:|---:|
| `Chamber_Other_Corelli_Op4No10_5` | 54.7% | 70.6% | 60.7% | 50.8% | 54.1% |
| `Early_Choral_Bach_Chorales_080` | 97.9% | 99.0% | 100.0% | 96.9% | 96.2% |
| `Early_Choral_Bach_Chorales_186` | 100.0% | 98.9% | 100.0% | 98.9% | 98.0% |
| `Early_Choral_Bach_Chorales_292` | 99.0% | 99.0% | 97.9% | 96.9% | 99.0% |
| `Early_Choral_Bach_Chorales_357` | 97.1% | 97.1% | 100.0% | 97.1% | 98.2% |
| `Keyboard_Other_Grieg_Lyric_Pieces_Op57_No1` | 29.7% | 32.6% | 28.0% | 14.6% | 48.7% |
| `beethoven_piano_sonatas_09-2` | 79.6% | 83.2% | 76.7% | 69.9% | 67.4% |
| `rachmaninoff_piano_op42_05` | 76.1% | 72.7% | 72.7% | 65.9% | 53.8% |

## Reproduce

```bash
cd experiments/dcml-harmony-eval
uv sync --extra dev --frozen
uv run chorale-dcml-eval run \
  --corpus /path/to/mozart_piano_sonatas-at-5337257a \
  --run-dir /tmp/chorale-dcml-eval-run \
  --results-dir results/exploratory-20260920-astra-music21-fewshot \
  --models gpt-6-astra --conditions model_skill_evidence_fewshot \
  --few-shot CONTRASTIVE_FEW_SHOTS.md --effort medium --exploratory
```

The corpus checkout must be at the exact pinned commit. The run directory contains private gold joins and must stay outside model-visible staging and version control.
