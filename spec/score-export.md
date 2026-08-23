---
title: "Score Export Spec"
description: "Specification for exporting scores to external formats via the file sidebar context menu — MusicXML first, PDF later"
category: "core-workspace"
date: 2026-08-22
updated: 2026-08-22
status: "implemented"
source_files:
  - src/music/musicXmlExport.ts
  - src/components/FileRail.tsx
  - src/hooks/useScoreExport.ts
  - src/utils/fileSave.ts
  - electron/ipcChannels.ts
  - electron/fileIpc.ts
  - electron/preload.ts
  - src/types/electron.d.ts
test_files:
  - src/music/__tests__/musicXmlExport.test.ts
  - src/components/__tests__/FileRail.test.tsx
  - src/hooks/__tests__/useScoreExport.test.ts
related_specs:
  - spec/score-surface.md
  - spec/file-workspace-architecture.md
  - spec/workspace-layout.md
---

# Score Export Spec

Date: 2026-08-22  
Updated: 2026-08-22  
Source: `spec/score-export.md`

## 1. Goal

Let a musician export a score to an interchange format from a right-click context menu in the file sidebar. Phase 1 ships **MusicXML** export. PDF export is planned and reserved as a disabled menu entry.

## 2. Non-goals

- No `.mxl` (compressed) export in phase 1; uncompressed `.musicxml` only.
- No round-tripping of the originally imported MusicXML file. Import converts XML → ABC immediately and discards the original (`src/utils/fileSession.ts`, `src/hooks/useDocumentStore.ts`), so **export must always be ABC → MusicXML conversion of the canonical `FileDocument.abcSource`**.
- No batch/multi-document export, no export of annotations or chat history.

## 3. Conversion pipeline (ABC → MusicXML)

### 3.1 Library choice: `musicxml-io`

- The conversion uses the **`musicxml-io`** npm package (MIT, TypeScript, browser-safe build): `parseAbc(abc)` → Score model → `serialize(score)` → MusicXML 4.0 string.
- Rationale (evaluated against alternatives):
  - No ABC→MusicXML writer exists in the current dependency tree (`abcjs`, `@educandu/abc-tools` are import/MIDI only).
  - `abc2xml.py` has gold-standard fidelity but is Python-only; bundling Python into an Electron + web app adds a per-platform runtime, packaging matrix, and a second process boundary — rejected.
  - Hand-rolling a writer was rejected as unnecessary given `musicxml-io` coverage of ABC v2.1 (voices, ties, chords, broken rhythm, grace notes, tuplets, repeats/voltas, chord symbols, lyrics).
- Known limitation to verify during implementation: clef/name attributes on `V:` lines may be dropped by the upstream parser; if confirmed, patch at the adapter layer or upstream.

### 3.2 Module placement

- Thin adapter `src/music/musicXmlExport.ts` wraps the library so it stays swappable. Zero React/Electron dependencies (pure-library invariant).
- Input: `abcSource: string` plus a fallback title from `FileDocument.name`.
- Output: a MusicXML `<score-partwise>` document string. Conversion failures throw a typed `ScoreExportError`.

## 4. Save flow (sandbox-aware)

The renderer is sandboxed (`contextIsolation: true, sandbox: true`) and there is currently no file-save IPC, so:

### 4.1 Electron path

- New channel map `FILE_IPC` in `electron/ipcChannels.ts` following the `'chorale-ai:<verb>'` naming convention:
  - `'chorale-file:save-text'` — payload `{ suggestedName: string, contents: string }`; main process opens `dialog.showSaveDialog` with MusicXML filters (`.musicxml`, `.xml`), then writes via `fs/promises.writeFile`. Returns `{ saved: boolean, path?: string }`.
- Handler registered by a new `registerFileIPC()` in `electron/fileIpc.ts`, called alongside `registerAIIPC()` from `electron/main.ts`, reusing the existing sender-validation pattern (`assertSender`, argument checks). Input validation enforces string types and a sane size cap. The main process only ever writes to a user-chosen dialog path; cancel writes nothing and returns `{ saved: false }`.
- Preload bridge exposes `window.choraleFiles.saveTextFile(...)` (new `contextBridge` key next to `choraleAI` in `electron/preload.ts`); typed in `src/types/electron.d.ts`.

### 4.2 Web fallback

- When `window.choraleFiles` is absent (web build), fall back to a `Blob` + object-URL anchor download using the same suggested filename. No credentials or secrets ever pass through either path.

## 5. Context menu UI

### 5.1 Trigger & Placement

- `FileRail` hosts the right-click context menu on file items (`FileItemContextMenu`), anchored to the pointer and clamped to the viewport.
- The music sheet body (`SheetMusicView`) has no right-click action or score context menu.

### 5.2 Menu component & actions

- `FileItemContextMenu` (`src/components/FileRail.tsx`):
  - `role="menu"` container with `role="menuitem"` buttons, viewport clamping, outside-mousedown / Escape / scroll-to-close.
- Actions:
  - **Open**: switches active score file (disabled when already active).
  - **Duplicate**: duplicates the score file.
  - **Export ▸**: opens a submenu (hover/focus expandable, keyboard accessible):
    - *MusicXML (.musicxml)* — triggers export flow for the target file.
    - *PDF (coming soon)* — rendered disabled with a "coming soon" affordance; reserved for the later print-to-PDF feature (Electron `webContents.printToPDF`).
  - **Delete**: confirms and deletes the file.

### 5.3 Export orchestration

- Hook `src/hooks/useScoreExport.ts`: builds the MusicXML string via the pure converter, then saves through the platform save path, and reports success/failure feedback consistent with existing status-pill/toast patterns.
- Default filename derives from `FileDocument.name` sanitized + `.musicxml`.

## 6. Testing

- **Converter unit tests** (`src/music/__tests__/musicXmlExport.test.ts`): single-voice melody, rests, ties, chords, multi-voice parts, key/meter changes, metadata fallbacks; structural assertions on emitted XML (parts, notes, ties) plus output validity.
- **File rail context menu tests** (`src/components/__tests__/FileRail.test.tsx`): RTL roles (`menu`/`menuitem`), open, duplicate, export submenu (MusicXML active, disabled PDF item), delete confirmation, Escape close.
- **Hook test** (`src/hooks/__tests__/useScoreExport.test.ts`): mock bridge/web-download paths; verify no write occurs on cancel.

## 7. Future extensions

- **PDF export:** reuse the same context-menu Export submenu; Electron path uses `webContents.printToPDF()` on a hidden render of the current sheet; web path uses browser print. Menu item flips from disabled to enabled.
- **Compressed `.mxl`** via the already-present `jszip` dependency.
