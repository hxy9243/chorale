---
title: "Automatic Score Analysis"
description: "Score analysis lenses, a default analysis model, and automatic refresh after edits"
category: "analysis"
date: 2026-10-27
updated: 2026-10-28
status: "implemented"
source_files:
  - src/components/FileRail.tsx
  - src/components/AISettingsModal.tsx
  - src/agent/useAIProviders.ts
  - src/agent/aiTypes.ts
  - electron/ai/connectionStore.ts
  - electron/ai/controller.ts
  - electron/ai/sheetAgentRuntime.ts
  - src/components/AnnotationOverlay.tsx
  - src/components/AnnotationRail.tsx
  - src/components/AnalysisPanel.tsx
  - src/components/DefaultAnalysisModel.tsx
  - src/analysis/types.ts
  - src/analysis/scoreAnalysis.ts
  - src/analysis/useScoreAnalysis.ts
  - electron/ai/scoreAnalysis.ts
  - electron/ipc.ts
  - electron/preload.ts
  - src/components/analysis.css
test_files:
  - src/agent/__tests__/scoreAnalysis.test.ts
  - src/analysis/__tests__/useScoreAnalysis.test.tsx
  - src/components/__tests__/AnalysisPanel.test.tsx
  - src/components/__tests__/FileRail.test.tsx
  - scripts/analysis-smoke.mjs
related_specs:
  - spec/agent-analysis-and-annotations.md
  - spec/settings-and-auth.md
  - spec/deterministic-analysis-core.md
  - spec/music21-python-tool.md
  - spec/workspace-layout.md
  - spec/recital-visual-language.md
---

# Automatic Score Analysis

Status: implemented in the desktop workspace. The user approved the design and confirmed the Analysis and History navigation changes on 2026-10-27.

Users enable analysis lenses in Analysis. Chorale analyzes the sheet with an explicitly configured default model, displays the results on the score, and keeps enabled analyses current after edits. The user confirmed automatic refresh after score edits on 2026-10-27.

## Existing foundation

- The imported Recital reference, `docs/design/recital/DESIGN.reference.md` §8.6, shows harmonic function, Roman numeral, non-chord tone and voice-leading switches. Its form summary is illustrative.
- The original `FileRail` Tools panel only exposed editing history. Analysis now owns the lenses, and History opens the existing timeline dialog from the rail.
- Settings already manages provider connections and their model catalogs. `AISelection` already identifies a connection/model pair; the connection store currently persists the selection used for chat.
- The current analysis flow uses immutable score snapshots, bounded score tools, reviewable annotation proposals, rational musical positions, and React overlays beside the abcjs SVG. Reuse those contracts.
- Whole-score automatic analysis is outside the delivered passage-analysis specification. This proposal adds that behavior explicitly; it is not a claim that the existing chat runtime already provides it.

## Recommended interaction

Analysis gains a **Sheet analysis** section. The former Tools tab is renamed **Analysis**. Editing history moves to its own **History** rail action, which opens the existing history dialog:

1. A compact **Default analysis model** notice shows the provider and model, with **Change** opening Settings → API providers at the relevant setting.
2. One status line shows setup, progress, coverage, completion or the next required action.
3. Switches choose the analyses visible on this sheet.
4. **Update after edits**, on by default once a sheet has an enabled lens, controls automatic refresh after subsequent edits.
5. **Refresh analysis** explicitly reruns enabled analyses; **Stop** appears during a run.
6. Collapsed **Display options** controls how existing results look. Display changes do not request a model.

Analysis switches stay disabled until per-sheet preferences have loaded, so early input cannot overwrite saved choices. Every new sheet starts with analysis lenses off. Opening a sheet never enrolls it in analysis without user action. A sheet with previously enabled lenses restores its preferences and reuses current cached results; if its musical content changed, enabled automatic refresh can resume while the sheet is open. Closing the sheet suspends its background work.

### Analysis lenses

| Switch | Score presentation | Shared analysis |
| --- | --- | --- |
| Chords | Chord symbols and optional Roman numerals at exact onsets | Harmony, including local key context |
| Modulation | Key-area spans and inspectable turning-point notes | Harmony with wider tonal context |
| Cadences & phrases | Phrase boundaries and cadence labels | Harmony and form/phrase profiles |
| Non-chord tones | Measure-attached findings with exact note evidence, resolution and explanation | Harmony plus voice context |
| Voice-leading | Positioned findings for requested factual checks | Existing deterministic checks, with model explanation only as needed |

Switching on requests missing or outdated analysis immediately, even when **Update after edits** is off. Switching off hides that layer and preserves reusable results. Showing a current cached layer is instant and makes no provider request. Switching several related lenses on together is coalesced into one planned job; each switch does not create its own independent chat.

