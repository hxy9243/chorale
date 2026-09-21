---
name: chorale-score
description: Open and operate Chorale scores, including localhost:1685 links; inspect beat-aligned voice content, use fallible music21 harmony evidence, verify chord roots and inversions, classify non-chord tones, compose or edit music, and create trustworthy musical annotations through the local Chorale MCP server.
---

# Chorale Score Workflow

Use the local Chorale MCP server tools (`chorale`) as the primary interface for all musical score inspection, composition, analysis, and modification. The service runs on port **1685** and persists score files in `~/.chorale/`.

---

## 1. Modular Reference Library

For detailed rules, standards, and musical examples, consult the topic-specific references:

- **[Basic MCP Usage & Workflows](references/basic-usage.md)**: Headless inspection, revision guards (`expectedRevision`), atomic measure mutations (`edit_measures`, `insert_measure`), annotations (`add_notation`), and view synchronization.
- **[MIDI Instrument Assignment & Verification](references/midi-playback.md)**: abcjs directive scope, per-voice General MIDI programs, safe measure-one repairs, and synthesized-track verification. Read this when instrument names are correct but playback uses the wrong sounds.
- **[ABC Syntax, Engraving & Ergonomics](references/abc-syntax-and-rules.md)**: ABC pitch octaves, key signature inheritance, metric beam grouping (no spaces in beams), phrasing, vocal/instrumental ranges (SATB), and piano hand-reach ergonomics.
- **[Chord Progression Analysis & Syntax](references/chord-progression-analysis.md)**: Vertical sonority extraction, Roman numeral analysis, chord inversions (5/3, 6/3, 6/4, 7, 6/5, 4/3, 4/2), functional syntax (Tonic, Pre-Dominant, Dominant), secondary dominants/leading tones, chromatic chords (Neapolitan, Augmented 6ths), and pivot-chord modulation.
- **[Voice Leading & General Score Analysis](references/voice-leading-and-general-analysis.md)**: Linear voice leading, leap recovery, contrapuntal motion types, comprehensive non-chord tone (NCT) taxonomy, period and sentence formal structures, textural categories, and motivic development.
- **[Counterpoint, Chorale & Fugue](references/counterpoint-and-forms.md)**: Strict 4-part SATB rules (no parallel 5ths/8ves, upper voice spacing $\le$ octave, voice crossing bans), tendency-tone resolutions, suspensions, cadences, and fugal architecture.
- **[Styles & Composer Emulation](references/styles-and-composers.md)**: Stylistic conventions, harmonic rhythm, accompaniment figures, and ABC templates for Baroque (J.S. Bach), Classical (Mozart/Haydn), Beethoven, and Romantic (Chopin).

---

## 2. Intent Routing for Common User Requests

### A. "start chorale" (Open UI in default browser)
1. Call `open_ui` at most once per agent session to ensure the server on port 1685 is active and launch the workspace in the user's browser. Include `documentId` when the target score is already known.
2. Call `get_workspace_state` to verify the connection and retrieve connected views. Reuse that connected view for the rest of the session; do not call `open_ui` again merely to focus or verify a score, because every call may create another browser tab.

### B. "start chorale and compose a new sheet"
1. Compose the requested piece following the [ABC Syntax & Engraving Guide](references/abc-syntax-and-rules.md) and [Styles Guide](references/styles-and-composers.md).
2. Call `create_new_file` with `{ title, abcSource, composer, meter, key }` to persist the score to `~/.chorale/`.
3. If `open_ui` has not been called in this agent session, call it once with `{ documentId: newScore.documentId }` so the new sheet opens directly. Otherwise, reuse the existing connected view and verify the saved score with `get_workspace_state` and authoritative score readback.
4. If the user asked for annotations or harmonic analysis, call `add_notation`.

### C. "import this musicxml file and analyze it"
1. Call `import_file` with `{ filePath }` or raw MusicXML `{ content }`. The server converts MusicXML/MXL to standard ABC and saves it in `~/.chorale/`.
2. If `open_ui` has not been called in this agent session, call it once with `{ documentId: score.documentId }`. Otherwise, reuse the existing connected view.
3. Inspect measures using `read_measure`.
4. For harmonic analysis, call `analyze_harmony` on the same bounded range. Treat its chordification and passage-wide key as fallible candidates, not final answers.
5. Formulate harmonic, motivic, and voice-leading analysis using the [Chord Progression Analysis Guide](references/chord-progression-analysis.md), [Voice Leading & General Analysis Guide](references/voice-leading-and-general-analysis.md), and [Counterpoint & Forms Guide](references/counterpoint-and-forms.md). Call `add_notation` with `{ startMeasure, endMeasure, label, body, kind, chordSymbol, romanNumeral }`.
6. Return a clear analytical summary grounded in exact measure numbers and voice parts.

