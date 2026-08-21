---
title: "Score Surface Spec"
description: "Specification for score rendering, continuous range selection, chord overlays, range annotation rail, line measure numbers, and auto-centering playback"
category: "core-workspace"
date: 2026-08-05
updated: 2026-08-21
status: "implemented"
source_files:
  - src/components/SheetMusicView.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/components/ScoreCardHeader.tsx
  - src/components/AnnotationOverlay.tsx
  - src/components/AnnotationRail.tsx
  - src/components/AnnotationEditor.tsx
  - src/utils/abcMetadata.ts
  - src/music/annotationLayout.ts
  - src/utils/abcAudio.ts
  - src/utils/repeatPlayback.ts
  - src/utils/autoScroll.ts
  - src/hooks/useInterfaceZoom.ts
  - tokens.css
test_files:
  - src/components/__tests__/SheetMusicView.test.tsx
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/utils/__tests__/abcMetadata.test.ts
  - src/components/__tests__/AnnotationRail.test.tsx
  - src/components/__tests__/AnnotationOverlay.test.tsx
  - src/components/__tests__/AnnotationEditor.test.tsx
  - src/music/__tests__/annotationLayout.test.ts
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
  - spec/interaction-model.md
  - spec/annotations-and-proposals.md
  - spec/playback-dock.md
---

# Score Surface Spec

Date: 2026-08-05  
Updated: 2026-08-21  
Source: `spec/agent-analysis-and-annotations.md`

## 1. Goal

Keep the score the primary reading surface while adding continuous passage selection, chat navigation, line-start measure numbers, lightweight annotation overlays, and visual score metadata presentation with inline ABC header editing.

## 2. Existing presentation invariants

- abcjs renders responsive continuous SVG systems with smooth rendering transitions.
- Score title is displayed in centered classical serif typography (`--font-serif`), providing an authentic engraving appearance.
- Secondary score metadata (composer, author/lyricist, subtitle, origin, rhythm) is right-aligned to match the right edge of the rendered sheet music.
- Musical attributes (Key, Meter, Tempo) are presented as centered interactive metadata chips beneath the title block.
- Clean score engraving in view mode: ABC tag badges (`T:`, `C:`, etc.) are hidden during normal reading and only displayed when an input is actively being edited.
- Save and build status pills (`Auto-saved`, `SVG ready`, `Music ready`) are hosted in the global application header so they remain permanently visible regardless of score scroll position.
- Floating score display options (`ScoreCardHeader`) float over the top-center of the score paper with scroll-reactive translucency (`is-scrolling`), providing synchronized zoom controls (−, %, +, Fit).
- Score zoom remains independently persisted and centered without clipping.
- Line-start measure numbers (`.chorale-line-measure-number`) are rendered above the start of each staff system for rapid orientation.
- Playback auto-centering and its manual-scroll pause behavior remain intact.
- Existing transpose, playback cursor, repeat selection, and first-click hit-area behavior must not regress.

## 3. Continuous range selection

- Single click selects one written measure.
- Shift-click and the keyboard equivalent extend one inclusive continuous range.
- Reverse selection normalizes to `startMeasure <= endMeasure`.
- Each selected measure receives a highlight rectangle (`.abcjs-measure-highlight`), including across system wraps.
- Highlight geometry accurately computes measure bounding boxes across standard barlines, opening repeats, and system boundaries.
- Hit areas continue to work on notation and staff whitespace.
- Selection seeks or starts playback from `startMeasure` using the current repeat-aware occurrence.
- File switch clears the active range; disconnected ranges are unsupported.

## 4. Overlay ownership

```text
score paper wrapper
├── abcjs container             owned by abcjs
└── annotation overlay layer   owned by React
```

React must not render children into the abcjs-owned container. The sibling overlay creates transparent SVG layers aligned to the rendered abcjs SVGs and copies their view boxes. Geometry is recomputed after render, wrap, zoom, transpose, and resize.

The overlay background ignores pointer events. Annotation elements are pointer-interactive, keyboard focusable, and expose meaningful accessible names.

## 5. Annotation score badges and rail

- **Chord:** a collision-free 20px badge above the staff at its persisted `measure + rational offset`.
  The badge may include a Roman numeral. The whole badge is an accessible edit control and has no
  separate pen glyph.
