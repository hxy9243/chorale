# Score Surface Spec

Date: 2026-07-25  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define how the rendered score should behave as the primary reading and interaction surface.

## 2. Score presentation

The score surface should support continuous-scroll reading rather than behaving like a single isolated render block.

Expected presentation:

- score title and metadata row at the top
- continuous vertical staff systems
- visible measure numbers on the left
- toolbar-level zoom and fit controls
- readable spacing for inline annotation affordances

This is more advanced than the current `SheetMusicView`, which renders and zooms but does not model continuous document-style interaction.

## 3. Selection behavior

The score must support anchored selection of a note, beat, or contiguous passage.

Examples from the design:

- selected note or beat
- selected passage such as measures 5–6
- a visible highlight region on the score

Selection is not just visual emphasis. It is a reusable context handoff into playback, annotations, and chat.

## 4. Annotation overlays

The score surface should support inline annotation UI layered on top of rendered notation.

Required elements:

- compact annotation pills near the relevant passage
- selected-range highlight blocks
- annotation detail cards that explain the selected note or harmonic event
- a direct handoff action from annotation detail into chat

Annotations should be rendered from structured data, not inferred from ad hoc DOM state.

## 5. Score toolbar

The toolbar should expose score-facing controls without competing with the score itself.

Expected controls:

- score or ABC view switching
- annotate action
- zoom percentage control
- fit control

The toolbar belongs to the score workspace, not to the app header.

## 6. Relationship to current implementation

The current branch already has:

- rendered ABC notation
- zoom controls
- transposition controls

The design still requires:

- continuous-scroll composition
- structured selection state
- annotation overlay rendering
- score metadata header
- selection-to-chat and selection-to-playback handoff
