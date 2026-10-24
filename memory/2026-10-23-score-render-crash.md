# DEBUG REPORT — score render failure containment

- **Symptom:** The Debussy import/reference failed to display; the user asked
  that a music sheet never crash Chorale. The reproduced failure is an abcjs
  engraving exception, rather than evidence of a native Electron process fault.
- **Root cause:** abcjs 6.6.4 constructs `TripletElem` with an undefined anchor
  when the first tuplet event is an invisible rest. It dereferences
  `anchor1.parent.durationClass`. The raw minimal reproduction is
  `X:1\nM:4/4\nL:1/8\nK:E\n(3xAB c6 |]`.
  The inherited workspace `renderPlaybackScore` already prepares a temporary
  rest anchor and hides the glyph without changing saved source. Scan review
  used raw `abcjs.renderAbc` in both validation and preview, bypassing it.
  Unexpected React score errors also had only a whole-app boundary.
- **Fix:**
  - `src/components/ScoreScanModal.tsx`: use shared prepared rendering for both
    validation and preview, reject empty render output, clear partial preview
    on failure and ignore obsolete queued errors.
  - `src/utils/abcAudio.ts`: remove partial output on engraving/audio-timing
    exceptions; reject more than 10,000 expanded rest bars before allocating
    repeated source. No dependency or stored-score rewrite.
  - `src/components/SheetMusicView.tsx`: accessible local error with retained
    source, technical details on demand, and no stale annotation overlay.
    The existing catch clears the tune, measure systems and SVG.
  - `src/components/ErrorBoundary.tsx` and `src/App.tsx`: local score boundary
    clears shared playback, keeps files/editor/settings available, supports
    retry and resets automatically when source/document changes.
- **Regression evidence:** Before the patch, five added regression cases failed
  in five files (98 existing cases passed in the selected run). The tests cover
  actual invisible-rest triplet engraving in scan review with byte-preserved
  accepted source; validation/preview errors and retry; unexpected React failure
  with editing recovery; partial SVG/playback cleanup; boundary document change;
  excessive rest expansion; failure during timing after successful engraving.
  Eight regression cases were added overall.
- **Desktop evidence:** `.local/score-crash-smoke-TXE9Ib/result.json` records a
  production-build Electron run with an isolated daemon/library/profile:
  - `(3xAB` renders with a hidden rest and unchanged source.
  - `(3!p!xAB` reproduces a real renderer exception which stays inside the score
    pane. Partial SVG disappears, Play is disabled, settings/editor remain
    usable, and changing to valid source recovers without reload.
  - Full 107-measure external reference ABC renders 1,422 note groups.
  - Actual local Debussy PDF page screening plus a fixture recognition response
    using the external 16-measure MusicXML exercises real conversion, scan
    preview, acceptance and daemon persistence. Invisible rests remain in the
    stored source. The imported score renders after reload.
  - No uncaught page errors. Screenshots were inspected. The Playwright launcher
    disables Electron sandboxing; this run does not validate normal-launch
    sandbox behavior. Recognition was stubbed; OMR accuracy is not being tested.
  - Earlier smoke attempts stopped on a test assertion waiting for a status
    label which is intentionally hidden by the current theme. The corrected
    check inspects the disabled Play control. No product change was needed.
- **Repository verification:** 227 service tests passed. First complete unit
  run: 918/919 passed; an existing AudioPlayer initial-seek test failed at
  readiness. Its isolated rerun passed all 38 tests. Complete unit recheck is
  recorded in `.local/score-crash-unit-recheck.log`. TypeScript and both browser
  and Electron production builds passed. Lint passed with inherited warnings.
  Final complete unit recheck: **101 files / 919 tests passed**, including all
  eight new regressions and all playback tests. Combined with the 227 passing
  service tests: **1,146 tests passed**. Fresh final `npx tsc -b`, lint and
  `git diff --check` also passed. No playback code was changed for the flake.
- **Related:** [OMR alternatives investigation](2026-10-23-omr-alternatives.md),
  [comparison](../docs/score-scan-alternatives.md),
  [score surface contract](../spec/score-surface.md).
- **Limits:** This patch fixes the known preview bypass and contains thrown
  score errors. It does not certify recognition accuracy, complete MusicXML
  fidelity, or recovery from arbitrary dependency hangs/OS process termination.
  Original source PDFs, user library and restore-electron-chat worktree were
  not modified. All production changes remain local and uncommitted in
  `feat/pdf-score-import-mvp`.
- **Status:** DONE. The known preview crash is fixed and score failure recovery
  is verified. The fidelity and process-termination limits above remain explicit.
