---
description: "Small deterministic agent-grounding release gate for Chorale v0.0.1"
source_files:
  - server/mcp/tools/file-management.mjs
  - server/mcp/tools/sheet-management.mjs
  - server/utils/measure-ops.mjs
test_files:
  - test/agent-eval.node.mjs
  - test/eval/corpus.json
related_specs:
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
