# Final guided-model comparison

## Product-relevant condition

All three models received the identical sanitized passage, analytical `SKILL.md`,
deterministic music21 evidence, output schema, and medium reasoning effort. Each
model has one sample per passage.

| Model | Exact harmony | Local key | Root | Quality | Inversion | Boundary F1 | Mean latency |
|---|---:|---:|---:|---:|---:|---:|---:|
| GPT-5.6 Terra | 21.5% | 56.4% | 61.8% | 49.5% | 64.5% | 73.4% | 81.0 s |
| GPT-5.6 Sol | 25.3% | 60.4% | 67.5% | 58.0% | 66.0% | 68.5% | 125.6 s |
| GPT-6 Astra | 42.8% | 81.4% | 81.5% | 63.1% | 80.3% | 77.4% | 103.2 s |

Sol improves exact harmony by 3.8 percentage points over Terra, but trails Astra by
17.5 points. Astra also beats Sol on every individual passage. Sol's two zero-exact
cases (`case-b2` and `case-e5`) coincide with 0% local-key accuracy, while Astra
reaches 34.4% and 75.0% local-key accuracy on those passages.

| Case | Terra exact | Sol exact | Astra exact |
|---|---:|---:|---:|
| `case-a1` | 35.2% | 32.8% | 35.2% |
| `case-b2` | 4.7% | 0.0% | 10.9% |
| `case-c3` | 35.9% | 39.8% | 52.3% |
| `case-d4` | 18.8% | 41.7% | 64.6% |
| `case-e5` | 0.0% | 0.0% | 46.9% |
| `case-f6` | 34.4% | 37.5% | 46.9% |

## Cost context

The ChatGPT-authenticated runner does not expose an actual monetary charge. Applying
the current published API token rates to the recorded uncached input, cached input,
and output usage gives a rough six-passage estimate:

| Model | Approx. six-passage API cost | Approx. per passage |
|---|---:|---:|
| GPT-5.6 Terra | $0.50 | $0.084 |
| GPT-5.6 Sol | $1.24 | $0.207 |
| GPT-6 Astra | $2.30 | $0.383 |

These estimates exclude any pricing differences between the API and ChatGPT-backed
execution and should not be treated as observed billing.

## Decision

For the product architecture under consideration, GPT-6 Astra + SKILL + music21 is
the strongest current candidate. It requires no specialist-model dependency and
substantially outperforms Terra and Sol across exact harmony, key, root, quality,
inversion, and passage-level consistency. Sol is not a compelling middle tier in
this run: it costs more and runs slower than Terra for only a modest exact-score
gain, while remaining far behind Astra.

The candidate is still experimental. Its 42.8% exact score is far below the stated
85% target, this benchmark has only six passages, and each condition has one sample.
The next evidence needed is a fresh multi-work split with repeated samples and human
adjudication, followed by the proposed two-stage key-region and chord-label pipeline.

For completeness, Astra + BACHI + static few-shots reached 44.0%, the highest raw
score observed, but it adds a dependency and uses a prompt tuned from these same
cases. It does not overturn the product-integration choice.
