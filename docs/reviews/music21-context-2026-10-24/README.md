# Does sandboxed music21 help a short-score conversation?

Measured 2026-10-24 in the Electron restoration worktree. **It helped recover literal harmonic facts in two of three live examples, but did not make the analysis uniformly reliable.** The simplest example was already correct. More evidence did not prevent invented voice-leading explanations, and one applied dominant still lost its seventh.

## Context added to a session

The sandbox does not load the music21 source code or its documentation into the model context. The Python snippet, its call arguments, and the returned text enter the conversation. Internal note/event arrays stay inside the tool unless the snippet returns or prints them.

These are measured text counts using tiktoken `o200k_base`, a declared reference encoding, **not GLM's tokenizer or a provider's complete tool-message framing**. The query returns each vertical sonority's measure, offset, pitches, bass, root, quality and inversion, plus each part's range. Results include the real tool's revision, engine, sandbox metadata and warning. Every fixture has four voices. The density comparison preserves the same progression, replacing whole notes with four quarter-note rearticulations per bar.

| Measures | Calls | One attack per bar: call + result | Quarter-note attacks: call + result | Raw event dump alone, quarter notes |
|---:|---:|---:|---:|---:|
| 4 | 1 | 595 | 1,098 | 3,978 |
| 8 | 1 | 764 | 1,774 | 7,950 |
| 12 | 1 | 932 | 2,447 | 11,918 |
| 16 | 1 | 1,100 | 3,119 | 15,886 |
| 20 | 2 | 1,695 | 4,218 | 19,864 |

Add **159 reference tokens for the music21 tool definition** in a request that exposes it. Python plus arguments costs 197 reference tokens per call in this query. Existing score/profile reads and general conversation history are excluded: those are baseline costs. Tool-role framing and any added system instructions are also excluded. Raw event dumps are an alternative output design, not another payload automatically added to the compact result.

The 20-bar examples use measures 1–16 and 17–20 because the current tool limit is 16 measures. Computations needing continuity across that boundary must explicitly include surrounding context. These examples are small homophonic fixtures, not an upper bound for dense counterpoint, ornaments, or verbose analysis. A query returning only a few requested facts can be much smaller.

This is added conversation text, not a one-time setup cost: retained tool messages consume context and are sent in later requests until omitted or compacted. Repeated analyses can therefore accumulate. Output selection matters more than simply installing the library.

See [all measured counts](context-metrics.json), [whole-note inputs and real tool outputs](context-payloads.json), and [quarter-note inputs and outputs](density-payloads.json).

## Live before/after comparison

Six genuine OpenRouter calls used the user's selected **z-ai/glm-5.3** model, temperature 0, low reasoning effort, the same 400-word instruction and a 4,500-token output cap. All responses reported Relace as the provider and finished normally. All three notation-only answers were saved before any music21 evidence was computed. Each assisted answer was a fresh independent request with the identical base messages/settings plus one additional message containing real sandbox results. The baseline answer was not supplied to the assisted request. No fake provider was used.

This isolates **supplied evidence**, not whether the Electron agent independently chooses the right query. Both arms receive ABC, rather than all existing Electron score-read tools, so it is not a measurement of the incremental benefit over the complete current app. Calls are one sample per arm, not a repeated benchmark. The fixed query and fixtures are author-generated; expected facts are reviewable and have not been independently labeled by a music theorist.

| Passage | Before: notation only | After: notation + music21 | Assessment |
|---|---|---|---|
| 4-bar cadence | Correct I–IV–V–I in G, correct root positions and PAC condition. | Same core answer; invents an ascending inner-voice line and claims F♯ resolves to G in the same voice. In the actual alto it moves F♯4→D4. | No gain on the requested core facts; extra explanatory errors. |
| 8-bar suspension | Shifts the m5/m6 harmonies, denies the 4–3 suspension, and even calls A minor “ii” in C. | Correctly identifies prepared C5 tied into m5, resolving to B4 over G; correctly names m5 G, m6 Am and m7 G7. | Clear improvement on the central question. Still contains loose functional wording. |
| 20-bar sketch | Omits D5 from m5 E7, misreads m7 as an open G sonority, invents an ambiguous m16. Correct m3 inversion and m11 G7. | Correct m7 Dm/F, m16 Am and surrounding pitch sets. Still calls m5 E major/V/vi instead of E7/V7/vi, incorrectly treats `quality: major` as a bad tool prediction, and calls an Am ending “half-cadential.” | Better pitch/inversion grounding; seventh/function and formal interpretation remain unreliable. |

Example from the suspension comparison: before, the model says the tie is “not a true dissonant suspension”; after, it correctly explains C5→B4 as a 4–3 suspension over G. This is a meaningful change for a student deciding what to preserve when revising.

