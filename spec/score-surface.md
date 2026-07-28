# Score Surface Spec

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define how the rendered score behaves as the primary reading, annotation, and interaction surface.

## 2. Score presentation

The score surface supports continuous-scroll reading with automatic playback centering.

Expected presentation:

- score title, composer, key, meter, and tempo header row at the top of the score sheet
- continuous vertical staff systems rendered via SVG (`abcjs`)
- visible measure numbers on the left of systems
- zoom space reservation (`zoom: currentZoom/100`, `width: ${currentZoom}%`, `marginInline: auto`) ensuring scaled score SVGs do not clip container bounds
- auto-centering playback line: during audio playback, the score smooth-scrolls to keep the active playback line centered; manual user scroll/touch/key input pauses auto-centering for 2 seconds before resuming

## 3. Selection behavior

The score supports anchored selection of a measure or location across repeat passes.

Selection rules:

- selected measure is visually emphasized with a faint warm highlight (`abcjs-measure-highlight`)
- selecting a measure resolves the specific repeat pass occurrence based on current playback timestamp (`selectMeasureWithRepeats`), preventing cascading repeat jumps or DOM re-rendering
- selection updates the shared `ScoreAnchor` and hands off into playback, chat, and annotations
- measure selection uses an interactive hit layer (`abcjs-measure-hit-area`) placed above notation so clicks on staff lines or whitespace select measures reliably on first attempt

## 4. Harmonic & Multi-Measure Annotation Overlays

The score surface renders structured annotation layers overlaying the notation SVG.

### 4.1 Annotation Categories & Data Structures

- **Key & Modulation Spans**: Identifies key centers and modulations over single or multi-measure ranges (e.g. `[ C Major: m.1–8 ] ➔ [ G Major (V): m.9–16 ]`).
- **Roman Numeral Analysis (RNA)**: Harmonic analysis tokens placed beneath beat/chord locations (e.g., `I`, `IV`, `V7/IV`, `vi`, `I6/4`, `V7`, `I`).
- **Chord Symbols**: Lead-sheet chord notation rendered above the top staff (e.g. `C`, `G7`, `Am`).
- **Multi-Measure Structural Passages**: Bracketed ranges marking phrases, sections, or cadences (e.g., `Antecedent Phrase (m.1–4)`, `Authentic Cadence (m.8)`).

### 4.2 Visual Layout Tracks & Aesthetics

Annotations are positioned relative to rendered SVG staff measure coordinates (`.abcjs-m0`, `.abcjs-m1`):

1. **Top Ribbon (Key Modulation Track)**: Continuous horizontal pill banner above the treble clef staff representing key regions across measure ranges.
2. **Above-Staff Track (Chord Symbols)**: Standard lead-sheet chord markings aligned with beat offsets.
3. **Below-Staff Track (Roman Numerals & Cadences)**: Textbook-styled analysis row placed beneath the lowest voice staff per system, aligned beat-by-beat.
4. **Multi-Measure Span Rectangles**: Subtle pastel/glassmorphic translucent bounding highlight rectangles covering specified measure bounds (`m.start` through `m.end`), adapting smoothly to system wrapping.

### 4.3 User Interactions with Annotations

- **Selection**: Clicking any annotation pill, Roman numeral, or multi-measure highlight selects the corresponding measure range, updates the shared `ScoreAnchor`, and reflects in Chat & Playback.
- **Expansion & Collapsing**:
  - *Collapsed View*: Compact inline pills/tokens (`V7/IV`, `Modulation: G Major`).
  - *Expanded View*: Clicking opens a popover card or expands the inline analysis track to show pitch-class breakdown, voice-leading notes, author (`user` vs `assistant`), and a handoff action *"Discuss with AI Agent"*.
  - *Global / Category Toggle*: Toolbar controls allow toggling visibility for individual tracks (`Key Modulations`, `Roman Numerals`, `Chord Symbols`, `User Comments`).

## 5. Score toolbar

The toolbar exposes score-facing controls without competing with the score itself.

Expected controls:

- key transposition controls (-1, +1 semitone, reset)
- zoom controls (-10%, +10%, percentage readout, wheel zoom with Ctrl/Cmd)
- annotation layer toggles (Key/Modulation, Roman Numerals, Chords, Freeform)
- active anchor badge with clear selection button
- split editor visibility toggle button

The toolbar belongs to the score workspace.

## 6. Relationship to current implementation

The current implementation provides:

- rendered ABC SVG notation with responsive layout
- zoom controls with space reservation for container bounds
- key transposition controls
- repeat-aware global measure selection and non-destructive measure highlights
- auto-centering playback line with user scroll-pause behavior
- anchor handoff to playback and chat

The design still requires:

- inline multi-measure annotation overlay & Roman numeral track rendering
- annotation expansion/collapsing popover cards
- layer visibility toggles in score toolbar
