# Astra + BACHI contrastive-prompt ablation

## Outcome

| Condition | Exact harmony | Local key | Root | Quality | Inversion | Boundary F1 |
|---|---:|---:|---:|---:|---:|---:|
| Astra + SKILL + BACHI | 35.0% | 59.4% | 77.6% | 62.1% | 83.8% | 86.0% |
| Astra + SKILL + BACHI + static contrasts | 44.0% | 81.6% | 74.5% | 66.0% | 78.3% | 84.8% |
| Difference | +9.0 pp | +22.3 pp | -3.1 pp | +3.9 pp | -5.5 pp | -1.2 pp |

The static block principally repaired local-key continuity. It did not generally
improve literal chord recognition: root, inversion, and boundary accuracy declined.
The resulting 44.0% exact score narrowly exceeds Astra + SKILL + music21 (42.8%),
but this is not a held-out comparison because the error categories were selected
after inspecting this benchmark.

## Passage-level exact-harmony changes

| Case | Without contrasts | With contrasts | Change |
|---|---:|---:|---:|
| `case-a1` | 37.5% | 35.2% | -2.3 pp |
| `case-b2` | 12.5% | 10.9% | -1.6 pp |
| `case-c3` | 29.7% | 50.0% | +20.3 pp |
| `case-d4` | 77.1% | 70.8% | -6.2 pp |
| `case-e5` | 53.1% | 46.9% | -6.2 pp |
| `case-f6` | 0.0% | 50.0% | +50.0 pp |

Four of six passages regressed. The aggregate gain comes from large corrections on
`case-c3` and `case-f6`, especially local-key selection. This is an informative
mechanism result, not evidence that the static prompt robustly generalizes.

## Recommended next design

Separate the task into two constrained stages:

1. infer stable local-key regions using the key-continuity contrasts;
2. infer root, quality, inversion, and boundaries from the score plus BACHI while
   treating the frozen key regions as context.

Evaluate that pipeline on new works that were not used to choose these prompt
categories. Keep the current Astra + SKILL + music21 condition as the untuned
reference and repeat samples before choosing a production direction.