---

## 3. Mandatory Pre-Annotation Verification

Before adding, editing, or endorsing harmonic annotations:

1. Call `list_files` and `list_notations` to establish the authoritative document ID, revision, existing annotation spans, and score length.
2. Read every target measure individually with `read_measure`. Treat a result as layout-only when its voices contain no note or rest events after removing directives, comments, `$` line-break markers, and structural barlines. Do not annotate that index; record the offset and continue with the verified sounding measures.
3. Call `analyze_harmony` for the same range when music21 is available. Use its sounding pitches and literal bass as a cross-check; independently verify its roots, qualities, inversions, Roman numerals, boundaries, and passage-wide key because ornaments, suspensions, tonicization, and modulation can mislead it. If it returns `MUSIC21_UNAVAILABLE`, continue with the score-first procedure and tell the user that `chorale setup music21` enables the optional evidence tool.
4. Identify pickup bars from their written duration relative to `M:` and preserve their verified MCP indices. Do not infer annotation positions from printed `%` measure comments, visual system breaks, or the count of existing annotations.
5. Build vertical slices at every note onset. Carry sustained and tied pitches forward until their written durations end, and use the lowest sounding pitch in each slice as the bass.
6. Derive each chord root and quality from the sounding pitch classes, then derive inversion independently from the bass. Use figured-bass inversions consistently for triads and sevenths.
7. Test apparent extra pitches as non-chord tones from their metric position, approach, preparation, and resolution. Do not discard a pitch merely because it prevents a convenient chord label.
8. Run a consistency audit before mutation: `label`, `chordSymbol`, `romanNumeral`, and `body` must describe the same sequence, inversion, measure span, voices, and cadence evidence. If the evidence is ambiguous, use a broader functional description or an `explanation` notation instead of an unsupported precise label.

For the complete harmonic procedure and audit checklist, read [Chord Progression Analysis & Syntax](references/chord-progression-analysis.md). For claims about suspensions or other non-chord tones, also read [Voice Leading & General Score Analysis](references/voice-leading-and-general-analysis.md).

---

## 4. Mandatory Engraving & Composition Ground Rules

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
5. **Composer Attribution (`C:` Field & `composer` Parameter)**:
   - For all generated scores, **always set the composer attribution to the name of the current AI model + reasoning effort level** (e.g. `Gemini 3.8 Flash Medium` or `GPT-5.6 Sol High`).
   - If emulating a historical style, include the style in the title or subtitle (e.g. `T:Sonata in G Major\nT:In the style of W.A. Mozart`), and specify the model + effort as the composer (e.g. `C:Gemini 3.8 Flash Medium`).

---

## 5. MCP Tools Quick Reference

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
| `analyze_harmony` | Return fallible music21 key/chord evidence for up to 16 measures | `documentId?`, `startMeasure?`, `endMeasure?`, `viewId?` |
| `edit_measures` | Replace measures across a span (supports variable lengths; alias: `edit_measure`) | `documentId`, `startMeasure`, `endMeasure`, `replacementAbc`, `expectedRevision` |
| `insert_measure` | Insert measures before/after | `documentId`, `targetMeasure`, `position`, `count`, `expectedRevision` |
| `delete_measures` | Delete measure span | `documentId`, `startMeasure`, `endMeasure`, `expectedRevision` |
| `add_notation` | Add Roman numeral/harmonic annotation | `documentId`, `expectedRevision`, `notations: [...]` |
| `list_notations` | List annotations on score | `documentId`, `startMeasure?`, `endMeasure?` |
| `edit_notations` | Edit annotation details | `documentId`, `expectedRevision`, `notations: [...]` |
| `delete_notations` | Delete annotations by ID | `documentId`, `expectedRevision`, `notationIds: [...]` |
| `render_score_workspace`| Return interactive MCP App HTML | `documentId` |
