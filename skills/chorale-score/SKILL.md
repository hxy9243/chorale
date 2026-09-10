---
name: chorale-score
description: Open Chorale in the default browser, compose new sheets, import MusicXML files, inspect scores, read measure selections/ranges, apply score edits, and manage musical annotations via the local Chorale MCP server.
---

# Chorale Score Workflow

Use the local Chorale MCP server tools (`chorale`) as the primary interface for all musical score inspection, composition, analysis, and modification. The service runs on port **1685** and persists score files in `~/.chorale/`.

---

## 1. Intent Routing for Common User Requests

### A. "start chorale" (Open UI in default browser)
1. Call `open_ui` to ensure the server on port 1685 is active and launch the workspace in the user's browser.
2. Call `get_workspace_state` to verify the connection and retrieve active scores and views.

### B. "start chorale and compose a new sheet"
1. Call `open_ui` to ensure the workspace is launched in the browser.
2. Compose the requested piece in well-formed ABC notation (`X:1`, `T:<title>`, `C:<composer>`, `M:<meter>`, `L:<unit>`, `Q:<tempo>`, `K:<key>`, and voices).
3. Call `create_new_file` with `{ title, abcSource, composer, meter, key }` to persist the score to `~/.chorale/`.
4. Call `open_ui` with `{ documentId: newScore.documentId }` so the sheet is focused immediately.
5. If the user asked for annotations or harmonic analysis, call `add_notation`.

### C. "import this musicxml file and analyze it"
1. Call `import_file` with `{ filePath }` or raw MusicXML `{ content }`. The server converts MusicXML/MXL to standard ABC and saves it in `~/.chorale/`.
2. Call `open_ui` with `{ documentId: score.documentId }`.
3. Inspect measures using `read_measure`.
4. Formulate harmonic, motivic, and voice-leading analysis. Call `add_notation` with `{ startMeasure, endMeasure, label, body, kind, chordSymbol, romanNumeral }`.
5. Return a clear analytical summary grounded in exact measure numbers and voice parts.

---

## 2. File & Workspace Management

- **List Scores:** Call `list_files` to retrieve all scores in `~/.chorale/` with measure counts, annotations, and revisions.
- **Delete Score:** Call `delete_file` with `{ documentId }` to remove an unwanted score.
- **Export Score:** Call `export_file` with `{ documentId, format: 'abc' | 'json', outputPath? }` to export.
- **Workspace State:** Call `get_workspace_state` to inspect active document and connected views headlessly.

---

## 3. Sheet & Measure Operations

- **Read Measures:** Call `read_measure` with `{ documentId?, startMeasure?, endMeasure?, voiceId? }`. If measure numbers are omitted and a view is connected, it reads the active selection on the sheet canvas.
- **Insert Measures:** Call `insert_measure` with `{ documentId, targetMeasure, position: 'before' | 'after', count, abcContent?, expectedRevision }`.
- **Edit Measures:** Call `edit_measure` with `{ documentId, startMeasure, endMeasure, replacementAbc, summary?, expectedRevision }`.
- **Delete Measures:** Call `delete_measures` with `{ documentId, startMeasure, endMeasure, expectedRevision }`.
- **Add Notations:** Call `add_notation` with `{ documentId, expectedRevision, notations: [{ startMeasure, endMeasure, label, body, kind, chordSymbol, romanNumeral }] }`.
- **Edit / Delete Notations:** Call `edit_notations` or `delete_notations` to update or remove annotations.
- **List Notations:** Call `list_notations` with `{ documentId, startMeasure?, endMeasure? }`.
- **Revision Control:** Always provide `expectedRevision` from your latest read when performing mutations.
