# File Workspace Architecture

Date: 2026-07-28  
Source: Figma frame `Chorale / Functional implementation overview`

## 1. Goal

Define the implementation architecture for Chorale's frontend workspace state, persistence boundaries, and rendering pipelines.

## 2. Runtime architecture

The system is structured into six cooperating layers:

### UI layer

Owns visible workspace composition:

- files rail (collapsible, drag-resizable 160px–420px)
- score and ABC split (drag-resizable 320px–720px)
- playback dock (max-width 800px)
- chat panel (drag-resizable 280px–680px)

The UI layer renders from domain document state.

### FileSessionController & Utilities (`utils/fileSession.ts`)

Owns session state and document helper operations for the open file:

- active file identity
- current revision counter
- active score anchor
- document version limiting (`limitScoreVersions`, max 10 revisions)
- view preferences (pane widths and visibility states)

### FileDocument store

Owns file content and durable objects:

- source ABC text
- score metadata (`title`, `composer`, `key`, `meter`, `tempoText`)
- annotations
- chat threads
- stored revisions (`ScoreVersion[]`)

### ABC render and audio pipeline (`utils/abcAudio.ts`, `utils/repeatPlayback.ts`)

Owns revision-based derived outputs:

- ABC syntax validation (debounced 140ms)
- rendered SVG score output (`abcjs.renderAbc`)
- WebAudio synth preparation and audio timing fixes
- repeat occurrence indexing and score cursor tracking

### Chat orchestrator and score tools (`components/AgentChatPanel.tsx`)

Owns AI conversation and score interaction:

- reading active file context and active `ScoreAnchor`
- proposing score metadata, annotation, or ABC edits
- per-file chat message history persistence

### Local Storage Repository

Owns workspace persistence:

- file document snapshots (`chorale.workspace.documents`)
- active file ID (`chorale.workspace.activeFileId`)
- editor preferences (`chorale.workspace.editorVisible`, `chorale.workspace.editorWidth`)
- debounced autosave (400ms delay)

## 3. Core invariants

### Shared-anchor invariant

Playback, chat, and score selection reference the same `ScoreAnchor` object.

### Revision invariant

Rendered score, validation state, and synth state correspond to the same committed source revision.

### Durability & History invariant

Document revisions are capped at 10 versions per document to prevent storage exhaustion while preserving undo capability.

### User Scroll Pause invariant

Auto-centering score scroll pauses for 2 seconds whenever manual user scrolling is detected.

## 4. TypeScript contracts (`src/types/document.ts`)

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
  label?: string;
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

type BuildResult = {
  fileId: FileId;
  revision: RevisionNumber;
  validation: 'valid' | 'invalid';
  errors: Array<{ message: string; line?: number; column?: number }>;
  renderedTuneCount: number;
  hasPlayback: boolean;
};
```

## 5. Persistence guidance

Current local storage layout:

- `chorale.workspace.documents`: JSON array of `FileDocument` snapshots
- `chorale.workspace.activeFileId`: string ID of active document
- `chorale.workspace.editorVisible`: boolean pane toggle
- `chorale.workspace.editorWidth`: clamped width in pixels (320–720)
- `chorale.chat.threads.${fileId}`: per-file chat transcript history

Document changes auto-save with a 400ms debounce. Revision history is trimmed to 10 entries per document.
