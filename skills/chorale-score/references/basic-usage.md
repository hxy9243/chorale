# Chorale MCP Basic Usage & Workflow Guide

This guide details how autonomous agents inspect, modify, and analyze musical scores using the Chorale MCP server (`chorale`).

---

## 1. System Architecture & Environment

- **Server Port**: The Chorale daemon operates locally on **port 1685** (`http://127.0.0.1:1685/`).
- **Persistence Directory**: All documents are stored in `~/.chorale/` (`store.json` index and mirrored `<documentId>.abc` source files).
- **Headless First**: All read and write tools (`read_measure`, `edit_measure`, `add_notation`, etc.) function headlessly without requiring a browser window to be open.
- **Browser UI on Demand**: The workspace canvas is opened only when requested or when an interactive review is needed via `open_ui`.

---

## 2. Reading & Inspecting Scores

### A. Listing Scores
Call `list_files` to retrieve metadata for all saved scores:
```json
// Result item format:
{
  "documentId": "score-1726000000000",
  "title": "Chorale in G Major",
  "composer": "J.S. Bach",
  "measureCount": 16,
  "revision": 3,
  "annotationCount": 8,
  "createdAt": "2026-09-14T00:00:00.000Z",
  "updatedAt": "2026-09-14T00:10:00.000Z"
}
```

### B. Reading Written Measures
Use `read_measure` to inspect score notation:
- **Specific Range**:
  ```json
  {
    "documentId": "score-1726000000000",
    "startMeasure": 5,
    "endMeasure": 8
  }
  ```
- **Active Canvas Selection**: If `documentId`, `startMeasure`, and `endMeasure` are omitted and a browser view is connected, `read_measure` automatically returns the measures currently selected by the user on the sheet canvas.
- **Specific Voice**: Pass `voiceId: "Soprano"` or `voiceId: "1"` to isolate a single vocal or instrumental line.

### C. Reading Annotations
Call `list_notations` with `{ documentId, startMeasure?, endMeasure? }` to inspect existing harmonic analysis, Roman numerals, and formal commentary across a score span.

---

## 3. Safe Score Mutations & Revision Guards

Chorale employs **optimistic concurrency control** through `revision` numbers. Stale mutations fail closed to prevent accidental overwrites.

### The Read-Modify-Write Protocol
1. Read the target score or measure range using `read_measure` or `list_files`. Note the returned `revision`.
2. Compute your ABC modification or musical annotation.
3. Supply `expectedRevision: <revision>` in the mutation call.
4. If a conflict occurs (`REVISION_CONFLICT`), re-read the latest measures and reconcile changes.

### A. Editing Measures (`edit_measures` / `edit_measure`)
Replaces a bounded range of measures with new ABC content:
```json
{
  "documentId": "score-1726000000000",
  "startMeasure": 5,
  "endMeasure": 8,
  "replacementAbc": "[V:1] d4 c4 | B4 A4 |\n[V:2] F4 G4 | G4 F4 |\n[V:3] A4 e4 | d4 d4 |\n[V:4] D4 C4 | G,4 D4 |",
  "summary": "Fix parallel fifths between Tenor and Bass in mm. 6-7",
  "expectedRevision": 3
}
```
*Rules*:
1. `edit_measures` accepts any span `startMeasure` to `endMeasure` (1-indexed, inclusive).
2. **Variable Measure Lengths**: The replacement ABC does *not* need to maintain the same measure count as `endMeasure - startMeasure + 1`. Replacing 4 measures with 2 measures contracts the score; replacing 2 measures with 5 measures expands it.
3. `edit_measure` is fully supported as an identical backward-compatible alias.

### B. Inserting Measures (`insert_measure`)
Inserts new empty or pre-filled measures:
```json
{
  "documentId": "score-1726000000000",
  "targetMeasure": 4,
  "position": "after",
  "count": 2,
  "abcContent": "[V:1] e4 d4 | c8 |\n[V:2] G4 F4 | E8 |",
  "expectedRevision": 4
}
```

### C. Deleting Measures (`delete_measures`)
Removes an unwanted passage:
```json
{
  "documentId": "score-1726000000000",
  "startMeasure": 9,
  "endMeasure": 10,
  "expectedRevision": 5
}
```

---

## 4. Analytical Annotations (`add_notation`)

Annotations enrich the score with harmonic, motivic, and structural insights displayed directly in Chorale's annotation rail.

### Supported Annotation Kinds
- `chord`: Harmonic identification with `chordSymbol` (e.g. `G7`, `C#dim`) and `romanNumeral` (e.g. `V7`, `vii°6`).
- `analysis`: General music theory explanation, non-chord tone analysis, or motivic observation.
- `voice-leading`: Discussion of melodic motion, suspensions, voice crossings, or cadence preparation.
- `form`: Phrase markings (antecedent, consequent, sentence, episode, coda, cadence type).

### Example: Adding Roman Numeral Analysis
```json
{
  "documentId": "score-1726000000000",
  "expectedRevision": 6,
  "notations": [
    {
      "startMeasure": 4,
      "endMeasure": 4,
      "kind": "chord",
      "chordSymbol": "D7",
      "romanNumeral": "V7",
      "label": "Dominant Seventh",
      "body": "Root position dominant seventh resolving to tonic G in m. 5 (PAC)."
    },
    {
      "startMeasure": 1,
      "endMeasure": 4,
      "kind": "form",
      "label": "Antecedent Phrase",
      "body": "Four-measure opening phrase ending on half cadence in m. 4."
    }
  ]
}
```

---

## 5. View & Workspace Synchronization

1. **Focusing Scores**: When creating a new score with `create_new_file`, call `open_ui({ documentId: score.documentId })` to bring the score into view for the user.
2. **Checking View Connections**: Call `get_workspace_state` to see if any browser tabs are currently connected (`connectedViews > 0`).
3. **External Imports**: When importing files (`import_file`), MusicXML (.xml, .musicxml, .mxl) files are parsed and converted to canonical ABC automatically.
