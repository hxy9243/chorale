# File Workspace Architecture

Date: 2026-07-25  
Source: Figma frame `Chorale / Functional implementation overview`

## 1. Goal

Define the implementation architecture implied by the current Figma design so frontend work can proceed with explicit contracts instead of letting state shape emerge from React components.

## 2. Runtime architecture

The design board breaks the system into six cooperating layers.

### UI layer

Owns visible workspace composition:

- files rail
- score and ABC split
- playback dock
- chat panel

The UI layer should render from domain state, not own the canonical file model itself.

### FileSessionController

Owns volatile session concerns for the currently open file:

- active file identity
- current revision
- active score anchor
- in-flight rebuild cancellation
- view preferences such as divider position and visible panes

This controller is the handoff point between user interactions and asynchronous score rebuild work.

### FileDocument store

Owns durable file content and durable objects:

- source ABC
- score info
- annotations
- chat threads
- stored revisions

This is the product boundary for persistence. Chat must read from here rather than invent shadow copies of durable state.

### ABC render and audio pipeline

Owns revision-based derived outputs:

- ABC validation
- rendered score output
- playback-ready audio state

The pipeline should publish results tagged with the source revision they were built from. The UI must ignore stale results.

### Chat orchestrator and score tools

Owns AI-adjacent orchestration:

- reading active file context
- reading the active score anchor
- proposing metadata, annotation, or ABC mutations
- applying approved changes through durable file contracts

This layer should not mutate React state directly. It should produce proposals or invoke document-level commands.

### IndexedDB repository

Owns local persistence for file documents:

- file snapshots
- annotations
- chat threads
- restorable revisions

The design implies browser persistence stronger than the prototype's single localStorage transcript.

## 3. Core invariants

### Shared-anchor invariant

Playback, chat, and annotations must reference the same `ScoreAnchor` object. Chorale should not maintain one selection model for playback and another for chat.

### Revision invariant

Rendered score, validation state, and synth state must always correspond to the same committed source revision.

### Durability invariant

Chat threads are disposable. File annotations and score metadata are durable file objects and must outlive any single chat thread.

### Proposal invariant

AI-driven edits should be reviewable before they become durable. Tool execution should not silently rewrite file content.

## 4. Suggested TypeScript contracts

```ts
type FileId = string;
type ChatThreadId = string;
type AnnotationId = string;
type RevisionNumber = number;

type ScoreAnchor = {
  measure: number;
  beat?: number;
  voiceId?: string;
  abcOffset?: number;
  playbackSeconds?: number;
  playbackFraction?: number;
};

type ScoreInfo = {
  title?: string;
  subtitle?: string;
  composer?: string;
  key?: string;
  meter?: string;
  tempoText?: string;
  measures?: number;
};

type Annotation = {
  id: AnnotationId;
  kind: 'analysis' | 'harmony' | 'phrase' | 'comment' | 'edit-note';
  label: string;
  body: string;
  anchor: ScoreAnchor;
  createdAt: string;
  updatedAt: string;
  source: 'user' | 'assistant';
};

type ScoreVersion = {
  revision: RevisionNumber;
  abcSource: string;
  createdAt: string;
  reason: 'import' | 'manual-edit' | 'tool-apply' | 'restore';
};

type FileDocument = {
  id: FileId;
  name: string;
  sourceType: 'musicxml' | 'mxl' | 'abc';
  abcSource: string;
  revision: RevisionNumber;
  scoreInfo: ScoreInfo;
  annotations: Annotation[];
  chats: ChatThreadSummary[];
  versions: ScoreVersion[];
};

type ChatThreadSummary = {
  id: ChatThreadId;
  title: string;
  messageCount: number;
  updatedAt: string;
};

type BuildResult = {
  fileId: FileId;
  revision: RevisionNumber;
  validation: 'valid' | 'invalid';
  errors: Array<{ message: string; line?: number; column?: number }>;
  renderedTuneCount: number;
  hasPlayback: boolean;
};
```

These are not final, but they match the shape implied by the Figma implementation board and are a better boundary than ad hoc component state.

## 5. Event flows

### Flow A: score click to seek

1. Score surface resolves the clicked note or system hit.
2. The app constructs a `ScoreAnchor`.
3. `FileSessionController` sets the active anchor.
4. Playback seeks to the resolved musical location.
5. Chat composer and annotation affordances attach the same anchor.

### Flow B: ABC edit to atomic rebuild

1. Editor updates draft ABC immediately.
2. Validation is debounced.
3. A new revision number invalidates older async work.
4. Validation, score render, and synth preparation run in parallel.
5. Only the latest completed revision may commit its outputs.

### Flow C: chat tool to durable mutation

1. Chat tool reads `FileDocument` plus the active `ScoreAnchor`.
2. Tool creates a proposal or mutation command.
3. Approved mutation updates the durable document.
4. Mutation produces a new file revision when source changes.
5. The chat thread records the action, but the durable object lives on the file.

## 6. Storage guidance

Use local persistence appropriate for structured file objects.

Recommended split:

- IndexedDB for `FileDocument`, annotations, versions, and thread summaries
- local UI preferences for pane visibility or divider state
- no durable file content in ephemeral chat-only storage

The current localStorage conversation store can remain during migration, but it should not stay the long-term persistence boundary.

## 7. Migration note

The current prototype already proved:

- unsaved ABC can be captured for chat
- Pi integration can stream through a narrow adapter
- local transcript persistence works

It did not prove:

- file-owned persistence
- anchor unification across score, playback, and chat
- reviewable score mutations
- revision-gated rebuild correctness

Implementation should preserve the proven chat adapter boundary while replacing the surrounding state model.
