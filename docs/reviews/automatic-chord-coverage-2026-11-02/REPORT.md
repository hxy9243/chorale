# Automatic chord progression coverage patch

Date: 2026-11-02 (America/Vancouver)
Checkout: `/home/kevin/Workspace/chorale`, `main`, base `1b08982`.
Patch is local and uncommitted; unrelated working changes were preserved.
Status: **DONE** (coverage behavior verified; harmonic accuracy is not adjudicated).

## Symptom and root cause

The saved automatic analysis of **Real Music 2 — Chopin · Prelude in C minor, Op. 28 No. 20** (`score-b7d4137942e0457e`, revision 2) claimed chord coverage for all 13 measures while returning only 10 chord labels. Its diagnostic explicitly stated that it selected structurally clear sonorities and did not label every attack or aggregate.

The prompt did not require a complete harmonic progression. More critically, the coordinator marked every requested measure covered for each requested lens after any valid response, even an empty findings list. It did not check the completeness of chord findings. Replaying the saved response against the patched validator covers only m. 13.

## Change

- Request all written harmonic changes, including changes within measures, repeated passages and the final chord.
- Supply an exact list of distinct note onsets to review. Each onset needs a grounded chord label or an explicit continuation of the preceding chord in that measure. This permits ornaments, repeated attacks and arpeggios without extra labels.
- Validate continuation positions, reject duplicate/conflicting coverage, and derive chord coverage from actual accounted onsets. Missing onsets leave the measure incomplete and expose Continue.
- Bound chord windows by 32 distinct onsets and 16 measures, keeping individual measures intact. Preserve the existing request/token/time bounds.
- Replace a retried window's findings rather than accumulating duplicate labels. Reject over-cap results before changing their coverage.
- Persist/revalidate continuation data and invalidate earlier selective caches with the v2 analysis fingerprint.
- Reconcile tonal/phrase context even when density splits a score shorter than 16 measures; keep those findings provisional until reconciliation completes.
- Update the desktop smoke provider fixture to honor the new response format.

The completeness check establishes coverage of the submitted interpretation. It does not establish harmonic accuracy: a model can still misidentify a chord or treat a real change as a continuation. Published/human analysis, AI suggestions and accepted annotations remain separate.

## Regression evidence

The new selective-response regression failed before the coordinator fix: it expected partial coverage but received current. It passes after the patch.

Tests cover omitted changes within one bar, empty findings, a misleading measure-spanning chord, ornament/repeated-attack continuations, invalid/duplicate continuation offsets, partial retries without duplicate labels, dense 13-measure windows, short-score reconciliation, cache restart, legacy invalidation and persisted false coverage.

## Verification

- Full suite: 261/261 Node service tests; 1,092/1,092 Vitest tests across 118 files.
- Focused analysis/scheduling suite: 20/20 tests after the final source changes.
- TypeScript build: passed.
- Lint: 0 errors; 54 warnings outside this patch.
- Web and Electron builds: passed.
- Desktop analysis smoke: passed (synthetic provider responses; authenticated request path, overlays, display options, keeping annotations, edit refresh, pause/stop, reload and pickups).
- Whitespace/diff check: passed.

## Live Chopin check

A fresh request used the configured desktop analysis model with chords, cadences and modulation enabled, writing to a separate test cache. The initial headless harness exited after preserving m. 1-6; a harness with a window-close listener resumed from that cache. The chord result accounts for all 13 measures with 53 chord labels plus 8 explicitly continued onsets. The resumed combined job hit the existing 180-second deadline during final tonal reconciliation, correctly preserving the completed chord coverage. A further Continue finished reconciliation in 60.4 seconds, returned **current**, and retained exactly the same 53 chord labels. No result was copied into the user's managed score or normal analysis cache.

Evidence: `saved-response-replay.json`, `state-after-deadline.json`, and `live-result.json`.

This single run demonstrates the response/coverage behavior for the reported score; it is not a harmonic accuracy benchmark.
