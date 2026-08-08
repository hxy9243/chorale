# Annotations and Proposals Implementation Spec

Date: 2026-08-05
Status: Approved for implementation in shared music libraries and renderer UI

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

- manual creation of all four annotation kinds;
- editing a staged proposal before Apply All;
- editing an accepted annotation;
- deleting an accepted annotation after explicit user action.

Manual annotations save directly and bypass proposal state. Agent-initiated deletion is not supported.

## 6. Overlay architecture

```text
score paper wrapper
├── abcjs container             owned by abcjs
└── annotation overlay layer   owned by React
```

The overlay layer creates transparent SVGs aligned with each abcjs SVG. It copies view boxes and current rendered bounds. `ResizeObserver` and score-render notifications recompute geometry after wrapping, zoom, resize, or transpose.

`src/music/annotationLayout.ts` is a pure projection from annotations plus rendered score indexes to placement records. It must not mutate annotations or depend on React.

The overlay background uses `pointer-events: none`; annotation nodes use `pointer-events: auto` and are keyboard focusable.

### 6.1 Tracks

- **Chord:** chord symbol and optional Roman numeral above the staff at `position`.
- **Modulation:** ribbon across the annotated transition span.
- **Voice leading:** compact textual callout below the passage.
- **Explanation:** range marker plus highlighted side sticker for the body.

Chord layout resolves `measure + rational offset` to a parsed event and then to the current abcjs timing/selectable element. ABC source offsets may be used as ephemeral lookup hints but are never the persisted identity. If no exact rendered event exists, layout uses adjacent onset geometry within the same measure and falls back to the measure bounds.

All tracks share a restrained palette and focused/unfocused states. Clicking or focusing an annotation activates its score span and opens its detail view.

## 7. Conversation persistence

Conversation storage advances from version 2 to version 3 and stores proposal states, profile routes, and compact tool-display metadata. Version-2 threads migrate with empty arrays/default metadata.

Accepted annotations are durable document data. Proposal records are chat data. A failed document save retains the in-memory annotation and surfaces the existing save-error status.

## 8. Verification

- Canonical normalization runs before hooks and components consume stored documents.
- Multiple chord annotations in one measure keep distinct rational onsets.
- Apply All is all-or-none and excludes rejected proposals.
- Revision or file mismatch renders Outdated and disables actions.
- Failed/aborted runs render proposals Unavailable.
- Overlay geometry remains aligned after wrap, zoom, transpose, and resize.
- Manual and accepted annotations survive reload and Electron restart.
- Chat deletion cannot remove accepted annotations.
