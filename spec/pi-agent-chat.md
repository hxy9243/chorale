# Chat With Music Sheet & Agent Tooling

Date: 2026-07-29
Status: Electron transport and provider selection implemented; agent tools remain follow-up work

## 1. Goal

Make chat a score-aware workspace panel that can analyze, reference, annotate, and propose structural mutations against the active file and the user's current musical anchor.

The product is a file-scoped analysis and editing surface attached to the same state as the score, ABC editor, and playback dock.

## 2. Product rules

- Chat belongs to the active file, not to the app globally.
- Provider/model selection is global across files and threads.
- Current score anchor is first-class chat context.
- Grounded answers reference score data, pitch structures, and harmonic annotations.
- Durable score and annotation mutations outlive the chat thread that created them.
- Agent tool execution is transparently displayed to the user via inline execution indicators and review cards.
- Chat Panel is drag-resizable (280px–680px width) with persistent position in workspace grid.

## 3. Chat panel structure

The panel provides four vertical zones and a left resize handle:

### Header

- thread title and history selector
- active file subtitle
- the workspace header gear opens AI provider settings
- close action; persistent header button allows reopening chat
- panel drag-to-resize handle on left border (minimum 280px, maximum one third of the viewport, default 392px when space allows)

### Conversation

- anchor chip (e.g. `Selected m. 5–8`)
- user prompt bubbles
- assistant response messages with markdown formatting
- visible tool execution indicators (`Executing analyze_harmonic_cadence...`)
- interactive mutation review cards (Diff view for proposed ABC edits or Annotation additions)

### Composer

- attached anchor chip
- compact global provider/model popover
- prompt input area
- send prompt action
- stop action while a response is streaming

### Thread model

Conversation history is per-file in versioned renderer local storage. Switching files loads the corresponding chat thread automatically. Each assistant message records:

```ts
{
  connectionId: string;
  providerKind: AIProviderKind;
  modelId: string;
}
```

This provenance is retained when the global selection later changes or the connection is deleted.

## 4. Agent Tool Suite

The Pi Agent operates with a native JSON tool registry (`tools: [...]` in `@earendil-works/pi-agent-core`).

### 4.1 Read & Query Tools

- **`get_score_structure`**: Returns key, meter, tempo, measure count, time signatures, and voice declarations.
- **`read_abc_range`**: `{ startMeasure: number, endMeasure: number }` -> returns exact ABC source text for target measures.
- **`get_annotations`**: Returns all active harmonic, key modulation, and Roman numeral annotations on the file.

### 4.2 Annotation & Analysis Mutation Tools

- **`add_annotation`**: `{ range: { startMeasure, endMeasure }, kind: 'key-change'|'roman-numeral'|'chord-symbol'|'phrase-structure', label: string, harmonicData?: { key?, romanNumeral?, chordSymbol? }, body: string }` -> attaches a new harmonic annotation track or badge to the score.
- **`update_annotation`**: `{ id: string, ... }` -> modifies existing annotation fields.
- **`delete_annotation`**: `{ id: string }` -> removes an annotation.

### 4.3 ABC Score Mutation Tools

- **`replace_abc_range`**: `{ startMeasure: number, endMeasure: number, newAbcSnippet: string, rationale: string }` -> proposes measure-level ABC edits (e.g. reharmonization, transposition, rhythm correction).
- **`set_score_metadata`**: `{ title?, composer?, tempo?, key? }` -> modifies ABC header metadata.

### 4.4 Navigation & UI Tools

- **`navigate_to_measure`**: `{ measure: number, beat?: number }` -> programmatically updates `ScoreAnchor` and smooth-scrolls the score view to bring target measures into focus.

## 5. Review & Proposal Workflow for Agent Mutations

To prevent destructive or unexpected score edits:

1. **Tool Trigger**: When the agent calls a mutating tool (`replace_abc_range` or `add_annotation`), execution outputs a non-blocking **Proposal Review Card** into the conversation stream.
2. **Visual Diff**:
   - For ABC edits: Side-by-side or inline unified diff showing original measure ABC vs proposed measure ABC.
   - For Annotations: Visual badge preview showing proposed Roman numerals / key modulation range.
3. **User Action**:
   - **Apply**: Commits the mutation into `FileSessionController`, creating a new durable `ScoreVersion` revision.
   - **Reject**: Dismisses the proposal card without modifying score state.

## 6. Context contract

```ts
type ChatContext = {
  fileId: string;
  fileName: string;
  revision: number;
  abc: string;
  scoreInfo?: ScoreInfo;
  activeAnchor?: ScoreAnchor | null;
  selectedRange?: {
    measureStart: number;
    measureEnd?: number;
    abcStart?: number;
    abcEnd?: number;
  };
  visibleAnnotations: ExtendedAnnotation[];
  availableTools: ScoreToolName[];
  selection: AISelection;
};
```

Minimum requirement:

- every prompt send captures the current file revision
- every send includes the active anchor (if selected)
- assistant answers cite measure anchors
- agent responses can issue structured tool calls

## 7. Electron transport contract

`PiSheetAgent` runs in Electron’s main process. React sends a `SheetAgentRequest` through the typed preload bridge and receives:

```ts
type AIEvent =
  | { type: 'chat-start'; requestId: string; connectionId: string; modelId: string; providerKind: AIProviderKind }
  | { type: 'chat-delta'; requestId: string; text: string }
  | { type: 'chat-done'; requestId: string }
  | { type: 'chat-error'; requestId: string; code: AIErrorCode; message: string }
  | { type: 'oauth-update'; flowId: string; status: string; details?: OAuthUpdateDetails };
```

- Events are matched to request or OAuth flow IDs.
- The renderer subscribes before sending, buffers early events until it receives the request ID, and removes its listener when the request settles or the component unmounts.
- Stop, file switch, panel unmount, reload, and window destruction abort Pi and the upstream request.
- A missing or invalid global provider/model selection disables the composer.
- When the preload bridge is absent, the panel displays “AI providers require the Chorale desktop app” and does not instantiate Pi or attempt a direct provider request.
- The production implementation has no silent faux-provider fallback.

## 8. Implementation status

Current branch provides:

- file-scoped chat panel with toggle control in header
- horizontal drag-to-resize functionality (280px–680px)
- per-file transcript persistence
- active score anchor attachment and display in composer
- Electron IPC-backed Pi streaming and cancellation
- six provider kinds and multiple named connections
- global provider/model selector and cached model catalogs
- assistant-message provider provenance
- desktop-required browser state

Planned next steps:

- Tool execution handler with reviewable proposal card UI
- Annotation tool bindings linked to score surface overlays
