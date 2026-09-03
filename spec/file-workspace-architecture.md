---
title: "File Workspace Architecture"
description: "Architecture specification covering runtime layers, document store, shared music libraries, data contracts, and invariants"
category: "architecture"
date: 2026-08-05
updated: 2026-09-03
status: "implemented"
source_files:
  - src/types/document.ts
  - src/types/music.ts
  - src/music/documentSchema.ts
  - src/music/rational.ts
  - src/music/scoreSnapshot.ts
  - src/music/annotationLayout.ts
  - src/music/annotationMutations.ts
  - src/utils/abcMetadata.ts
  - src/utils/fileHistory.ts
  - src/utils/storageAdapter.ts
  - src/utils/fileSession.ts
  - src/components/ScoreMetadataHeader.tsx
  - src/components/EditingHistoryModal.tsx
  - src/agent/conversationStore.ts
  - electron/ai/sheetAgentRuntime.ts
  - electron/ipcValidation.ts
test_files:
  - src/types/__tests__/document.test.ts
  - src/music/__tests__/documentSchema.test.ts
  - src/music/__tests__/scoreSnapshot.test.ts
  - src/music/__tests__/annotationMutations.test.ts
  - src/music/__tests__/rational.test.ts
  - src/utils/__tests__/abcMetadata.test.ts
  - src/utils/__tests__/fileHistory.test.ts
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/components/__tests__/EditingHistoryModal.test.tsx
  - src/utils/__tests__/storageAdapter.test.ts
  - src/utils/__tests__/fileSession.test.ts
  - src/agent/__tests__/conversationStore.test.ts
  - src/agent/__tests__/ipcValidation.test.ts
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
  - spec/score-surface.md
  - spec/interaction-model.md
  - spec/agent-tools-and-profiles.md
  - spec/annotations-and-proposals.md
---

# File Workspace Architecture

Date: 2026-08-05
Updated: 2026-09-03
Source: Existing workspace architecture plus `spec/agent-analysis-and-annotations.md`

## 1. Goal

Define ownership, persistence, and process boundaries for the passage-aware Music Tutor without weakening Chorale's existing file, score, playback, or provider behavior.

## 2. Runtime layers

### Renderer UI

- Files rail, score/editor workspace, playback dock, chat panel, and editing history timeline modal (`EditingHistoryModal`).
- React-owned range state, proposal review and preview state, annotation overlays, and visual metadata header (`ScoreMetadataHeader`).
- No score parsing, provider credentials, or Pi tool execution.

### Document store

- Active file identity and canonical `FileDocument` values.
- Shared `ScoreAnchor` range using `startMeasure` and `endMeasure`.
- Annotation CRUD mutations and existing debounced IndexedDB autosave.
- Score editing history timeline (`EditHistoryEntry[]`, max 100 entries) with categories (`origin`, `metadata`, `body`, `annotation`), undo/redo stack, and non-destructive revert.
- ABC changes alone increment document revision and create `ScoreVersion` records.
- Bidirectional synchronization between ABC header tags (T, C, A, K, M, Q, O, R) and `FileDocument.scoreInfo`.

### Shared music libraries

- `src/music/rational.ts`: exact duration normalization and comparison.
- `src/music/scoreSnapshot.ts`: pure written-measure/event extraction and runtime indexes.
- `src/music/documentSchema.ts`: persisted document and annotation normalization.
- `src/music/annotationLayout.ts`: pure musical-position-to-overlay placement.
- `src/utils/abcMetadata.ts`: pure ABC header metadata parsing, validation (key, meter, tempo), and non-destructive header updates.
- `src/utils/fileHistory.ts`: pure edit history creation, action classification, categorization, and history restoration.

These modules are independent of React and Electron UI code.

### abcjs render and playback pipeline

- abcjs exclusively owns its score DOM.
- Existing audio preparation, repeat occurrences, cursor tracking, and playback timing remain.
- React owns a sibling overlay layer and derives its geometry from the current render.

### Renderer-to-main context

`MusicContextSnapshot` is a validated serialized DTO containing document ID, revision, raw ABC, selection, and canonical annotations. It remains distinct from the main-process runtime model.

### Electron agent runtime

