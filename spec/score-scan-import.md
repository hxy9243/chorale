---
title: PDF and PNG score import MVP
status: experimental
source_files:
  - electron/scoreScan.ts
  - electron/scanIpc.ts
  - electron/preload.ts
  - src/types/scoreScan.ts
  - src/components/ScoreScanModal.tsx
  - src/components/FileRail.tsx
  - src/App.tsx
  - src/styles/score-scan.css
  - src/utils/xmlParser.ts
  - src/utils/abcAudio.ts
  - src/utils/scorePageInspection.ts
  - src/utils/staffDetection.ts
  - vite.config.ts
  - scripts/setup-score-scanner.mjs
test_files:
  - src/agent/__tests__/scoreScan.test.ts
  - src/components/__tests__/ScoreScanModal.test.tsx
  - scripts/scan-import-smoke.mjs
  - src/utils/__tests__/staffDetection.test.ts
  - scripts/scan-pages-smoke.mjs
related_specs:
  - spec/desktop-chat-restoration.md
  - spec/file-workspace-architecture.md
  - spec/score-surface.md
---

# PDF and PNG score import MVP

## Scope and ownership

Electron-only, local recognition of printed common Western notation. Use an
installed Audiveris executable; never upload user scores or provision a model.
The browser/plugin continues to import ABC/MusicXML normally. Scan entry appears
only when the desktop scan bridge is available.

File -> bounded IPC -> Audiveris -> preserved MusicXML -> review -> existing
ABC document creation -> authoritative shared daemon storage.

## User flow

1. Choose **Scan PDF / PNG** and select one file. Before recognition, locally
   render all PDF pages (up to 60) and inspect them for five-line staves. Show
   numbered thumbnails and editable checkboxes. Automatically select the first
   five pages with staves; leave apparent covers, text and blank pages unchecked.
   Explain when more music pages remain beyond the five-page trial limit.
   PNG follows the same inspection and can be manually included.
2. Show local engine availability and actionable setup instructions if missing.
3. Scan at most five selected pages per job. PNG always uses its only page.
4. Preview the recognized notation alongside the scanned page image(s). These
   images are Audiveris's binarized source pages; the original is also preserved.
5. Explain that accidentals, rhythm and voice assignments need review. Show
   recognition/conversion warnings without claiming numerical confidence.
6. Only **Import recognized score** creates a document. Cancel/close must never
   replace an existing score or import a result from a stale request.
7. The imported ABC contains a source-provenance comment with the retained job
   folder, enabling access to the original, recognition project and MusicXML.

### Page screening

Use bundled PDF.js with a local worker and no document/network uploads.
Bundle the image decoders and their licenses locally for scanned PDFs; do not
rely on a CDN or assume image-decoder failure means a blank/non-music page.
Render one page at a time at bounded resolution. Reject encrypted, malformed or overly
long PDFs with an actionable message. Release workers/canvases on completion,
file replacement and modal close; ignore stale asynchronous results.

Staff detection is a visual heuristic, not recognition confidence. A page with
no detected staves is labelled accordingly and can always be included manually.
A page that fails inspection is labelled "Check page" and requires manual
selection; never silently classify inspection errors as non-music. Permit
manual numeric page selection if PDF inspection fails entirely. Keep original
PDF page numbers throughout selection, native recognition and source preview.
Show selected and omitted pages before scanning and during recognition review.
Only selected pages are sent to Audiveris. A recognition failure is an error,
never a reason to silently skip a music page. Preserve the complete original
file, including omitted pages. This heuristic targets horizontal five-line
printed notation; rotated/faint/unconventional notation may need manual choice.

## Native process boundary

- Validate sender identity/origin as with other desktop IPC.
- Accept file name, binary contents and bounded page selection, never executable
  paths or shell fragments from the renderer. PDF <=20 MiB; PNG <=20 MiB and
  <=40 megapixels. Check signatures and reject invalid or empty uploads.
- Discover executable via CHORALE_AUDIVERIS, a worktree-local runtime, or PATH.
- Execute with an argument array (no shell), bounded memory, output and time.
  Allow one job at a time. Cancel kills the process and ignores late results.
- Jobs live in CHORALE_HOME/imports/<UUID> (default ~/.chorale/imports). Preserve
  original bytes, .omr, MusicXML, logs and a manifest, including on failure.
- ZIP extraction is in memory with file-size/dimension limits, no path writes.
- No file is persisted as an editable score until explicit acceptance.

## Review limits and validation

OMR success is not musical correctness. Reject empty/invalid MusicXML or output
with no pitched events. Conversion into ABC is a second possible source of
error. Preserve the MusicXML separately and inspect converter/render warnings.
Validate and preview with the workspace's shared prepared engraving path,
including invisible-rest tuplet anchors. Never persist the prepared substitute
ABC. A rendering exception clears partial preview, leaves acceptance disabled,
and permits retry, another file or cancellation without affecting the workspace.
Also reject an export when Audiveris reports a measure-export exception even
if the process exits zero, or when no explicit time signature was recognized.
These cases produce partial or unmetered candidates, not usable scan results.
Keep the original and generated files for diagnosis, but do not offer them as
successful imports. Unmetered music is outside this trial's supported scope.
Preview playback and corrections use Chorale's existing workspace after import;
the MVP review itself provides visual comparison, not an accuracy certificate.

## Verification

Exercise real Audiveris with generated, known-note PDF and PNG fixtures; compare
recognized pitch/rhythm against source and verify accepted-score persistence in
an isolated daemon. Also exercise a polyphonic chorale and report differences,
without turning synthetic results into a general accuracy claim. Test missing
engine, invalid uploads, output failure, cancellation and close-before-complete.
Also exercise a mixed PDF with cover, prose, blank and music pages; assert only
the original music-page numbers reach recognition. Check manual overrides, the
five-page selection limit, stale inspection cancellation, and a broken embedded
image remaining unknown. Compare all pages of the local reference PDFs visually
and verify that music pages remain candidates.
Run the complete repository tests, TypeScript, lint, browser/desktop builds, and
the Electron scan smoke using an isolated profile and CHORALE_HOME.

## Licensing and setup

Audiveris is an external AGPL-3.0 tool. It is not vendored in the package or
downloaded during an import. The optional development setup helper downloads an
official release into ignored .local storage for an explicitly requested trial.
Document its version/source, installation, runtime configuration and limits.
