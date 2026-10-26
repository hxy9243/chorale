---
title: PDF and PNG score import MVP
status: experimental
source_files:
  - electron/scoreScan.ts
  - electron/scanIpc.ts
  - electron/main.ts
  - electron/scanJobs.ts
  - electron/preload.ts
  - src/types/scoreScan.ts
  - src/components/ScoreScanModal.tsx
  - src/components/BackgroundImportStage.tsx
  - src/hooks/useBackgroundScoreImports.ts
  - src/utils/prepareScanImport.ts
  - src/hooks/useDocumentStore.ts
  - src/components/FileRail.tsx
  - src/App.tsx
  - src/styles/score-scan.css
  - src/utils/xmlParser.ts
  - src/utils/abcAudio.ts
  - src/utils/scorePageInspection.ts
  - src/utils/staffDetection.ts
  - vite.config.ts
  - scripts/setup-score-scanner.mjs
  - server/setup-score-scanner.mjs
  - server/setup-copisteria.mjs
  - server/setup-audiveris.mjs
  - server/python/score_scan.py
test_files:
  - src/agent/__tests__/scoreScan.test.ts
  - src/components/__tests__/ScoreScanModal.test.tsx
  - src/components/__tests__/prepareScanImport.test.ts
  - src/hooks/__tests__/useBackgroundScoreImports.test.tsx
  - src/hooks/__tests__/backgroundDocumentCreation.test.tsx
  - src/agent/__tests__/scanJobs.test.ts
  - scripts/background-scan-smoke.mjs
  - scripts/scan-import-smoke.mjs
  - src/utils/__tests__/staffDetection.test.ts
  - scripts/scan-pages-smoke.mjs
  - test/score-scan-adapter.python.py
related_specs:
  - spec/desktop-chat-restoration.md
  - spec/file-workspace-architecture.md
  - spec/score-surface.md
---

# PDF and PNG score import MVP

## Scope and ownership

Electron-only, local recognition of printed common Western notation. Copisteria
is the default engine; Audiveris remains an explicit option. Engines and weights
are installed separately, never downloaded during recognition. Never upload scores.
The browser/plugin continues to import ABC/MusicXML normally. Scan entry appears
only when the desktop scan bridge is available.

File -> selected pages -> persisted native background job -> file-list entry ->
validated MusicXML/ABC -> new shared-service document.

## User flow

1. Choose **Scan PDF / PNG** to open **Import sheet music (experimental)**,
   then choose a file and an engine. Select all pages by default,
   including pages without detected staves; thumbnails and screening labels are
   advisory. Users may deselect pages or type a range. Support up to 60 pages
   and 20 MiB/file. Selecting more than five pages shows red text explaining that
   recognition may take a while; five is no longer a selection limit.
2. **Import** queues recognition, creates a file-list import entry immediately,
   and closes the setup popup. It does not wait for recognition. Cancelling the
   setup dialog before submission creates no job. Closing it after submission,
   selecting another score or reloading the renderer must not cancel a job.
3. The entry shows `Title (importing...)` with a subtle text animation and a
   static reduced-motion alternative. Queued entries also explain their queue
   state. Selecting an import displays a sheet-stage background-import message
   with its title, page count and Cancel action. Other documents remain usable.
4. One native recognition process runs at a time, with bounded queued uploads.
   Queued/running/recognized/failed/cancelled jobs are owned by the main process.
   Persist job metadata and original bytes before acknowledging submission.
   Renderer reload reattaches to jobs. Application restart marks interrupted jobs
   failed rather than leaving permanent importing entries or silently resuming.
5. On recognition completion, validate MusicXML conversion and the prepared
   engraving path before creating a score. Import is the user's authorization to
   create this new document; no second modal acceptance is needed. Use the job ID
   as the resulting document ID for idempotent recovery. Keep native results until
   the shared document save succeeds. Completing a job must not steal focus from
   another score or interrupt a separately pending file import. If the importing entry is selected, replace its stage with the
   completed score. Newly imported scores retain source provenance and a reminder
   to check recognition against the original.
6. Failed/cancelled entries remain selectable with an explanation, a Remove
   action and source-folder access when files exist. Never install malformed ABC
   or replace an existing document. Removing entries retains their artifacts.

### Page screening

Use bundled PDF.js with a local worker and no document/network uploads.
Bundle the image decoders and their licenses locally for scanned PDFs; do not
rely on a CDN or assume image-decoder failure means a blank/non-music page.
Render one page at a time at bounded resolution. Reject encrypted, malformed or overly
long PDFs with an actionable message. Release workers/canvases on completion,
file replacement and modal close; ignore stale asynchronous results.

