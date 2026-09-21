# Harmony-analysis benchmark

Date: 2026-09-20  
Status: exploratory product evidence, not a release-quality claim

## Decision

Chorale uses **model + score-analysis SKILL + music21 evidence** as its dependency-light research path. music21 is exposed as a read-only candidate generator; it does not create annotations automatically. Agents must verify its output against the written score before proposing or persisting chord labels.

The benchmark does **not** support silent automatic annotation yet. The strongest complete configuration reached 60.6% exact local-key-plus-Roman agreement on DCML, below the 85% product target.

## Fresh twenty-passage benchmark

The frozen benchmark contained ten previously unused eight-measure Mozart passages from DCML and ten eight-measure pieces from the BACHI validation partition. Every model received the same analytical SKILL and music21 evidence, with no few-shots and no BACHI predictions. Accuracy is duration-weighted; corpora are reported separately because their repertoire and annotation conventions differ.

| Model and effort | DCML exact | DCML root | BACHI exact | BACHI root | Valid calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Astra medium | **60.6%** | **85.5%** | 38.0% | 66.7% | 20/20 |
| Sol high | 50.7% | 81.9% | 33.2% | 64.0% | 20/20 |
| GLM 5.2 high | 43.8% | 74.1% | 35.2% | 61.2% | 20/20 |
| DeepSeek V4.1 Flash high | 40.5% | 74.6% | 23.8% | 54.6% | 15/20 |
| Luna xhigh | 31.2% | 71.6% | 33.3% | 62.4% | 20/20 |
| Terra xhigh | 30.6% | 74.9% | 31.5% | 60.0% | 20/20 |
| Kimi K3 high | 27.9% | 68.0% | **39.6%** | 62.2% | 20/20 |

DeepSeek is a partial provider sample because five calls reached a 20-minute timeout. It is not eligible for headline ranking. Across all models, 135 of 140 calls produced scoreable output.

## What the ablations showed

An earlier six-passage development set compared score-only, SKILL, music21, BACHI, and static contrastive examples. These figures are useful for choosing experiments, not for generalization claims because the few-shot examples were derived from errors on the same set.

| Configuration | Exact key + Roman | Root | Boundary F1 |
| --- | ---: | ---: | ---: |
| music21 only | 9.9% | 49.9% | 45.0% |
| Terra medium + SKILL + music21 | 21.5% | 61.8% | 73.4% |
| Astra medium + score | 31.9% | 70.2% | 84.3% |
| Astra medium + SKILL + music21 | 42.8% | 81.5% | 77.4% |
| Astra medium + SKILL + BACHI | 35.0% | 77.6% | 86.0% |
| Astra medium + SKILL + BACHI + tuned few-shot | 44.0% | 74.5% | 84.8% |
| Astra medium + SKILL + music21 + tuned few-shot | 37.6% | 76.5% | 81.4% |

The extra BACHI dependency did not show a reliable advantage over the simpler music21 path. Static few-shots were non-monotonic and must be re-evaluated using examples retrieved from a separate development set.

## Error pattern

Root accuracy was consistently higher than exact local-key-plus-Roman accuracy. The main failures were:

1. tonicization versus modulation and local-key segmentation;
2. functional interpretation after the literal root was identified;
3. ornaments or suspensions treated as chord factors;
4. inversion and chromatic-spelling errors;
5. boundaries that followed every onset or merged genuine changes;
6. unstable altered-predominant and augmented-sixth vocabulary.

This is why the product integration returns pitches, bass, and fallible candidates instead of persisting music21 labels directly.

## Product posture and next evaluation

- Present analysis as an editable, evidence-linked draft.
- Preserve the written score and show uncertainty around local-key changes and non-chord tones.
- Keep the evaluated music21 version pinned and report the runtime version in every tool result.
- Evaluate a deterministic candidate lattice followed by constrained model ranking and local-key segmentation.
- Build the next benchmark from at least 100 stratified passages with a separate development split for few-shot retrieval.
- Gate automatic annotation on exact agreement, individual-passage coverage, provider reliability, and latency—not root accuracy alone.