- Validates `MusicContextSnapshot` at the IPC boundary.
- Constructs one immutable `ScoreSnapshot` per request.
- Runs one visible Music Tutor with internal profile modules.
- Exposes routing plus six score tools, including validated measure and whole-score replacement proposals.
- Projects Pi tool lifecycle into correlated renderer-safe events.
- Writes diagnostic logs to the local agent trace store.
- Never mutates `FileDocument` directly.

### Persistence

- `FileDocument` values, including accepted annotations, remain in IndexedDB.
- Active-file and workspace preferences remain in their existing stores.
- File-scoped conversation history uses schema version 4. IndexedDB is the full-fidelity store;
  local storage is a compact synchronous mirror and fallback. A valid v4 store is authoritative.
  Legacy v2/v3 stores are consulted only when v4 is absent or invalid, and the v3 key is preserved
  for rollback.

## 3. Core data contracts

```ts
type ScoreAnchor = {
  startMeasure: number;
  endMeasure: number;
  beat?: number;
  voiceId?: string;
  abcOffset?: number;
  playbackSeconds?: number;
  playbackFraction?: number;
  label?: string;
};

type RationalDuration = {
  numerator: number;
  denominator: number;
};

type MusicalPosition = {
  measure: number;
  offset: RationalDuration;
};

type AnnotationKind =
  | 'chord'
  | 'modulation'
  | 'voice-leading'
  | 'explanation';

type AnnotationBase = {
  id: string;
  span: { startMeasure: number; endMeasure: number };
  label: string;
  body: string;
  source: 'user' | 'assistant';
  agentProfiles?: AgentProfileId[];
  createdAt: string;
  updatedAt: string;
};

type Annotation =
  | AnnotationBase & {
      kind: 'chord';
      position: MusicalPosition;
      chordSymbol: string;
      romanNumeral?: string;
    }
  | AnnotationBase & {
      kind: 'modulation' | 'voice-leading' | 'explanation';
    };
```

The same canonical `Annotation` type crosses document, context, IPC validation, runtime snapshot, tools, and overlay boundaries. Legacy annotation records are normalized at load time before React consumes them.

## 4. State invariants

- `startMeasure <= endMeasure`; a single selection uses equal values.
- Playback and chat-link navigation use `startMeasure` for a range.
- Prompt snapshots never change after send.
- One request creates one parsed `ScoreSnapshot`; tools do not reparse the score.
- Tools and tool events cannot mutate document state directly; the renderer may apply a validated proposal through the document store after an explicit user action.
- Apply All validates all eligible proposals and commits all or none in one renderer transaction.
- Pending proposals are actionable only when document ID and revision still match; otherwise they display Outdated.
- Annotation edits do not create ABC revisions.
- Deleting chat cannot delete accepted document annotations.
- abcjs and React never own the same DOM subtree.

## 5. Normalization and migration

- `storageAdapter.getDocuments()` invokes pure `normalizeFileDocument` for IndexedDB and memory paths.
- `useDocumentStore` owns UI state and mutations, not schema migration.
- Legacy annotation kinds normalize to the canonical four-kind model.
- Conversation v2 and v3 migrate to v4 with ordered structured parts, normalized stopped status for
  interrupted streams, token usage, and a persisted pending queue. Legacy v3 data remains untouched.
- Durable hydration prefers valid version-4 IndexedDB data and falls back to legacy data only when v4
  is absent or invalid.
- No IndexedDB object-store migration is needed because annotations remain inline.

## 6. Failure boundaries

- Invalid ABC or invalid normalized score data prevents passage tools from running.
- IPC validation rejects malformed ranges, rational values, annotations, and oversized fields.
- Provider and tool errors are summarized without exposing credentials or full score payloads.
- Request and tool events are correlated by `requestId` and `toolCallId`.
- Abort, file switch, chat close, reload, or window destruction causes late events to be ignored.
- Failed autosave retains in-memory data and surfaces the existing save error.

## 7. Deferred architecture

The current data model deliberately omits analysis fingerprints, stale annotation state, dependency tracking, regeneration metadata, agent-initiated insertion/deletion, and metadata mutation. Those require a separate next-sprint design rather than dormant fields in the MVP schema.