Chord symbols, Roman numerals and harmonic function colors derive from the same harmony result. Turning those display options on and off does not reanalyze the score. Chord-label display options choose symbols, Roman numerals or both. Function colors tint these labels from the Roman numeral; they do not claim a unique functional interpretation. Voice colors are outside this change.

### Default model setting

Add **Default sheet analysis model** to Settings → API providers, adjacent to the existing connection management:

- Provider: one existing ready connection.
- Model: one available model from that connection's cached/refreshed catalog.
- Helper: “Used by the analysis switches in Analysis. Your chat model can be different.”
- Usage notice: “Enabled analyses send score content to this provider. Provider usage limits and charges may apply.”

Persist a separate `analysisSelection: AISelection | null` in the main-process settings store. It is explicit and independent of the current chat selection. Do not silently select the first connected model or change chat selection to execute a job. Saving a default does not itself run analysis.

Changing the default cancels work using the previous selection. Existing results retain their model provenance. Show **Previous model · Refresh to use [model]** until the next explicit refresh or score edit triggers a run with the new default. Removing the selected connection clears the default and pauses model-backed work; never silently substitute another model.

### Setup and failure states

| State | Analysis feedback and action |
| --- | --- |
| No default | “Choose a default analysis model” → **Set up**; preserve the requested lens and resume after successful setup |
| Ready | “[Provider] · [Model]”, visible before any lens sends a request |
| Waiting after edit | “Score changed · waiting to update…” |
| Running | “Analyzing · measures 1–16 of 64” and **Stop** |
| Current | “Up to date · 64 of 64 measures” |
| Partial | “Analyzed 32 of 64 measures” → **Continue**; never imply full coverage |
| Automatic refresh off | “Score changed · Refresh to update” |
| Invalid ABC | “Fix the score to resume analysis”; retain the last valid score view but remove automatic results that no longer match the current musical source |
| Authentication/model unavailable | Preserve intent and results; link to the specific provider setting |
| Rate limit/network/budget exhausted | Pause with a readable reason and **Retry** or **Continue**; no repeated background retry loop |
| Stopped | Preserve completed current portions and mark coverage; resume only on explicit action or a later edit when automatic refresh remains enabled |

Cached results can remain viewable when provider setup is unavailable. In browser/plugin clients, cached overlays and local display controls may be shown, but new provider-backed work requires the desktop runtime. Do not add browser credential storage or treat an external agent connection as permission for unattended provider calls.

## Score behavior and authorship

Automatic results are an owned analysis layer, separate from accepted annotations and ABC source. They are saved as reusable analysis data, not silently accepted into the document's annotation history. A run can replace only its own generated layer.

Clicking a result reveals its location, score evidence, interpretation, model and run provenance. **Keep as annotation** explicitly copies that finding into the existing annotation workflow at the current revision. It then survives automatic refresh under the normal annotation contract and retains provider/model attribution in its body. Pickup findings use their real written location, m. 0, in the automatic layer. Because the existing saved-annotation contract starts at m. 1, their explicit action is **Keep pickup note at m. 1**; this creates a commentary note beside the first full measure and preserves the original pickup reference and chord reading in its body. No automatic run changes notes, rhythms, existing annotations or chat history.

Reuse rational `MusicalPosition` and measure spans. Project chord labels and markers through the existing sibling-overlay geometry; never inject React elements into the abcjs SVG. Key-area and phrase summaries stay compact and expose their exact spans on inspection.

Computed facts and model interpretation remain distinct. For example, show “Possible modulation to D” when the evidence does not settle a key change. A key signature or a secondary dominant alone is insufficient proof of modulation. Do not invent numeric confidence percentages. Unsupported texture, missing voices and incomplete coverage receive diagnostics rather than “all clear.”

## Scheduling and data flow

1. The desktop analysis coordinator receives enabled lenses, an explicit analysis selection, and an immutable snapshot of the open sheet.
2. After a valid musical edit, hide automatic findings for the old musical revision, mark the layer outdated and wait approximately 1.5 seconds after the last edit. Layout, playback, selection and annotation-only changes do not schedule analysis.
3. Resolve reusable results by document identity, normalized musical-content fingerprint, analysis/schema version, model selection, relevant model settings and requested analysis coverage. Preserve document revision and snapshot identity on each run for publication guards. Undoing to identical musical content may reuse prior results after validating current anchors.
4. Plan one job for the enabled lenses using the existing authenticated provider runtime and a fixed structured-output prompt. Materialize immutable score facts and bounded ABC context before the request. The model receives no mutation tools. Voice-leading can include evidence from the existing sandboxed music21 core; no new public analysis tools are introduced.
5. Read musical facts in bounded windows, honoring the existing music21 call limits. Analyze all written measures requested for the sheet, not only the viewport. Carry wider tonal/phrase context across windows and reconcile boundaries. A modulation result remains provisional until the required wider context is covered.
6. Validate structured results, anchors, evidence references and coverage before publication. Reject unsupported note/measure references. Treat model output as untrusted data.
7. Publish only if the open document, musical fingerprint, run generation and selected analysis configuration still match. If any changes during a request, cancel where supported and discard late output. Cancellation may not undo provider usage already incurred.
8. Debounce subsequent edits and run only the newest pending snapshot. Use one coordinator for all renderer windows; claim jobs through shared run metadata so multiple windows cannot duplicate the same paid work.

