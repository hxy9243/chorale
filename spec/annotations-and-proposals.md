---
title: "Annotations and Proposals Implementation Spec"
description: "Specification for canonical annotation data model, storage normalization, proposal lifecycle, atomic Apply All, and overlay/rail rendering"
category: "annotations"
date: 2026-08-05
updated: 2026-08-30
status: "implemented"
source_files:
  - src/types/document.ts
  - src/music/documentSchema.ts
  - src/music/annotationLayout.ts
  - src/music/annotationMutations.ts
  - src/components/AnnotationProposalCard.tsx
  - src/components/AnnotationRail.tsx
  - src/components/AnnotationOverlay.tsx
  - src/components/AnnotationEditor.tsx
  - src/agent/proposalActions.ts
  - src/agent/conversationStore.ts
test_files:
  - src/music/__tests__/documentSchema.test.ts
  - src/music/__tests__/annotationLayout.test.ts
  - src/music/__tests__/annotationMutations.test.ts
  - src/agent/__tests__/proposalActions.test.ts
  - src/components/__tests__/AnnotationProposalCard.test.tsx
  - src/components/__tests__/AnnotationRail.test.tsx
  - src/components/__tests__/AnnotationOverlay.test.tsx
  - src/components/__tests__/AnnotationEditor.test.tsx
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/interaction-model.md
  - spec/file-workspace-architecture.md
  - spec/agent-analysis-and-annotations.md
---

# Annotations and Proposals Implementation Spec

Date: 2026-08-05  
Updated: 2026-08-30
Status: Implemented in shared music libraries and renderer UI

## 1. Purpose

Define the canonical annotation model, storage normalization, proposal lifecycle, score overlay ownership, and editing workflow for the MVP annotation loop.

Fingerprinting, dependency-level staleness, stale styling, regeneration, and agent-initiated removal are explicitly deferred.

## 2. Canonical data model

```ts
export type AnnotationKind =
  | 'chord'
  | 'modulation'
  | 'voice-leading'
  | 'explanation';

export type RationalDuration = {
  numerator: number;
  denominator: number;
};

export type MusicalPosition = {
  measure: number;
  offset: RationalDuration;
};

export type MeasureSpan = {
  startMeasure: number;
  endMeasure: number;
};

export type AnnotationBase = {
  id: string;
  span: MeasureSpan;
  label: string;
  body: string;
  source: 'user' | 'assistant';
  agentProfiles?: AgentProfileId[];
  createdAt: string;
  updatedAt: string;
};

export type ChordAnnotation = AnnotationBase & {
  kind: 'chord';
  position: MusicalPosition;
  chordSymbol: string;
  romanNumeral?: string;
};

export type RangeAnnotation = AnnotationBase & {
  kind: 'modulation' | 'voice-leading' | 'explanation';
};

export type Annotation = ChordAnnotation | RangeAnnotation;

export type ProposalState =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'outdated'
  | 'unavailable';

export type AnnotationProposal = {
  id: string;
  runId: string;
  documentId: string;
  sourceRevision: number;
  state: ProposalState;
  annotation: Annotation;
};
```

Validation rules:

- Measures are positive integers and `startMeasure <= endMeasure`.
- Rational values have a non-negative numerator, positive denominator, and reduced form.
- A chord annotation requires `position` and `chordSymbol`.
- `position.measure` must fall inside the annotation span.
- Roman numeral is optional; inversion and figured bass are deferred.
- IDs, timestamps, source, document identity, revision, and selected profiles are application-controlled, not model-controlled.

`Annotation` is the only annotation type used by `FileDocument`, `MusicContextSnapshot`, tools, IPC, and overlays. The legacy `MusicAnnotation` type is removed.

## 3. Storage normalization

Pure functions in `src/music/documentSchema.ts` normalize untrusted persisted values before React receives them:

- `normalizeAnnotation(value)`
- `normalizeFileDocument(value)`

