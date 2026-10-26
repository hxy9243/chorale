# Background score import — 2026-10-24

Implemented in `/home/kevin/Workspace/chorale`. Copisteria remains the default;
Audiveris remains selectable.

All pages start selected, including covers, blank and uncertain pages. The setup
dialog shows a red time notice above five selected pages. Users can still expand
page previews and deselect pages. The supported limit is now 60 pages/import,
with the existing 20 MiB file limit.

Import persists a native background job and original bytes, adds an animated
`Title (importing...)` file-list entry, and closes the popup. Selecting the entry
shows the background-import stage. Other scores remain usable. Recognition is
serialized, cancellation targets one job, and renderer reload/crash recovery
keeps native jobs alive. Closing the native window or quitting interrupts pending
jobs; interrupted entries show a failure after restart.

Converted notation must have playable notes and pass the workspace renderer.
Completion creates a new editable score with the job ID and preserved provenance.
The job stays recoverable until the shared-library save succeeds. It cannot steal
focus from another score or interrupt a separately pending ordinary import.
Failed/cancelled entries retain source access and a Remove action.

## Verification

- 252 Node tests passed.
- Full UI/unit rerun: 999 tests in 113 files passed. Two additional document-store
  regression tests passed after the final background-creation adjustment.
- Scanner/background focused checks: 36 tests passed across the targeted suites.
- Python adapter: 8 tests passed.
- TypeScript, browser build and Electron build passed. Lint passed with existing
  repository warnings; no new background-import lint warnings.
- Controlled desktop lifecycle smoke passed, including seven-page defaults, red
  notice, immediate popup close, animated entry, selected stage, reduced motion,
  queue/cancellation, reload reattachment, focus preservation, stable document ID,
  save-before-acknowledgement, failure recovery and unobstructed zoom controls.
- Page-inspection desktop smoke passed: all five mixed PDF pages start selected;
  broken-image pages stay selected with a Check page label.
- Real Copisteria background import passed for known melody PDF and PNG. Each
  preserved 16/16 pitch/onset/duration events, with no extras and no subsequent
  MusicXML-to-ABC losses. Scan times: 69.5s PDF and 67.2s PNG. Persistence, reload,
  cancellation and preservation of existing scores passed.

An initial full run had an intermittent AudioPlayer stop-request assertion;
the isolated 42-test playback suite and the clean full rerun both passed. No
playback source was changed for this task.

Desktop automation disables Chromium's sandbox through Playwright's launcher;
these runs do not validate normal sandboxed startup. Controlled-engine fixtures
verify job/UI behavior, not OMR quality. Clean melody fixtures do not establish
accuracy on real scans; previous chorale/piano comparisons remain documented in
`docs/score-scan-engine-results.md`.

## Evidence

Machine-readable checks and source hashes:
[background-score-import-2026-10-24.json](../evidence/background-score-import-2026-10-24.json).

- Final desktop screenshots/results: `.local/background-scan-review/2026-10-24T21-31-40-582Z/`
- Real-engine score/source comparison: `.local/scan-trial/2026-10-24T21-27-28-459Z/`
- Page-inspection results: `.local/page-inspection/2026-10-24T21-27-28-691Z/`

Run `npm run smoke:scan-background` for the controlled lifecycle check. Use
`npm run smoke:scan` for installed-engine recognition trials.
