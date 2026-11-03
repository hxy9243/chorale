# Prevent duplicate chat annotations

Date: 2026-11-02 (America/Vancouver).
Checkout: `/home/kevin/Workspace/chorale`, main, base `1b08982`, with the preceding automatic chord coverage patch. Status: **DONE**. This patch is local and uncommitted. Unrelated working changes and existing score files were preserved.

## Symptom and root cause

Repeated chat annotation requests could create new annotations at already annotated locations. The prompt included annotation details only for an active selection, omitted exact chord positions/IDs, and gave no explicit reuse rule. Proposal creation always generated new IDs. Proposal application and document append checked only ID collisions, so the same musical annotation with a new ID passed every check.

Automatic analysis was also absent from chat's context, and the score combined saved and automatic annotations without checking for overlap. Keeping an automatic annotation could therefore display two copies.

## Fix

One shared duplicate predicate is used by proposal generation, Apply All, document append, and automatic overlay projection:

- A chord onset has one annotation: exact written measure plus rational offset. Rewording or a different chord suggestion does not create a second annotation at that location. Existing content wins; corrections use explicit editing.
- Range annotations are duplicates when kind and exact measure span match and their normalized label or body matches. Normalization handles Unicode compatibility, case and whitespace. Distinct topics, kinds, spans and chord beats remain supported. This is a deterministic identity rule, not a general semantic paraphrase detector.

Proposal creation validates the full batch first, skips saved/automatic/intra-run duplicates, and returns the skipped count and existing IDs. Tool feedback explains that existing annotations were reused. Apply All checks the current annotations again, preserving the atomic validation contract and handling annotation-only changes that leave the music revision unchanged. Duplicate proposals reference the existing annotation after acceptance and do not append it. Accepted review records preserve user-authored references across reload; pending proposals still require assistant authorship. Duplicate-only additions create no new document history.

Chat now receives bounded annotation previews with IDs and chord positions even without a selection, and is instructed to inspect the complete target range before adding anything. The main process provides enabled, current automatic findings separately as read-only references. Those suggestions never enter the accepted annotation snapshot. Saved annotations take precedence in score presentation, so keeping or adding a saved chord hides its automatic copy.

## Regression evidence

Before the fix, four new regression cases failed: fresh-ID copies, repeated batch content, an occupied chord onset, and repeated tool proposals. The focused checks now pass. The first full interface run passed 1,104 of 1,105 tests and exposed one prompt-budget regression (1,590 estimated tokens versus the 1,500 ceiling). Shortening the reuse instruction restored the existing budget without relaxing its test; all 21 prompt-budget/runtime checks now pass. The full interface rerun on the final source passed all 1,105 tests. Additional checks cover distinct range topics and beats, late duplicates at Apply All, immutable/stale/hidden automatic references, provider prompt transport, single-copy score display, unchanged history and attribution-preserving reload.

The desktop smoke fixture now checks that a saved chord suppresses the automatic copy. Its first run also exposed a fixture hydration race: the analysis panel can be non-busy before a score exists. Waiting for the enabled chord control before checking restored preferences fixed that test synchronization; no production preference logic was changed.

## Verification

- Node service suite: 261 passed. The combined test command was terminated with status 143 after the Node summary, so the entire Vitest suite was launched separately.
- Focused proposal/store/analysis/runtime checks: 136 passed.
- Final provider/tool feedback checks: 12 passed.
- Final proposal persistence/schema/conversation/runtime checks: 36 passed.
- Complete Vitest suite on final source: 1,105 passed across 118 files. Combined with the Node suite, 1,366 tests passed.
- Typecheck, web build and Electron build: passed after the final source changes.
- Lint: no errors, 54 existing warnings.
- Desktop analysis smoke: passed using synthetic provider responses, including keeping annotations, duplicate overlay suppression, display controls, edit refresh, pause, stop, reload and pickups. This verifies application behavior, not model accuracy.
- Diff/whitespace check: passed.

## Limits and delivery

No existing saved annotations were deleted or rewritten. Historical saved duplicates are preserved. The deterministic range rule cannot identify every semantic paraphrase with completely different labels and bodies; context and prompting handle that broader case. New chat proposals, saved annotations and automatic display overlap use the shared rule.

Restart the app built from this checkout to load the patch. No provider-backed live musical inference was needed for this deterministic duplicate-prevention fix.
