# Score Surface Spec

Date: 2026-08-05
Updated: 2026-08-12
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

## 5. Annotation score badges and rail

- **Chord:** a collision-free 20px badge above the staff at its persisted `measure + rational offset`.
  The badge may include a Roman numeral and always exposes a visible edit glyph.
- **Modulation, voice leading, and explanation:** cards in the annotation rail; they do not render in
  the score SVG. Note-to-note voice-leading arrows remain deferred.

`annotationLayout` is a pure projection from canonical annotations and rendered indexes to SVG-local placement. ABC source offsets and SVG coordinates are ephemeral lookup data and are never persisted as annotation identity.

Actual chord text bounds determine badge widths. A deterministic interval packer assigns overlapping
badges to vertical lanes with a fixed gap. The required lane count updates abcjs `stafftopmargin` and
`staffsep`, so annotation room is part of score geometry rather than an overlapping layer.

The score surface is a responsive `minmax(0, 2fr) / minmax(0, 1fr)` notation/rail grid. Below a 52rem
container width, the rail stacks under notation. This preserves at least half of the available width
for notation at all wide layouts.

Range cards are score-sorted, show two lines when collapsed, and allow one expanded card at a time.
Activating a card selects and reveals its passage without moving focus into the score. Type-specific
Nordic Ledger surfaces distinguish modulation, voice leading, and explanations. Stronger selected
fills are paired with text and an icon. All annotation surfaces are square, borderless, and
shadowless.

Editing and manual creation happen in the rail. Range editors replace their cards in place; chord
editors appear temporarily in the rail. Focusing a badge or card exposes focus styling only; click,
Enter, or Space activates it.

## 6. Chat-reference navigation

A valid `#measure-N` or `#measure-N-M` chat reference:

1. activates the referenced range;
2. scrolls `startMeasure` into view;
3. moves keyboard focus to the score surface;
4. seeks paused playback to `startMeasure` using repeat-aware behavior;
5. does not start playback.

## 7. Toolbar

Existing transpose and zoom controls remain. The active-range badge retains its clear action. The
annotation rail is the single accepted/manual annotation navigation and editing surface; proposal
review cards remain in chat.