Staff detection is a visual heuristic, not recognition confidence. A page with
no detected staves is labelled accordingly and stays selected by default.
A page that fails inspection is labelled "Check page" and stays selected for user review; never silently classify inspection errors as non-music. Permit
manual numeric page selection if PDF inspection fails entirely. Keep original
PDF page numbers throughout selection, native recognition and source preview.
Show selected and omitted pages before scanning. Preserve original page numbering in artifacts.
Only selected pages are sent to the engine. A recognition failure is an error,
never a reason to silently skip a music page. Preserve the complete original
file, including omitted pages. This heuristic targets horizontal five-line
printed notation; rotated/faint/unconventional notation may need manual choice.

## Native process boundary

- Validate sender identity/origin as with other desktop IPC.
- Accept file name, binary contents and bounded page selection, never executable
  paths or shell fragments from the renderer. PDF <=20 MiB; PNG <=20 MiB and
  <=40 megapixels. Check signatures and reject invalid or empty uploads.
- Discover executable via CHORALE_AUDIVERIS, a worktree-local runtime, or PATH.
- Discover Copisteria via CHORALE_COPISTERIA_HOME, worktree .local/copisteria,
  or ~/.chorale/scanners/copisteria. Require its isolated Python environment,
  pinned installation manifest, detector and evidence weights. The setup helper
  pins the tested source revision and verifies weights by SHA-256.
- Renderer requests may name only `copisteria` or `audiveris`; omission selects
  Copisteria. Renderer-supplied executable paths are forbidden.
- Copisteria runs on CPU with four threads. Render selected PDF pages
  into the job folder, bounded to 3300 pixels on the longest side. Preserve per-page XML and
  symbol readings. Join matching parts in page order, retain page-boundary
  attributes and durations, and renumber measures. Reject missing/empty pages,
  changed part/staff layout or unequal part measure counts; never skip a page.
- Copisteria has an 8 GiB address-space cap on Linux and a timeout of at least ten minutes; allow three minutes per selected page for
  long imports. Audiveris allows at least three minutes and scales by page count.
  Cancellation kills the entire subprocess group, including PDF rendering.
- Execute with an argument array (no shell), bounded memory, output and time.
  Allow one recognition process at a time, queue at most ten active jobs and
  enforce explicit per-job cancellation. Cancel ignores late results.
- Jobs live in CHORALE_HOME/imports/<UUID> (default ~/.chorale/imports). Preserve
  original bytes, .omr, MusicXML, logs and a manifest, including on failure. Persist background-job metadata separately from recognition manifests.
- ZIP extraction is in memory with file-size/dimension limits, no path writes.
- Only validated recognized notation becomes an editable document. Job entries
  are stored separately from shared editable scores until validation succeeds.
- Manifest and result identify the chosen engine; Copisteria manifests retain
  the installation revision and model hashes plus original-page-to-bar ranges.

## Review limits and validation

OMR success is not musical correctness. Reject empty/invalid MusicXML or output
with no pitched events. Conversion into ABC is a second possible source of
error. Preserve the MusicXML separately and retain engine/converter warnings with the imported source.
Validate with the workspace's shared prepared engraving path,
including invisible-rest tuplet anchors. Never persist the prepared substitute
ABC. A rendering exception leaves the entry failed and permits another file or removal
without affecting existing scores.
When recognition succeeds but conversion fails, retain an Open source folder
action for the original and raw MusicXML while creating a document remains forbidden.
Also reject an export when Audiveris reports a measure-export exception even
if the process exits zero, or when no explicit time signature was recognized.
These cases produce partial or unmetered candidates, not usable scan results.
Keep the original and generated files for diagnosis, but do not offer them as
successful imports. Unmetered music is outside this trial's supported scope.
Preview playback and corrections use Chorale's existing workspace after import;
preserved originals remain available for comparison; completion is not an accuracy certificate.

## Verification

Exercise both real engines with generated, known-note PDF and PNG fixtures; compare
recognized pitch/rhythm against source and verify accepted-score persistence in
an isolated daemon. Also exercise a polyphonic chorale and report differences,
and a piano excerpt, without turning synthetic results into a general accuracy
claim. Record recognition errors separately from MusicXML-to-ABC errors. Test missing
engine, invalid uploads, output failure, cancellation and close-before-complete.
Also exercise a mixed PDF with cover, prose, blank and music pages; assert all pages start selected, explicitly deselect non-music pages and verify
only the selected original page numbers reach recognition. Check manual overrides, all-page defaults and over-five-page notice, stale inspection cancellation, and a broken embedded
image remaining unknown. Compare all pages of the local reference PDFs visually
and verify that music pages remain candidates.
Run the complete repository tests, TypeScript, lint, browser/desktop builds, and
the Electron scan smoke using an isolated profile and CHORALE_HOME.

## Licensing and setup

Copisteria code and weights are Apache-2.0; its optional setup installs the tested
revision, Python dependencies and verified weights outside the app. PDF decoding
requires locally installed Poppler. Audiveris is an external AGPL-3.0 tool. It is not vendored in the package or
downloaded during an import. The optional development setup helper downloads an
official release into ignored .local storage for an explicitly requested trial.
Document its version/source, installation, runtime configuration and limits.
