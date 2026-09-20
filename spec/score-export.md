---
title: "Score Export Spec"
description: "Specification for exporting scores to external formats via the file sidebar context menu — MusicXML and PDF with annotations"
category: "core-workspace"
date: 2026-08-22
updated: 2026-09-17
status: "implemented"
source_files:
  - src/music/musicXmlExport.ts
  - src/music/musicXmlNormalization.ts
  - src/music/scorePdfExport.ts
  - src/components/FileRail.tsx
  - src/hooks/useScoreExport.ts
  - src/utils/fileSave.ts
  - electron/ipcChannels.ts
  - electron/fileIpc.ts
  - electron/preload.ts
  - src/types/electron.d.ts
  - src/types/fileBridge.ts
test_files:
  - src/music/__tests__/musicXmlExport.test.ts
  - src/music/__tests__/musicXmlNormalization.test.ts
  - src/music/__tests__/scorePdfExport.test.ts
  - src/components/__tests__/FileRail.test.tsx
  - src/hooks/__tests__/useScoreExport.test.ts
related_specs:
  - spec/score-video-export.md
  - spec/score-surface.md
  - spec/file-workspace-architecture.md
  - spec/workspace-layout.md
  - spec/annotations-and-proposals.md
---

# Score Export Spec

Date: 2026-08-22  
Updated: 2026-09-17  
Source: `spec/score-export.md`

## 1. Goal

Let a musician export a score to interchange and presentation formats from a right-click context menu in the file sidebar.
- **MusicXML (.musicxml):** Interchange format converting ABC notation to standard MusicXML 4.0.
- **PDF (.pdf):** Presentation format exporting the full score with chord annotations on the staff and uncollapsed range annotations in a side rail using **Option E: Row-Based System Slicing with Dynamic System Spacing**.

## 2. Non-goals

- No `.mxl` (compressed) export in phase 1; uncompressed `.musicxml` only.
- No round-tripping of the originally imported MusicXML file. Import converts XML → ABC immediately and discards the original (`src/utils/fileSession.ts`, `src/hooks/useDocumentStore.ts`), so **export must always be ABC → MusicXML conversion of the canonical `FileDocument.abcSource`**.
- No batch/multi-document export, no export of chat history.

## 3. Conversion pipelines

### 3.1 MusicXML Pipeline (ABC → MusicXML)

- Conversion: **`abc-utils`** (`abc2xml(abc, { fallbackTitle })`).
- Normalization: **`normalizeMusicXml`** (`src/music/musicXmlNormalization.ts`) pre-export pass:
  - **Meter & Duration Tracking:** Computes the expected duration for every measure across all parts and staves based on the active time signature and divisions.
  - **Pickup & Intentional Partial Measure Protection:** Normalization detects intentional partial measures (anacrusis marked with `implicit="yes"` or `number="0"`, split repeat fragments across repeat barlines, opening partial measures followed by full measures, and complementary final measures). For these measures, `expectedDuration` is set to the maximum duration of transcribed notes (`maxDur`), preventing unwanted rest padding or synthetic decomposition.
  - **Occurrence-Indexed Measure Keys:** Multi-part synchronization indexes measures using unique occurrence keys (`${measureNumber}#${occurrenceCount}`, e.g., `7#0`, `7#1`). This ensures split repeat measures sharing the same number (`number="7"`) across repeat boundaries do not overwrite staves or drop measure nodes during DOM reconciliation.
  - **Missing Measure & Voice Infilling:** Synchronizes all parts against the master sequence of measure occurrences; empty measures in silent staves/voices are padded with whole-measure rests (`<rest measure="yes"/>`).
  - **Durational Rest Decomposition:** In non-pickup, full-meter measures, partially filled measures/voices are padded with durational rests decomposed into standard musical note values (whole, half, quarter, eighth, etc. with `<dot/>`) to complete the expected meter duration.
  - **Multi-Voice & Multi-Staff Synchronization:** Inserts `<backup>` elements of exact expected duration between consecutive voices and ensures no invalid trailing backups exist after the final voice of the measure.
- Pure module: `src/music/musicXmlExport.ts`. Zero React/Electron dependencies.
- Output: a normalized MusicXML `<score-partwise>` document string that passes standard validation (MuseScore, Sibelius, music21) without incomplete measure errors.

