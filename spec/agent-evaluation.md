---
description: "Small deterministic agent-grounding release gate for Chorale v0.0.1"
source_files:
  - server/mcp/tools/file-management.mjs
  - server/mcp/tools/sheet-management.mjs
  - server/utils/measure-ops.mjs
  - scripts/core-analysis-pilot.cjs
  - scripts/core-analysis-report.mjs
test_files:
  - test/agent-eval.node.mjs
  - test/eval/corpus.json
related_specs:
  - spec/deterministic-analysis-core.md
  - spec/agent-analysis-and-annotations.md
---

# Agent evaluation

## v0.0.1 release gate

The v0.0.1 gate is a small deterministic contract evaluation. Each checked-in case creates a score through the current MCP file handler, reads the question's bounded passage through the current `read_measure` handler, and checks that:

- the returned range and voice match the requested evidence;
- expected notation is present and out-of-range or out-of-voice notation is absent;
- a reference answer includes the required measure citation and facts grounded in that tool result;
- unsupported questions use an explicit limitation instead of an invented score fact.

The harness also runs deliberately bad answer probes so a missing citation or an ungrounded claim is proven to fail the scorer. The corpus is intentionally small and deterministic so it runs with `npm test`, without credentials, network access, or a paid model.

## What this does not measure

Passing this gate does not establish LLM answer quality, prompt reliability, harmonic-analysis accuracy, or a 90% success rate. Those require live model runs across a larger, versioned multi-score corpus, repeated samples, human-reviewed rubrics, recorded model and prompt versions, and baseline reporting. That measured evaluation belongs to the v0.0.2 follow-up.

## Corpus contract

Every case records the user question, complete ABC input, bounded MCP read arguments, expected evidence, and a reference answer contract. `requiredEvidence` and `excludedEvidence` test the score tool output. `groundedClaims` pair an answer phrase with its literal support in the returned ABC. `requiredAnswerPhrases`, `citations`, and `forbiddenAnswerPhrases` cover citation and unsupported-answer behavior.

New cases must remain deterministic. Adding a live model runner must use a separate command and report results separately from this release gate.

## Deterministic core supplied-evidence pilot

The separate [core analysis spec](deterministic-analysis-core.md) defines the
P0 checker contract, analysis roadmap, implementation sequence and evaluation
protocol. Its live paired evaluation uses the same model and base prompt before
and after adding actual helper evidence; it does not replace the offline release
gate above or measure autonomous tool selection.

The first six-pair [report and raw outputs](../docs/reviews/deterministic-analysis-core-2026-10-25/README.md)
show better reconstruction of selected located findings alongside false-warning
and broader prose regressions. Preserve the distinction between engine
correctness, source-grounded explanation, and musical judgment. The authored
references remain provisional until independent review.

Recompute artifact-level pairing, usage and selected-claim scores with
`node scripts/core-analysis-report.mjs`. Running
`scripts/core-analysis-pilot.cjs` through Electron makes live calls using the
selected encrypted desktop connection; it is an explicit experiment, never part
of credential-free `npm test`.