- **Modulation, voice leading, and explanation:** cards in the annotation rail; they do not render in
  the score SVG. Note-to-note voice-leading arrows remain deferred.

`annotationLayout` is a pure projection from canonical annotations and rendered indexes to SVG-local placement. ABC source offsets and SVG coordinates are ephemeral lookup data and are never persisted as annotation identity.

Actual chord text bounds determine badge widths. A deterministic interval packer spreads overlapping
badges horizontally with a fixed gap while keeping one baseline per rendered system. Static abcjs
`musicspace` and `staffsep` values always reserve the chord band, so annotation measurement never
feeds back into score geometry or makes systems jump.

The score surface uses one fixed, symmetric `24rem / 48rem / 24rem` scene: empty balancing space,
centered notation, and the annotation rail. The rail sits one small spacing token from the rendered
sheet and remains at least half the notation width. The scene never changes tracks or stacks. When the
viewport is narrower than the scene, horizontal overflow exposes the side content while the viewport
continues to center the notation track.

Range cards are score-sorted, show two lines when collapsed, and allow one expanded card at a time.
Activating a card selects and reveals its passage without moving focus into the score. Type-specific
Nordic Ledger surfaces distinguish modulation, voice leading, and explanations. Stronger selected
fills are paired with text and an icon. All annotation surfaces are square, borderless, and
shadowless. The rail container and empty state have no gray panel fill, and there is no count/Add
header. A single zoom wrapper
contains both notation and rail, giving them one zoom center and one scale change. Card centers target
the vertical center of their rendered measure spans; measured card heights are packed with a fixed gap
when targets are close together. The notation viewport recenters its horizontal scroll on the notation
track after zoom or rendered-size changes.

Range editors replace their cards in place and expose the complete accepted-annotation form. Chord
badges open a compact editor over the notation for chord symbol, optional Roman numeral, and Delete;
the remaining chord fields stay unchanged. The score surface has no manual Add control. Its empty rail
instructs the user to select measures and ask the AI Agent for new range annotations. Focusing a badge
or card exposes focus styling only; click, Enter, or Space activates it.

## 6. Chat-reference navigation

A valid `#measure-N` or `#measure-N-M` chat reference:

1. activates the referenced range;
2. scrolls `startMeasure` into view;
3. moves keyboard focus to the score surface;
4. seeks paused playback to `startMeasure` using repeat-aware behavior;
5. does not start playback.

## 7. Toolbar and display options

Existing transpose and zoom controls remain. The floating display options pill provides synchronized zoom controls (`onZoomIn`, `onZoomOut`, `onResetZoom`). The active-range badge retains its clear action. The annotation rail is the accepted range-annotation navigation and editing surface. Chords edit inline over the notation, and proposal review cards remain in chat.

## 8. Score metadata header and inline ABC editing

The `ScoreMetadataHeader` component provides visual display and inline editing for tune headers:

- **Editable fields:** Title (`T:`), Subtitle (2nd `T:`), Composer (`C:`), Lyricist/Author (`A:`), Origin (`O:`), Rhythm (`R:`), Key (`K:`), Meter (`M:`), Tempo (`Q:`).
- **Validation:**
  - Key signatures validate against standard roots, accidentals, and modes (`validateKeySignature`).
  - Meters validate standard time signatures and common/cut time symbols (`validateMeter`).
  - Tempos validate BPM values within bounds (20–500 BPM) and note-value prefixes (`validateTempo`).
- **Add field menu:** A subtle `+` button in the attribution row opens a dropdown to add optional header fields (Subtitle, Composer, Lyricist/Author, Origin, Rhythm).
- **Non-destructive synchronization:** `updateAbcHeaderMetadata` in `src/utils/abcMetadata.ts` modifies header fields in the first tune's header section without touching musical notes, voice blocks, lyrics, or comments.
- **Bi-directional updates:** Changes to ABC code (via file import, ABC editor, or agent) immediately update `ScoreMetadataHeader` fields; editing headers in `ScoreMetadataHeader` immediately updates ABC code, increments document revisions, triggers autosave, and re-renders the score.