### 3.2 PDF Pipeline (Score & Annotation Rendering via Option E)

- Pure generator: `src/music/scorePdfExport.ts` converts a `FileDocument` (ABC source, score metadata, and annotations) into a standalone, self-contained printable HTML document.
- **Option E Architecture (Row-Based System Slicing):**
  - Scores are rendered into system slices (`.abcjs-l0`, `.abcjs-l1`, ...).
  - Each system slice forms a horizontal row with its associated range annotations:
    - **Score column:** System SVG with above-staff chord badges.
    - **Annotations column:** Fully expanded range annotation cards (`modulation`, `voice-leading`, `explanation`) matching that system's measure range.
  - CSS Flexbox expands the row height to `max(systemHeight, totalAnnotationsHeight)` so subsequent music lines automatically start below the previous annotations, eliminating vertical drift.
  - CSS `break-inside: avoid;` ensures system rows cleanly paginate across pages without clipping annotation cards.
  - Styled with high-contrast light print tokens and `@page { size: A4; margin: 10mm 12mm; }`.

## 4. Save flow (sandbox-aware)

The renderer is sandboxed (`contextIsolation: true, sandbox: true`):

### 4.1 Electron path

- IPC channel map `FILE_IPC` in `electron/ipcChannels.ts`:
  - `'chorale-file:save-text'` — payload `{ suggestedName: string, contents: string }`; opens save dialog with MusicXML filters, writes text.
  - `'chorale-file:save-pdf'` — payload `{ suggestedName: string, html: string }`; main process loads HTML in a hidden offscreen `BrowserWindow` via temporary file, calls `webContents.printToPDF({ landscape: false, printBackground: true, pageSize: 'A4' })`, prompts save dialog with `.pdf` filter, and writes binary buffer via `fs/promises.writeFile`.

- Handlers registered in `electron/fileIpc.ts` with sender validation (`assertSender`).
- Preload bridge exposes `window.choraleFiles.saveTextFile(...)` and `window.choraleFiles.savePdfFile(...)` in `electron/preload.ts`.

### 4.2 Web fallback

- **MusicXML:** `Blob` + object-URL anchor download.
- **PDF:** Invisible hidden `<iframe>` loaded with the print HTML, triggering `iframe.contentWindow.print()`.

## 5. Context menu UI

### 5.1 Trigger & Placement

- `FileRail` hosts the right-click context menu on file items (`FileItemContextMenu`).

### 5.2 Menu component & actions

- Actions:
  - **Open**: switches active score file.
  - **Duplicate**: duplicates the score file.
  - **Export ▸**: opens submenu:
    - *MusicXML (.musicxml)* — triggers MusicXML export.
    - *PDF (.pdf)* — triggers PDF print export with annotations.
  - **Delete**: confirms and deletes the file.

### 5.3 Export orchestration

- Hook `src/hooks/useScoreExport.ts`: supports `'musicxml'` and `'pdf'` formats.
- Default filenames:
  - MusicXML: sanitized `FileDocument.name` + `.musicxml`.
  - PDF: sanitized `FileDocument.name` + `.pdf`.

## 6. Testing
 
 - **Converter unit tests** (`src/music/__tests__/musicXmlExport.test.ts`): MusicXML XML structure and attributes.
 - **Normalization unit tests** (`src/music/__tests__/musicXmlNormalization.test.ts`): validates padding of empty measures (`<rest measure="yes"/>`), durational rest decomposition, multi-staff/multi-voice backup synchronization, and time signature changes across measures.
 - **PDF generator unit tests** (`src/music/__tests__/scorePdfExport.test.ts`): HTML output, system row slicing, chord badges, expanded annotations, print styles.
- **File rail context menu tests** (`src/components/__tests__/FileRail.test.tsx`): export submenu items (both MusicXML and PDF enabled).
- **Hook tests** (`src/hooks/__tests__/useScoreExport.test.ts`): MusicXML and PDF export calls, dialog cancellation handling.

## 7. Future extensions

- **Compressed `.mxl`** via `jszip`.
- **Customizable PDF page orientation / print theme presets** (Portrait vs Landscape, Urtext Commentary appendix mode).
