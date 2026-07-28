# Score Surface Spec

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define how the rendered score behaves as the primary reading and interaction surface.

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

## 4. Annotation overlays

The score surface supports inline annotation UI layered on top of rendered notation.

Required elements:

- compact annotation pills near the relevant passage
- selected-range highlight blocks
- annotation detail cards that explain the selected note or harmonic event
- a direct handoff action from annotation detail into chat

Annotations are rendered from structured document state rather than ad hoc DOM inspection.

## 5. Score toolbar

The toolbar exposes score-facing controls without competing with the score itself.

Expected controls:

- key transposition controls (-1, +1 semitone, reset)
- zoom controls (-10%, +10%, percentage readout, wheel zoom with Ctrl/Cmd)
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

- inline annotation overlay rendering
