# PDF / PNG import MVP trial — 2026-10-23

## Worktree and base

- Branch: `feat/pdf-score-import-mvp`.
- Worktree: `.agents/worktrees/pdf-score-import-mvp` beneath the main Chorale checkout.
- Parent: the current contents of `restore-electron-chat`, including its
  uncommitted Electron and chat restoration.
- Isolated base snapshot: `718672d3df131dca5e5a381c1982970e33730c83`, parent
  `5ef8487f5d142d97447bb5051cf7e765bdbbab6c`. The source worktree was not edited.

## Implemented

Desktop **Scan PDF / PNG** opens a local scan/review flow. It preserves the
original, recognition project, MusicXML, diagnostics, source hash and manifest.
The user compares binarized source pages with the recognized score before
acceptance. Acceptance creates a new document in the shared Chorale service;
existing documents are preserved, including repeated imports of the same file.
The ABC stores the source-folder reference for later inspection.

The trial caps each job at five selected pages, 20 MB, a 1.5 GB Java heap and
three minutes. It validates file signatures, executes without a shell, handles
cancel/close and rejects empty recognition results. It exposes converter notes
and unresolved-rhythm diagnostics without claiming an accuracy score.

## Real recognition results

Engine: official Audiveris 5.11.0, Java 25 runtime supplied by its installer,
Tesseract 5.5.2 with the official legacy-compatible English data. The lightweight
`tessdata_fast` English model is incompatible with Audiveris's legacy OCR mode;
setup therefore installs the full `tessdata/4.1.0` model instead.

The fixtures were rendered from known ABC and verified to contain all reference
notes before recognition. The Bach input is the opening eight written measures
(including its pickup) of the bundled BWV 371, with four voices on two staves.

| Input | Recognition time | Matching pitch/onset/duration events | Extra events | Further losses in MusicXML → ABC |
|---|---:|---:|---:|---:|
| Melody PDF | 31.1 seconds | 16 / 16 | 0 | 0 |
| Melody PNG | 26.8 seconds | 16 / 16 | 0 | 0 |
| BWV 371 excerpt PDF | 38.0 seconds | 76 / 77 | 0 | 0 |

In the Bach excerpt, recognition omitted the alto B3 on the last beat of the
second full measure. All 76 recognized events survived conversion into ABC.
The source and result both contain four voice identifiers, but the event metric
pools voices and does **not** certify correct voice assignment. Ties, text,
articulations and engraving are outside this comparison. These clean generated
pages do not establish accuracy on photographs or historical scans.

The real desktop trial also checked source and recognized previews, no document
creation before acceptance, preservation of existing documents, daemon storage,
reload with source provenance, and cancellation without importing.

## Verification and limits

- Full suite: 227 service tests and 899 unit/UI tests passed.
- The 12 scan-specific tests passed again after subsequent scan refinements.
- TypeScript, lint, browser build and desktop builds passed. Lint retains
  pre-existing warnings in inherited code.
- Playwright's Electron launcher adds `--no-sandbox`; the automated desktop
  scan trial alone is not evidence of normal sandboxed launch. Separately,
  the normal production launcher, without that flag and with renderer sandboxing
  configured, was verified to display a score and the ready scan dialog using
  a separate trial profile/library on port 1696.
- This is an uncommitted experimental MVP. No branch was pushed or merged.

Raw trial artifacts are retained in
`.local/scan-trial/2026-10-23T08-35-41-073Z/`, including `REPORT.md`, `results.json`,
reference PDF/PNG/ABC files, imported ABC, review screenshots and source-job
folders. The `.local/` directory is ignored by Git.

The prepared trial window uses `.local/scan-demo-library` and
`.local/scan-demo-profile`. The normal-launch check is recorded in
`.local/normal-launch-verification.json`; it leaves the scan dialog open so the
user can choose a score. Setup and trial runs do not modify the original
worktree's score library.

See [setup and usage](score-scan-import.md).

## Real-scan follow-up: Debussy Arabesque No. 1

The first page of `IMSLP02821-Debussy-L066.pdf` failed substantially. Audiveris
misread the four-sharp key signature, omitted common time, and threw a measure-5
export exception despite returning process exit code zero. Its MusicXML already
contained these errors before conversion into ABC. Extracting the embedded page
image without resampling recovered the time signature, but still produced a
wrong key signature, unresolved rhythms and the same partial-export exception.

The importer now rejects these partial exports and missing-meter results while
preserving the files for inspection. This changes failure reporting; it does
not repair this page's recognition. The clean synthetic scores above are not a
reliable estimate of performance on this historical scan. See the
[Debussy investigation](../memory/2026-10-23-debussy-scan.md).
