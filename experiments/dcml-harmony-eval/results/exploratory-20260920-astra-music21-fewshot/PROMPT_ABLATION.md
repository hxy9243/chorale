# Astra + music21 contrastive-prompt ablation

## Outcome

| Condition | Exact harmony | Local key | Root | Quality | Inversion | Boundary F1 |
|---|---:|---:|---:|---:|---:|---:|
| Astra + SKILL + music21 | 42.8% | 81.4% | 81.5% | 63.1% | 80.3% | 77.4% |
| Astra + SKILL + music21 + static contrasts | 37.6% | 78.3% | 76.5% | 60.5% | 80.0% | 81.4% |
| Difference | -5.2 pp | -3.1 pp | -4.9 pp | -2.6 pp | -0.3 pp | +4.0 pp |

The static contrastive block did not improve the music21-assisted condition. Exact
harmony, local key, root, quality, and inversion all declined; only boundary F1
improved. This contrasts with the positive aggregate result for the same examples
with BACHI proposals, so the examples are not a generally useful add-on independent
of the evidence representation.

## Passage-level exact-harmony changes

| Case | Without contrasts | With contrasts | Change |
|---|---:|---:|---:|
| `case-a1` | 35.2% | 35.2% | +0.0 pp |
| `case-b2` | 10.9% | 4.7% | -6.2 pp |
| `case-c3` | 52.3% | 39.8% | -12.5 pp |
| `case-d4` | 64.6% | 52.1% | -12.5 pp |
| `case-e5` | 46.9% | 46.9% | +0.0 pp |
| `case-f6` | 46.9% | 46.9% | +0.0 pp |

Three passages regressed and none improved. The large boundary gain on `case-f6`
(65.0% to 92.9%) did not improve its exact-harmony score because root accuracy fell
from 87.5% to 75.0%.

## Interpretation

Keep Astra + SKILL + music21 without few-shots as the stronger music21-assisted
configuration. Do not combine the current static examples with music21 evidence in
the next benchmark. The examples may compete with dense deterministic evidence or
shift attention from literal chord content toward segmentation and key heuristics.
That mechanism is only a hypothesis: this experiment has one sample per condition
and the examples were designed after inspecting the same six passages.

The more promising next experiment remains a constrained two-stage pipeline:

1. infer and freeze local-key regions;
2. label root, quality, inversion, and Roman function using the score and specialist
   evidence within those regions.

Test that design on new works and with repeated samples before treating any delta as
generalizable.