Use bounded request/output/total-token limits and a per-job deadline, enforced by the coordinator. Initial limits are eight window requests per continuation, 8,192 completion tokens per request, 120,000 total tokens per job and a three-minute job deadline. These are safety bounds, not claims of optimal performance. On exhaustion, return explicit coverage and a user action to continue. Do not estimate a currency cost unless the provider exposes sufficient current usage/pricing information.

The coordinator has read-only access to score facts and can emit validated analysis results. It cannot invoke score mutations or auto-apply proposal tools. Reuse the agent runtime's immutable snapshot and cancellation facilities without inheriting unrestricted chat permissions or blocking an interactive chat turn.

Credentials remain encrypted in the Electron main process under the existing connection-store rules. Persist the model selection through the connection store, and preferences, public run provenance and bounded cached results through atomic main-process `score-analysis.v1.json` writes; renderer storage never contains secrets. Analysis-cache writes do not increment the musical document revision and cannot trigger an analysis loop.

Persist per-sheet lens choices and refresh preference separately from client-only display preferences. Purge a deleted sheet's cached analysis with that sheet's managed data. Exporting music does not implicitly include transient analysis; saved annotations follow the existing export contract.

## Alternatives considered

| Approach | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| Analyze once, then display switches | Smallest implementation using the current passage flow | Repeated manual work after edits; does not satisfy the confirmed automatic-refresh behavior | Useful implementation milestone, not the final experience |
| Automatic analysis layer with a separate default model | Direct switches, reusable results, current score analysis and preserved annotations | Requires scheduling, cache and a read-only result pipeline | Recommended |
| A hidden chat turn per switch | Reuses chat UI plumbing quickly | Duplicate requests, mixed provenance and coupling to chat state | Avoid |

## Acceptance and implementation order

1. Add and validate the independent default selection, including connection removal, unavailable models and persistence. Ensure changing it leaves the chat model unchanged.
2. Implement one-shot structured harmony analysis into a separate owned layer. Verify exact onset positioning, annotation preservation and no source mutation.
3. Add lens controls and the persistent model notice to Analysis. Cover missing setup, reuse of cache, hidden/visible results, pending setup intent, errors and cancellation.
4. Add automatic scheduling, musical-content invalidation, run-generation guards, deduplication across windows, bounded budgets and explicit partial coverage.
5. Add modulation/phrase context handling and other lenses using the same pipeline. Evaluate each claim class separately on cited real scores and deliberately ambiguous passages.

Required behavioral checks include rapid multi-switch activation, repeated edits, switching sheets/models during a request, invalid source, an old response arriving late, application restart, multiwindow deduplication, keeping an annotation across refresh, and turning every lens off during a run. Display-only changes must produce zero provider requests. A fixture or simulated provider proves flow behavior; a separate real-model evaluation is required before claiming musical accuracy.

## Validation and limits

Coordinator tests cover independent default persistence, exact evidence validation, missing-lens reuse, cancelled/late results, restart and undo reuse, continuation, context reconciliation, pickup findings and secret redaction. Hook tests cover coalesced edits, paused automatic refresh, setup resumption and non-musical edits. The provider integration test uses the actual authenticated completion path with a local fixture provider and no model mutation tools.

`scripts/analysis-smoke.mjs` exercises the desktop renderer, preload IPC, main-process coordinator and local HTTP provider fixture through setup, score overlays, keeping annotations, History, editing, pause, stop and reload. These fixtures verify application behavior, not real-model musical accuracy. The browser UI does not gain credential storage. Context/output limits and provider failures are explicit paused states; unusually dense passages may require a model with more context. Native smoke does not establish OS sandbox installation correctness.

The separate [Sol 6.1 High live pilot](../docs/reviews/automatic-analysis-sol61-high-2026-10-28/REPORT.md)
records 39 analysis jobs and per-lens evidence. It found 70.3% published-label
root-plus-quality agreement on completed real-music excerpts, strong simple
controlled note-role results, missing role-sensitive voice-leading coverage and
seven delivery failures. Its controlled modulation checks and cadence span
alignment do not establish general modulation/phrase accuracy. The experiment
explicitly adds high reasoning; the production runner still leaves reasoning
effort to the provider default.
