# PDF / PNG import trial

This experimental Electron feature recognizes printed sheet music locally with
[Audiveris](https://github.com/Audiveris/audiveris), then converts its MusicXML
through Chorale's existing converter. Recognition is imperfect; always compare
the preview and check playback after importing.

## Start this worktree

On Linux x64 / Ubuntu 24.04 or later:

```sh
npm ci
npm run setup:scanner
npm run dev:electron
```

The optional setup command downloads the official Audiveris 5.11.0 package,
verifies its published SHA-256, and extracts it under ignored `.local/` without
installing system packages. The package includes a Java runtime. Audiveris is an
external AGPL-3.0 application, not part of the Chorale distributable. Setup also
downloads and verifies Tesseract's Apache-2.0 English text-recognition data under
the same local folder, so titles can be read. Recognition runs locally; score
images are never sent to a recognition service.

For other operating systems, install an [official Audiveris release](https://github.com/Audiveris/audiveris/releases).
If it is not discoverable on PATH (or at the standard macOS application path),
set `CHORALE_AUDIVERIS` to the absolute executable path before launching Chorale.
Do not put command arguments in that variable.

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
2. Select a PDF or PNG. Chorale previews the pages locally and selects the first
   five pages with detected staves. Covers, text and blank pages normally stay
   unchecked. Review the thumbnails and check/uncheck pages, or enter original
   page numbers such as `2`, `2-4`, or `2,4-6`.
3. Choose **Scan selected pages** and compare the two previews.
4. Choose **Import recognized score** to create a new editable document.
5. Use existing playback and ABC editing to check and correct the music.

Closing the dialog cancels the job without creating a score. It never replaces
an existing document. Originals and scan artifacts remain for inspection even
if a scan fails or is cancelled; delete unwanted job folders manually.

Scan review uses the same prepared notation renderer as the workspace. This
handles invisible rests at the start of triplets without changing the saved
source or its timing. Unsupported notation produces a local display error;
acceptance stays unavailable until preview succeeds. In the workspace, failed
notation clears playback and leaves the source editor and file controls usable.

## Limits

- Printed common Western notation; handwriting is outside this trial.
- One file/job, up to five selected pages, 20 MB/file, PNG <=40 megapixels.
- Page preview supports up to 60 PDF pages and has a one-minute limit. If it
  fails, enter page numbers manually. Pages labelled **Check page** need manual
  selection; a broken image is never treated as proof of a non-music page.
- Staff screening is a heuristic. Rotated, faint or unconventional notation may
  need manual inclusion. More than five music pages require another scan job.
- Three-minute recognition timeout, one running job, Java heap capped at 1.5 GB.
- Scanned previews are the binarized page images retained by Audiveris. Use
  **Open source folder** to see the unmodified original.
- No claim of accurate lyrics, chord symbols, Roman numerals, unusual tuplets,
  or exact engraving preservation. Voice assignment and ties need special care.
- The browser/plugin interface keeps ordinary MusicXML/ABC import; scanning
  currently requires the desktop app.

Artifacts are stored at `$CHORALE_HOME/imports/<job-id>/`, default
`~/.chorale/imports/<job-id>/`. Each folder contains the original `source.pdf`
or `source.png`, recognition project, generated MusicXML, log and manifest.
The imported ABC retains this folder in a source comment, including after
daemon persistence and reload. Scan jobs are not score revisions until accepted.

## Verification

```sh
npm test
npx tsc -b
npm run lint
npm run build
npm run build:electron
npm run smoke:scan
npm run smoke:scan-pages
```

The scan smoke uses real Audiveris with generated PDF/PNG fixtures and an
isolated desktop profile/library. It checks review-before-import, musical
content, saved provenance and reload. It also reports a polyphonic chorale
comparison. Synthetic clean pages do not establish accuracy on real scans.

Playwright's Electron automation launcher disables Chromium's sandbox. The smoke
records the actual process arguments' sandbox state in its report. It does not
modify the normal desktop launcher or establish sandboxed-launch validation.

The page-screening smoke generates cover, prose, blank and music pages and
checks that only the original music page reaches Audiveris. It also checks a
broken embedded image. Pass a local PDF folder to inspect it without importing
its scores: `npm run smoke:scan-pages -- /path/to/music`. PDF.js, its worker and
image decoders are bundled locally, including their licenses; there is no CDN
dependency. See [page-screening results](score-page-screening-results.md).
