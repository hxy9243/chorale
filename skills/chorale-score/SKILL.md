---
name: chorale-score
description: Open Chorale in the default browser, compose new sheets, import MusicXML files, inspect scores, read measure selections/ranges, apply score edits, and manage musical annotations via the local Chorale MCP server.
---

# Chorale Score Workflow

Use the local Chorale MCP server tools (`chorale`) as the primary interface for all musical score inspection, composition, analysis, and modification. The service runs on port **1685** and persists score files in `~/.chorale/`.

---

## 1. Modular Reference Library

For detailed rules, standards, and musical examples, consult the topic-specific references:

- **[Basic MCP Usage & Workflows](references/basic-usage.md)**: Headless inspection, revision guards (`expectedRevision`), atomic measure mutations (`edit_measure`, `insert_measure`), annotations (`add_notation`), and view synchronization.
- **[ABC Syntax, Engraving & Ergonomics](references/abc-syntax-and-rules.md)**: ABC pitch octaves, key signature inheritance, metric beam grouping (no spaces in beams), phrasing, vocal/instrumental ranges (SATB), and piano hand-reach ergonomics.
- **[Counterpoint, Chorale & Fugue](references/counterpoint-and-forms.md)**: Strict 4-part SATB rules (no parallel 5ths/8ves, upper voice spacing $\le$ octave, voice crossing bans), tendency-tone resolutions, suspensions, cadences, and fugal architecture.
- **[Styles & Composer Emulation](references/styles-and-composers.md)**: Stylistic conventions, harmonic rhythm, accompaniment figures, and ABC templates for Baroque (J.S. Bach), Classical (Mozart/Haydn), Beethoven, and Romantic (Chopin).

---

## 2. Intent Routing for Common User Requests

### A. "start chorale" (Open UI in default browser)
1. Call `open_ui` to ensure the server on port 1685 is active and launch the workspace in the user's browser.
2. Call `get_workspace_state` to verify the connection and retrieve connected views.

### B. "start chorale and compose a new sheet"
1. Call `open_ui` to ensure the workspace is launched in the browser.
2. Compose the requested piece following the [ABC Syntax & Engraving Guide](references/abc-syntax-and-rules.md) and [Styles Guide](references/styles-and-composers.md).
3. Call `create_new_file` with `{ title, abcSource, composer, meter, key }` to persist the score to `~/.chorale/`.
4. Call `open_ui` with `{ documentId: newScore.documentId }` so the sheet is focused immediately.
5. If the user asked for annotations or harmonic analysis, call `add_notation`.

### C. "import this musicxml file and analyze it"
1. Call `import_file` with `{ filePath }` or raw MusicXML `{ content }`. The server converts MusicXML/MXL to standard ABC and saves it in `~/.chorale/`.
2. Call `open_ui` with `{ documentId: score.documentId }`.
3. Inspect measures using `read_measure`.
4. Formulate harmonic, motivic, and voice-leading analysis using [Counterpoint & Forms](references/counterpoint-and-forms.md). Call `add_notation` with `{ startMeasure, endMeasure, label, body, kind, chordSymbol, romanNumeral }`.
5. Return a clear analytical summary grounded in exact measure numbers and voice parts.

---

## 3. Mandatory Engraving & Composition Ground Rules

When generating or modifying ABC notation, agents must obey these non-negotiable rules:

1. **Rhythmic Beaming (No Spaces in Beams)**:
   - In ABC, whitespace breaks beams. Connect eighth and sixteenth notes within the same metric beat **without spaces** (e.g. `cdef gfed` in 4/4, NOT `c d e f g f e d`).
   - Never beam across the middle of a 4/4 measure (beat 3 boundary must have a space).
2. **Instrument & Vocal Tessituras**:
   - Stay strictly within playable and comfortable ranges:
     - **Soprano**: C4–A5 (safe: D4–G5) | **Alto**: G3–D5 (safe: A3–C5)
     - **Tenor**: C3–G4 (safe: D3–F4)   | **Bass**: E2–D4 (safe: F2–C4)
3. **Keyboard / Piano Ergonomics**:
   - Never write single-hand chords exceeding an **octave or 9th** unless notated as rolled/broken.
   - Separate hands into Voice 1 (`clef=treble`) and Voice 2 (`clef=bass`).
   - Avoid muddy close intervals (thirds/seconds) in the deep bass register below C3.
4. **Counterpoint Invariants (Chorale & Fugue)**:
   - **Zero parallel 5ths or 8ves** between any two voices.
   - Maximum distance between adjacent upper voices (S–A, A–T) is **one octave**.
   - Resolve leading tones ($\hat{7} \rightarrow \hat{1}$) and chordal sevenths downward ($\hat{4} \rightarrow \hat{3}$).

---

## 4. MCP Tools Quick Reference

| Tool | Action | Key Parameters |
| --- | --- | --- |
| `open_ui` | Launch workspace in browser | `documentId?` |
| `get_workspace_state` | Headless check of documents & views | none |
| `list_files` | List all scores in `~/.chorale/` | none |
| `create_new_file` | Create new score | `title`, `abcSource`, `composer?`, `meter?`, `key?` |
| `delete_file` | Delete score | `documentId` |
| `import_file` | Import MusicXML/ABC | `filePath?`, `content?`, `title?` |
| `export_file` | Export to ABC or JSON | `documentId`, `format`, `outputPath?` |
| `read_measure` | Read ABC for measures or active selection | `documentId?`, `startMeasure?`, `endMeasure?`, `voiceId?` |
| `edit_measure` | Replace measures with new ABC | `documentId`, `startMeasure`, `endMeasure`, `replacementAbc`, `expectedRevision` |
| `insert_measure` | Insert measures before/after | `documentId`, `targetMeasure`, `position`, `count`, `expectedRevision` |
| `delete_measures` | Delete measure span | `documentId`, `startMeasure`, `endMeasure`, `expectedRevision` |
| `add_notation` | Add Roman numeral/harmonic annotation | `documentId`, `expectedRevision`, `notations: [...]` |
| `list_notations` | List annotations on score | `documentId`, `startMeasure?`, `endMeasure?` |
| `edit_notations` | Edit annotation details | `documentId`, `expectedRevision`, `notations: [...]` |
| `delete_notations` | Delete annotations by ID | `documentId`, `expectedRevision`, `notationIds: [...]` |
| `render_score_workspace`| Return interactive MCP App HTML | `documentId` |
