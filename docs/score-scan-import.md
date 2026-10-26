# PDF / PNG import trial

This experimental Electron feature recognizes printed sheet music locally with
[Copisteria](https://github.com/kobimusic/copisteria) by default. Audiveris remains
available in the **Recognition engine** selector. Both produce preserved
MusicXML that Chorale converts into editable ABC. Always compare the preserved original
and check playback after importing; recognition and conversion can err.

## Install a scanner

Copisteria requires Python 3.12+, Git and Poppler (`pdftoppm`) on PATH. The setup
helper uses uv when installed, otherwise Python's venv/pip. Run from your
Chorale installation:

```sh
npm run setup:scanner
npm run dev:electron
```

Setup installs Copisteria 1.3.4 at tested revision
`bcf4e036fbb1721d525dc78144bc61f3c47db08a`, plus the 28M detector and 2M evidence
model. Both weight files are verified by SHA-256. Code and weights are
Apache-2.0. The separate installation defaults to
`~/.chorale/scanners/copisteria`, so it is shared across Chorale checkouts and
installed copies. Set `CHORALE_COPISTERIA_HOME` to use another installation;
set `CHORALE_SCANNER_PYTHON` to choose the setup Python executable. Neither
variable accepts command arguments. A worktree `.local/copisteria` installation
is also discovered. The installation manifest records revision, weight hashes,
Python and installed dependencies. Recognition never downloads models or uploads
scores. Run setup separately before scanning.

To install the optional Audiveris engine on Linux x64 / Ubuntu 24.04+:

```sh
npm run setup:scanner -- audiveris
```

This downloads and checksum-verifies Audiveris 5.11.0 and Tesseract's English
text data under the installation's ignored `.local/audiveris` folder. Its Java
runtime is included. Audiveris is an external AGPL-3.0 application. For other
operating systems, install an [official release](https://github.com/Audiveris/audiveris/releases)
and set `CHORALE_AUDIVERIS` to its executable if it is not discoverable on PATH
(or at the standard macOS application path). Do not include arguments.

The normal launcher shares the existing Chorale library. To try it with a
separate library and desktop profile:

```sh
npm run build
CHORALE_HOME="$PWD/.local/scan-demo-library" \
CHORALE_PORT=1696 \
CHORALE_DESKTOP_USER_DATA="$PWD/.local/scan-demo-profile" \
npm run start:electron
```

This launch uses the built interface, so it can run alongside another worktree's
development window without competing for its development port.

## Use

1. In the files sidebar, choose **Scan PDF / PNG**.
2. Keep **Copisteria (default)** or choose **Audiveris**, then select a PDF or PNG.
   All pages are selected by default, including covers, blank and uncertain pages.
   Expand **Page previews and selection** to uncheck pages, or enter original
   page numbers such as `2`, `2-4`, or `2,4-6`. Selecting more than five pages
   shows a red notice that recognition may take a while.
3. Choose **Import**. The setup dialog closes as soon as the original and job
   are saved. A new sidebar entry shows **Title (importing...)** with a subtle
   text animation; reduced-motion settings disable the animation.
4. Selecting that entry shows that the score is importing in the background.
   Continue working on other scores, or cancel this particular import.
5. A successfully converted and validated score becomes editable automatically.
   Completion keeps your current score selected if you moved elsewhere.
   Use playback and ABC editing to check and correct the recognized music.

Closing the setup dialog before submission creates no job. After submission,
closing the dialog or reloading the renderer does not cancel recognition.
Jobs are serialized in the native process. Renderer reload reattaches to the
queue; fully quitting Chorale interrupts running/queued jobs, which are marked
failed on restart. Recognized results are recoverable after restart. The native
job is acknowledged only after the editable document is saved to the shared
library. Stable job/document IDs prevent duplicate scores on renderer recovery.

Failed or cancelled entries remain selectable with an explanation, **Remove
entry**, and **Open source folder**. Removing an entry retains its artifacts.
Imports never replace existing scores. Recognition output is converted and
checked using the workspace notation renderer before any editable score is
created. Failed conversion retains the original and raw MusicXML without
installing malformed notation. Completed scores retain source provenance and
a reminder to check the music against the original.

## Limits

- Printed common Western notation; handwriting is outside this trial.
- One file/job, up to 60 selected pages, 20 MB/file, PNG <=40 megapixels.
- Page preview supports up to 60 PDF pages and has a one-minute limit. If it
  fails, enter page numbers manually. Pages labelled **Check page** remain selected for manual
  review; a broken image is never treated as proof of a non-music page.
- Staff screening is a heuristic. Rotated, faint or unconventional notation may
  need manual review; screening labels never omit pages automatically.
- One running job, up to ten queued/running imports. Copisteria: four CPU
  threads, an 8 GiB address-space cap on Linux and at least ten minutes per job.
  Audiveris: at least three minutes and a 1.5 GB Java heap. Both timeouts scale
  to three minutes per selected page for longer files.
- Source previews are the bounded page rasters used by Copisteria, or the
  binarized page images retained by Audiveris. Use
  **Open source folder** to see the unmodified original.
- No claim of accurate lyrics, chord symbols, Roman numerals, unusual tuplets,
  or exact engraving preservation. Voice assignment and ties need special care.
- The browser/plugin interface keeps ordinary MusicXML/ABC import; scanning
  currently requires the desktop app.

Artifacts are stored at `$CHORALE_HOME/imports/<job-id>/`, default
`~/.chorale/imports/<job-id>/`. Each folder contains the original `source.pdf`
or `source.png`, recognition project, generated MusicXML, log and manifest.
The imported ABC retains this folder in a source comment, including after
daemon persistence and reload. Job entries are separate from editable documents until conversion and validation succeed.

## Verification

```sh
npm test
npx tsc -b
npm run lint
npm run build
npm run build:electron
npm run smoke:scan
npm run smoke:scan-pages
npm run smoke:scan-background
```

The scan smoke uses both real engines with generated PDF/PNG fixtures and an
isolated desktop profile/library. It checks background import, musical
content, saved provenance and reload. It also reports a polyphonic chorale
comparison. Synthetic clean pages do not establish accuracy on real scans.

Playwright's Electron automation launcher disables Chromium's sandbox. The smoke
records the actual process arguments' sandbox state in its report. It does not
modify the normal desktop launcher or establish sandboxed-launch validation.

The page-screening smoke generates cover, prose, blank and music pages and
checks all-page defaults, then explicitly deselects the non-music pages and
checks that only the original music page reaches the selected engine. It also checks a
broken embedded image. Pass a local PDF folder to inspect it without importing
its scores: `npm run smoke:scan-pages -- /path/to/music`. PDF.js, its worker and
image decoders are bundled locally, including their licenses; there is no CDN
dependency. See [page-screening results](score-page-screening-results.md).

## Multipage recognition and validation

Copisteria retains per-page MusicXML, detected symbol readings, page previews,
and its diagnostic viewer under each job folder. The combined MusicXML keeps
page-boundary keys, clefs and timing units, with sequential measure numbers.
The manifest maps original page numbers to the combined measure ranges and
records the engine installation. Missing/empty pages and changes in part/staff
layout fail the job; no selected music page is silently omitted. Scan pages
separately when the layout genuinely changes. Neither engine is used as a
silent fallback for the other.

`npm run smoke:scan` compares both engines on a melody PDF/PNG, Bach BWV 371 and
BWV 269 excerpts, a simplified Für Elise melody and a Moonlight Sonata excerpt. Use
`CHORALE_SCAN_ENGINES=copisteria` (or `audiveris`) to exercise only one installed
engine. These are clean rendered fixtures, not a general accuracy benchmark.
A two-page melody checks page joining. To exercise an existing local scan, set
`CHORALE_SCAN_EXTERNAL_SOURCE` and `CHORALE_SCAN_EXTERNAL_PAGES` (for example `1`);
`CHORALE_SCAN_CASES=none` skips the generated recognition cases. External scans
are not assigned a reference accuracy score by this smoke.
The report separates recognition errors from subsequent ABC conversion errors,
and verifies background completion, persistence and cancellation.
Run `python3 test/score-scan-adapter.python.py` for the model-free page-joining
regressions. See `docs/score-scan-engine-results.md` for recorded trial results.


The controlled desktop smoke (`npm run smoke:scan-background`) checks
seven-page defaults and the red notice, immediate dialog dismissal, animated
entries, a selectable background stage, reduced motion, queued cancellation,
renderer reload, completion without changing the selected score, save-before-
acknowledgement, and failed-entry recovery. Its deliberately controlled engine
verifies the job/UI lifecycle; real recognition quality is covered separately
by the engine trials. Results and screenshots are kept under ignored
`.local/background-scan-review/`.
