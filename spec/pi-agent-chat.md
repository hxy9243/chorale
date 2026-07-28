# Chat With Music Sheet

Date: 2026-07-28  
Status: design target informed by the `Chorale — Chat with Music Sheet · V1` Figma file

## 1. Goal

Make chat a score-aware workspace panel that can analyze, reference, and propose changes against the active file and the user's current musical anchor.

The product is a file-scoped analysis and editing surface attached to the same state as the score, ABC editor, and playback dock.

## 2. Product rules

- Chat belongs to the active file, not to the app globally.
- Current score anchor is first-class chat context.
- Grounded answers reference score data and musical structure.
- Durable score mutations outlive the chat thread that created them.
- Tool usage is visible to the user.
- Chat Panel is drag-resizable (280px–680px width) with persistent position in workspace grid.

## 3. Chat panel structure

The panel provides four vertical zones and a left resize handle:

### Header

- thread title and history selector
- active file subtitle
- close action; persistent header button allows reopening chat
- panel drag-to-resize handle on left border (width bounded 280px–680px, default 392px)

### Conversation

- anchor chip (e.g. `Selected m. 5`)
- user prompt bubbles
- assistant response messages with markdown formatting
- visible tool execution indicators
- durable mutation status cards

### Composer

- attached anchor chip
- prompt input area
- mode selector presets (`Analyze`, `Edit`, `Compose`)
- clear anchor action
- send prompt action

### Thread model

Conversation history is per-file (`chorale.chat.threads.${fileId}`) in local storage. Switching files loads the corresponding chat thread automatically.

## 4. Context contract

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
  visibleAnnotations: Annotation[];
  availableTools: ScoreToolName[];
};
```

Minimum requirement:

- every prompt send captures the current file revision
- every send includes the active anchor (if selected)
- assistant answers cite measure anchors

## 5. MVP implementation status

Current branch provides:

- file-scoped chat panel with toggle control in header
- horizontal drag-to-resize functionality (280px–680px)
- per-file transcript persistence
- active score anchor attachment and display in composer
- Pi adapter integration for response streaming
