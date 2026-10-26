# Copisteria default scanner: integration and trials

Date: 2026-10-24, America/Vancouver. Working checkout: `/home/kevin/Workspace/chorale`.

Copisteria is now the default local PDF/PNG recognizer. Audiveris remains an
explicit choice in the scan dialog. Both engines require review before import;
there is no automatic fallback or automatic musical correction.

## What changed

- A bounded engine identifier crosses the existing desktop bridge; executable
  paths remain controlled by the main process.
- Copisteria uses a separately installed Python environment and verified model
  weights. Setup pins revision `bcf4e036fbb1721d525dc78144bc61f3c47db08a` (1.3.4).
- Selected pages are rasterized locally, recognized individually, then joined
  with their clefs, keys, divisions and note durations retained. Missing pages
  and changing part/staff layouts fail the job. The manifest maps original page
  numbers to joined measures and preserves engine/model provenance.
- Cancellation, output limits and review-before-import remain in place.
  Copisteria runs with four CPU threads, a ten-minute timeout and an 8 GiB
  address-space cap on Linux. Audiveris keeps its three-minute/1.5 GB Java limits.
- If recognition succeeds but ABC conversion fails, the dialog blocks import
  and retains **Open source folder** for the original and raw MusicXML.
- Scanner setup and the Python adapter are included in the distributable's
  existing `server/` inclusion. Models and Python environments stay separate.

## Musical results

These counts require matching written measure, sounding pitch, within-measure
onset and duration. Voices are pooled. Missing/changed and extra events remain
charged; no bar alignment is supplied by the evaluator. They are descriptive
fixture results, not percentages of an entire score accurately transcribed.

| Input | Copisteria matched / reference | Audiveris matched / reference |
|---|---:|---:|
| Bach BWV 371, first printed system, 4 voices | 75 / 77 | 76 / 77 |
| Bach BWV 269, pickup + four measures, 4 parts | 51 / 51 | 42 / 51 |
| Moonlight Sonata, first four measures, 2 staves | 40 / 60, with 1 extra event | Rejected: no time signature recognized |
| Simple melody PDF | 16 / 16 | See comparison-run caveat below |
| Simple melody PNG | 16 / 16 | See comparison-run caveat below |
| Simplified Für Elise melody sample | 9 / 9 | Not repeated in verified-setup comparison |
| Two-page melody | 32 / 32 | Not repeated in verified-setup comparison |

For every successfully imported fixture above, the subsequent recognized
MusicXML → ABC → MusicXML check preserved every recognized pitch/onset/duration
event. This does not certify voice assignment, ties, spelling or engraving.
Copisteria still loses events on BWV 371 and materially corrupts Moonlight's
triplet passage. Keeping Audiveris selectable is useful; neither engine wins
all cases.

The first cross-engine run used an older Audiveris installation with incompatible
text OCR data. It completed its melody PDF case but stopped on the PNG case.
That run is excluded from the Audiveris comparison table. The recorded chorale
and Moonlight results instead use the separately verified 5.11.0 installation
and legacy-compatible English OCR data from the setup helper, with no OCR warnings
on the successfully recognized chorales.

The source fixtures are clean abcjs renders. BWV 269 comes from the music21
corpus; the other sources are existing repository samples. The piano XML
excerpts are first converted to ABC for rendering, and the exact rendered ABC
is the recognition reference. That earlier conversion step is not scored here.
See [fixture provenance](../test/fixtures/score-scan/README.md).

## Historical Debussy scan

The real `IMSLP02821-Debussy-L066.pdf`, page 1, yielded 229 pitched MusicXML notes
in 16 measures. The existing converter generated malformed ABC containing
invalid chord/tie syntax, and review correctly refused import. The original
PDF and raw MusicXML remain preserved. This is a conversion compatibility
failure after recognition, not evidence that the scan is musically correct.
No reference accuracy score is assigned to this page in the integration smoke.

This is a remaining limit of Chorale's immediate MusicXML-to-ABC workflow.
Changing the recognizer does not remove it; the UI must retain a usable error
state and a path to retrieve the preserved MusicXML.

## Evidence

[Machine-readable results](evidence/score-scan-engines-2026-10-24.json) include
source hashes, event counts, conversion checks and job identifiers.

Raw sources, recognized MusicXML, logs, page previews, imported ABC and screenshots
remain under these ignored local directories:

- `.local/scan-trial/2026-10-24T20-32-13-662Z/`: Copisteria fixture cases; the initial Audiveris setup is excluded as described above.
- `.local/scan-trial/2026-10-24T20-46-14-403Z/`: verified Audiveris chorale/piano comparison and passing desktop smoke report.
- `.local/scan-trial/2026-10-24T20-37-44-864Z/`: passing two-page Copisteria import, persistence/reload and cancellation smoke.
- `.local/scan-trial/2026-10-24T20-52-08-634Z/`: passing real Debussy conversion-rejection, raw-source access, unchanged-library and retry/cancellation smoke.
- `.local/page-inspection/2026-10-24T20-35-18-527Z/`: passing cover/prose/blank/music selection and broken-image handling. Only original page 4 reached recognition.

Both engine installations were exercised on Linux. The desktop automation
launcher uses `--no-sandbox`; this is not a sandbox-enabled desktop validation.
Elapsed times include other active work and are not controlled speed measurements.

## Final verification

- Full `npm test -- --maxWorkers=1`: 252 service/Node tests + 990 UI/unit tests,
  all passing, zero skips (110 UI/unit test files).
- Model-free Python adapter regressions: 8 passed.
- Dedicated scanner boundary and UI checks: 28 passed during implementation.
- TypeScript, lint (warnings in other files), browser/Electron builds and package
  inclusion checks passed. Raw verification logs are retained under
  `.local/scanner-verification/2026-10-24/`; final source hashes are in the
  machine-readable evidence file.
- The initial concurrent full run had one playback-readiness timing failure.
  It passed on isolated recheck; the final one-worker full suite also passed.

No commit, push, PR or deployment was performed for this request. Other work in
this shared checkout was preserved. The implementation remains experimental:
passing software checks does not certify arbitrary music transcription.