| Measures | Provider input tokens before → after | Added input tokens | Model latency before → after |
|---:|---:|---:|---:|
| 4 | 231 → 658 | 427 | 7.7 s → 7.6 s |
| 8 | 290 → 950 | 660 | 17.4 s → 9.0 s |
| 20 | 464 → 1,772 | 1,308 | 19.5 s → 9.1 s |

These are the provider's reported token counts, distinct from the reference-token table. This live experiment supplied evidence as an extra user message; it did not include generated Python, a tool definition, or an additional agent tool-selection turn. It therefore costs less input than an actual full tool round trip. Shorter assisted completions reduced reasoning/output tokens here; six samples do not establish a speed or cost advantage. Python sandbox times for the sparse context samples totaled 1.4–3.6 seconds per passage, excluding runtime discovery and host probing. End-to-end interactive tool use adds those steps and an additional model turn.

The six calls cost **$0.0314017 total**, as reported by OpenRouter. This is a bill for this run, not a pricing forecast. Full request bodies, response content, reasoning fields, usage and timings are saved locally; authorization headers and credentials are excluded.

- 4 bars: [score and planned checks](cases.json), [before](04-cadence-before.md), [after](04-cadence-after.md), [evidence](04-cadence-evidence.json).
- 8 bars: [before](08-suspension-before.md), [after](08-suspension-after.md), [evidence](08-suspension-evidence.json).
- 20 bars: [before](20-secondary-before.md), [after](20-secondary-after.md), [evidence](20-secondary-evidence.json).
- The adjacent `*-request.json` and `*-response.json` files contain the complete live calls. [Run manifest](run-manifest.json) hashes the original run artifacts; [review audit](review-audit.json) records checks and limitations.

## Two concrete findings in the evidence layer

1. **A cross-bar held note is absent from a later chordification slice.** The authoritative event for C5 starts in m4 and lasts five beats; it is present in the internal events. The constructed music21 Note extends beyond its Measure. In this query, `score.chordify()` reports m5 beat 1 as G2–G3–D4, omitting the still-sounding C5. The assisted answer recovered the correct suspension from the ABC despite incomplete evidence. A future fix should preserve merged authoritative events while constructing measure-contained tied segments for music21, with a regression check at the suspension's dissonant beat. This review leaves product behavior unchanged and records the defect; it must not be described as a verified correct suspension detector.
2. **`Chord.quality` is not a complete chord-type label.** The returned `major` for E–G♯–B–D or G–B–D–F does not mean “major triad.” The query should also expose a complete chord name and seventh membership, such as the documented [Chord.commonName](https://music21.org/music21docs/moduleReference/moduleChord.html#music21.chord.Chord.commonName). The 20-bar assisted answer falsely criticizes the tool's G7 quality and still fails to call E7 a seventh chord. Simply adding a root/quality table is insufficient.

I would keep music21 available for specific checks of pitches, basses, intervals, spans, and voice motion. For basic revision chat, request compact evidence for the question at hand, include voice identity when discussing motion, and check the written score before teaching an interpretation. This pilot supports that targeted use; it does not justify requiring the tool for every question or treating its guesses as authoritative.

The older ABC-guide experiment in `chorale_lab/experiments/abc-syntax-ablation/conclusions.md` already supplied music21 pitches in both arms. It is a different experiment and cannot establish the benefit of adding music21; its scores are not pooled with this pilot.

## Reproduction and validation

The live harness reads the selected existing OpenRouter connection through Electron safeStorage in its main process, uses a temporary Electron profile, and does not alter connection settings or accepted scores. It intentionally makes six bounded provider calls. Review the harness before rerunning because rerunning incurs provider usage and replaces this output directory.

- `scripts/music21-context-review.cjs`: frozen cases, baseline-first protocol, live calls, actual sandbox results, original manifest.
- `scripts/music21-context-density.mjs`: additional density measurements; no provider calls.
- `scripts/music21-context-count.py`: reference token counts and aggregation; tiktoken was installed into a temporary directory, not added to Chorale dependencies.

Experiment artifacts and reproducible scripts are the only repository additions. No product code, skill instructions, client configurations or user scores were changed.

Validation: all six live calls completed, paired base inputs/settings and original artifact hashes passed audit, 237 service tests passed, and type checking and lint passed (existing lint warnings remain). The full UI suite had 891 passing tests and one playback test failure; rerunning that unchanged playback test file passed all 38 tests. The first full suite was therefore not entirely green. These logs are in `.agents/artifacts/music21-context/`.

Method references: [OpenRouter request and response API](https://openrouter.ai/docs/api_reference/overview), [tiktoken reference encoding](https://github.com/openai/tiktoken), [Langfuse experiment dataset guidance](https://langfuse.com/docs/evaluation/experiments/datasets). Traces remain local; no Langfuse dataset or cloud telemetry was created.