`storageAdapter.getDocuments()` invokes document normalization for both IndexedDB and test-memory paths. `useDocumentStore` owns state and mutations only.

Legacy kinds normalize as follows:

- `harmony` to `chord` when valid chord data can be recovered; otherwise to `explanation`;
- `analysis`, `phrase`, `comment`, and `edit-note` to `explanation`;
- valid unknown records to `explanation`.

Annotations stay inline in stored `FileDocument` values, so no IndexedDB object-store migration is required.

## 4. Proposal lifecycle

```text
proposed --Edit----> proposed
    |                  |
    +--Reject------> rejected
    |
    +--Apply All---> accepted
    |
    +--revision----> outdated
    |
    +--abort/fail--> unavailable
```

- `proposed`: staged by `propose_annotations`; actions are enabled only after the run completes.
- `accepted`: applied to `FileDocument.annotations` by the turn-level Apply All action.
- `rejected`: excluded from Apply All and retained as a collapsed chat record.
- `outdated`: active document ID or revision differs from the proposal snapshot; actions are disabled and the UI requests a new analysis.
- `unavailable`: the agent run failed or was aborted before review.

### 4.1 Atomic Apply All

There is one Apply All action per assistant turn and no individual Apply action.

1. Exclude rejected, outdated, and unavailable proposals.
2. Confirm the active document ID and revision match every eligible proposal.
3. Validate every eligible annotation.
4. If any validation fails, apply none and identify the invalid cards.
5. Otherwise append all annotations and mark all eligible proposals accepted in one renderer state transaction.

Edited proposals remain `proposed` until Apply All. Rejected proposals remain excluded. Annotation application does not increment the ABC revision or append a `ScoreVersion`.

Deleting a chat thread removes pending proposal records but never deletes accepted annotations.

## 5. User editing

`AnnotationEditor` supports:

- a reusable manual mode for all four annotation kinds;
- editing a staged proposal before Apply All;
- editing an accepted annotation;
- deleting an accepted annotation after explicit user action.

The released score surface does not expose manual Add or annotation-count controls. New annotations
enter the user-visible workflow through `propose_annotations`: the empty rail instructs the user to
select measures and ask the AI Agent. The reusable `AnnotationEditor` manual mode still saves directly
and bypasses proposal state when embedded by another surface. Agent-initiated deletion is not supported.

Accepted range-annotation editing lives in the persistent rail beside the score, never in a
top-of-sheet form. Every accepted range card has a 44px pen control with an accessible tooltip, and
the selected card is replaced by the full `AnnotationEditor` in place. Its kind, measure range, label,
body, and any chord fields introduced by a kind change remain editable.

Activating a chord badge opens a compact editor over the notation near that badge. It edits only the
chord symbol and optional Roman numeral and also offers Delete; its kind, span, position, label, and
body remain unchanged. Save is silent, keeps the passage selected, and reports failures inline.
Escape cancels. Save, Cancel, and Delete return focus to the initiating badge or range-card control
when it still exists, or to the rail when the annotation was deleted or moved out of the rail.

## 6. Overlay architecture

```text
score paper wrapper
├── abcjs container             owned by abcjs
└── annotation overlay layer   owned by React
```

The overlay layer creates transparent SVGs aligned with each abcjs SVG. It copies view boxes and current rendered bounds. `ResizeObserver` and score-render notifications recompute geometry after wrapping, zoom, resize, or transpose.

`src/music/annotationLayout.ts` is a pure projection from annotations plus rendered score indexes to placement records. It must not mutate annotations or depend on React.

The overlay background uses `pointer-events: none`; annotation nodes use `pointer-events: auto` and are keyboard focusable.

### 6.1 Score badges and annotation rail

- **Chord:** a 20px chord symbol and optional Roman numeral in a square, borderless badge above the
  staff at `position`. The badge itself is the edit control; it has an accessible edit name but no
  separate pen glyph.
