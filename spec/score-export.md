---
title: "Score Export Spec"
description: "Specification for exporting scores to external formats via the file sidebar context menu — MusicXML and PDF with annotations"
category: "core-workspace"
date: 2026-08-22
updated: 2026-08-29
status: "implemented"
source_files:
  - src/music/musicXmlExport.ts
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
  - src/music/__tests__/scorePdfExport.test.ts
  - src/components/__tests__/FileRail.test.tsx
  - src/hooks/__tests__/useScoreExport.test.ts
related_specs:
  - spec/score-surface.md
  - spec/file-workspace-architecture.md
  - spec/workspace-layout.md
  - spec/annotations-and-proposals.md
---

# Score Export Spec

Date: 2026-08-22  
Updated: 2026-08-29  
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

- Library: **`abc-utils`** (`abc2xml(abc, { fallbackTitle })`).
- Pure module: `src/music/musicXmlExport.ts`. Zero React/Electron dependencies.
- Output: a MusicXML `<score-partwise>` document string.

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
- **PDF generator unit tests** (`src/music/__tests__/scorePdfExport.test.ts`): HTML output, system row slicing, chord badges, expanded annotations, print styles.
- **File rail context menu tests** (`src/components/__tests__/FileRail.test.tsx`): export submenu items (both MusicXML and PDF enabled).
- **Hook tests** (`src/hooks/__tests__/useScoreExport.test.ts`): MusicXML and PDF export calls, dialog cancellation handling.

## 7. Future extensions

- **Compressed `.mxl`** via `jszip`.
- **Customizable PDF page orientation / print theme presets** (Portrait vs Landscape, Urtext Commentary appendix mode).
