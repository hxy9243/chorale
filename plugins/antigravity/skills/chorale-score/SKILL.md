---
name: chorale-score
description: Open Chorale in the default browser, compose new sheets, import MusicXML files, inspect scores, read measure selections/ranges, apply score edits, and manage musical annotations via the local Chorale MCP server.
---

# Chorale Score Workflow

Use the local Chorale MCP server tools (`chorale`) as the primary interface for all musical score inspection, composition, analysis, and modification.

## 1. Intent Routing for Common User Requests

### A. "start chorale" (Open UI in default browser)
1. Call `open_chorale_ui` to start the Chorale daemon and open the interactive workspace in the user's default browser.
2. Call `get_active_view` or `get_workspace_state` to verify the connection, reporting the currently active score, revision, and open pane.

### B. "start chorale and compose a new sheet"
1. Call `open_chorale_ui` to ensure the workspace is launched in the browser.
2. Compose the requested musical piece in well-formed ABC notation with standard headers (`X:1`, `T:<title>`, `C:<composer>`, `M:<meter>`, `L:<unit duration>`, `Q:<tempo>`, `K:<key>`, and voice definitions `V:1 ...`).
3. Call `create_score` with `{ title, abcSource }` to authoritatively persist the score document.
4. Call `open_chorale_ui` with `{ documentId: newScore.documentId }` so the newly composed sheet is immediately loaded and focused in the user's browser.
5. If the request included harmonic analysis or annotations, call `add_annotations` to enrich the new score.

### C. "import this musicxml file and analyze it for me"
1. Read the provided MusicXML file (`.xml`, `.musicxml`, or unpack `.mxl` archive).
2. Convert the MusicXML notation to standard ABC format, extract the piece title and key/meter headers.
3. Call `create_score` with `{ title, abcSource }` to import the score into the Chorale document store.
4. Call `open_chorale_ui` with `{ documentId: score.documentId }` to display the imported score in the user's browser.
5. Inspect the score structure and read relevant measures using `read_measure_range`.
6. Formulate harmonic, motivic, and voice-leading analysis. Call `add_annotations` with structured Roman numerals, chord symbols, and analytical descriptions.
7. Return a clear analytical summary grounded in exact measure numbers and voice parts.

---

## 2. Discover & Resolve Score Views

- **Active View Discovery:** Call `get_active_view` to check what the user is currently viewing in the browser: active document ID, title, revision, `activeTab` (`"sheet"` or `"abc-editor"`), whether the editor is visible, and any highlighted measures.
- **Workspace State:** Call `get_workspace_state` to retrieve the entire workspace inventory (saved scores, active document ID, connected views count) headlessly without requiring an active browser tab.
- **List Scores:** Call `list_scores` to view all saved scores, their measure counts, annotations, and revisions.
- **Score Summary:** Call `get_score_summary` with `documentId` to inspect revision and metadata.

---

## 3. Bounded Measure Reads

- **Explicit Measure Ranges:** Call `read_measure_range` with `documentId`, `startMeasure`, and `endMeasure` (1-indexed, inclusive). If an optional `viewId` is specified and the connected view's highlighted range does not match, the server returns error code `SELECTION_MISMATCH`.
- **Live User Selection:** Call `read_measure_selection` to inspect whatever measures the user has highlighted on the sheet canvas.
  - *Fast read contract:* Does not spawn a browser; if no view is connected, it returns `VIEW_NOT_CONNECTED`.
  - *Idle selection state:* When connected but no measures are highlighted, it returns standard success with `selection: null`, `selectedAbc: null`, and an informative message (never `isError: true`).
- Always ground musical explanations in exact written measure numbers and voice parts.

---

## 4. Authoritative Edits & Annotations

- **Editing Scores:** When modifying a score (e.g. transposing, re-harmonizing, completing counterpoint, fixing voice leading), call `edit_score` with `documentId`, `expectedRevision`, `replacementAbc`, and a descriptive `summary`. The server updates the authoritative store and synchronizes with any active workspace view.
- **Adding Annotations:** Call `add_annotations` with `documentId`, `expectedRevision`, and an array of `{ startMeasure, endMeasure, label, body, kind, chordSymbol, romanNumeral, position }` objects.
- **Modifying/Removing Annotations:** Call `edit_annotations` to update an annotation's text or span, or `delete_annotations` to remove annotations by ID.
- **Revision Control:** Always provide the `expectedRevision` obtained from the most recent read. If a `REVISION_CONFLICT` occurs, re-read the score to inspect concurrent changes before re-applying.

---

## 5. Visual Workspace & UI Launch

- Call `open_chorale_ui({ documentId? })` to intentionally launch the Chorale workspace in the default browser and focus a given score.
- In hosts supporting MCP Apps UI (such as Codex or compatible MCP clients), call `render_score_workspace` with `documentId` to render the embedded sheet music view.
- All score data inspection, composition, and analytical functions continue to work headlessly even when the browser UI is not running.
