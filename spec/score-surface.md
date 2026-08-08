# Score Surface Spec

Date: 2026-08-05
Source: `spec/agent-analysis-and-annotations.md`

## 1. Goal

Keep the score the primary reading surface while adding continuous passage selection, chat navigation, and lightweight annotation overlays.

## 2. Existing presentation invariants

- abcjs renders responsive continuous SVG systems.
- Score metadata and build/save status remain visible.
- Score zoom remains independently persisted and centered without clipping.
- Playback auto-centering and its manual-scroll pause behavior remain intact.
- Existing transpose, playback cursor, repeat selection, and first-click hit-area behavior must not regress.

## 3. Continuous range selection

- Single click selects one written measure.
- Shift-click and the keyboard equivalent extend one inclusive continuous range.
- Reverse selection normalizes to `startMeasure <= endMeasure`.
- Each selected measure receives a highlight, including across system wraps.
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

## 5. Annotation tracks

- **Chord:** chord symbol and optional Roman numeral above the staff at its persisted `measure + rational offset`.
- **Modulation:** ribbon across the annotated transition span.
- **Voice leading:** compact textual callout below the passage; note-to-note arrows are deferred.
- **Explanation:** range marker plus highlighted side sticker containing the full body.

`annotationLayout` is a pure projection from canonical annotations and rendered indexes to SVG-local placement. ABC source offsets and SVG coordinates are ephemeral lookup data and are never persisted as annotation identity.

All tracks use a restrained shared palette and focused/unfocused states. Focusing an annotation also activates its score span and opens Edit/Delete detail actions.

## 6. Chat-reference navigation

A valid `#measure-N` or `#measure-N-M` chat reference:

1. activates the referenced range;
2. scrolls `startMeasure` into view;
3. moves keyboard focus to the score surface;
4. seeks paused playback to `startMeasure` using repeat-aware behavior;
5. does not start playback.

## 7. Toolbar

Existing transpose and zoom controls remain. The active-range badge gains a clear action. Annotation-layer toggles may expose Chords, Modulations, Voice Leading, and Explanations without introducing parallel score/editor navigation.