- **Modulation, voice leading, and explanation:** square, borderless cards in the persistent rail.
  They do not render in the score SVG.

Chord layout resolves `measure + rational offset` to a parsed event and then to the current abcjs timing/selectable element. ABC source offsets may be used as ephemeral lookup hints but are never the persisted identity. If no exact rendered event exists, layout uses adjacent onset geometry within the same measure and falls back to the measure bounds.

Chord badge widths come from actual SVG text bounds. Intersecting intervals are spread horizontally
with a guaranteed gap while every badge in a rendered system stays on one fixed baseline. abcjs
always reserves one chord band through static `musicspace` and `staffsep` values; measured badge
geometry never feeds back into score rendering, so adding or resizing a badge cannot move systems.
React continues to own the overlay as a sibling of `#paper`.

The rail sorts cards by start measure, end measure, kind, creation timestamp, and source order.
Collapsed cards show the label and at most two body lines. Activating a card expands its full body,
collapses the previously expanded card, selects and reveals its span, and keeps focus in the rail.
Notation and range annotations live in one horizontally scrollable score scene. The scene uses fixed,
symmetric `24rem / 48rem / 24rem` tracks for balancing space, notation, and annotations, with only a
small tokenized gap between notation and the rail. The annotation track therefore remains at least half
the notation width. The matching left track keeps the notation on the zoom scene's exact centerline.
The scene never reflows: when the available width is smaller than the scene, it overflows horizontally
while the viewport remains centered on notation and the annotation track stays beside the score at the
same height.

One shared zoom wrapper contains both notation and the annotation rail, so they scale around the same
score center and at the same instant. Each card is vertically anchored to the center of its rendered
measure span. Actual card heights are packed with a fixed gap so nearby annotations do not overlap.
Semantic Nordic Ledger tokens provide warning surfaces for modulation, success surfaces for voice
leading, accent surfaces for chords (cool fjord blue), and distinct heather/lavender surfaces for
explanations so every annotation kind visually stands out. Selected cards use a stronger matching
fill plus visible “Selected” text and a check icon, so state never relies on color alone. Annotation
surfaces are square, borderless, and shadowless. Proposal preview cards in the chat panel share this
same square, kind-colored, borderless style, and the entire annotation block acts as an interactive
link reference to the measure, navigating to and selecting the referenced passage on the sheet when clicked.

## 7. Conversation persistence

Conversation storage remains schema version 3 and stores proposal states, profile routes, compact
tool-display metadata, and optional score proposals. Version-2 threads migrate with empty
arrays/default metadata. IndexedDB is the full-fidelity store; local storage is a compact synchronous
mirror and fallback, and hydration merges their file maps without changing the schema.

Accepted annotations are durable document data. Proposal records are chat data. A failed document save retains the in-memory annotation and surfaces the existing save-error status.

## 8. Verification

- Canonical normalization runs before hooks and components consume stored documents.
- Multiple chord annotations in one measure keep distinct rational onsets.
- Apply All is all-or-none and excludes rejected proposals.
- Revision or file mismatch renders Outdated and disables actions.
- Failed/aborted runs render proposals Unavailable.
- Overlay geometry remains aligned after wrap, zoom, transpose, and resize.
- Measured chord badge bounds never intersect, share one system baseline, and never trigger abcjs reflow.
- Range cards remain score-sorted, two-line clamped by default, single-expanded, and keyboard usable.
- Range cards share the score's zoom wrapper, stay near their rendered measure spans, and never
  displace the centered notation track or reflow below it.
- Narrow score surfaces retain the side-by-side scene and expose horizontal overflow.
- Range annotations stay out of score SVGs and chord editing appears temporarily over the notation.
- The score surface exposes no manual Add/count controls; its empty rail routes creation through the
  selected passage and AI Agent.
- Accepted annotations survive reload and Electron restart.
- Chat deletion cannot remove accepted annotations.
