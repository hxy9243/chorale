# Pi Agent Chat for the Current Sheet

Status: prototype  
Branch: `spike/pi-sheet-chat`

## Goal

Add a side-panel conversation to Chorale where an agent can answer questions about the music currently open in the app. The conversation must use the exact in-memory score state—including unsaved ABC edits—and retain its history across reloads.

The prototype uses Pi's low-level agent SDK with a deterministic mock model. This proves Chorale's state, UI, streaming, and persistence boundaries without requiring a paid provider or storing credentials.

## Product decisions

- Chat is read-only. The agent can explain or suggest changes but cannot alter the score.
- Chorale owns the React interface, conversation schema, and runtime contract.
- Pi is used behind that contract; Pi UI components and Pi-specific persisted message types are not product boundaries.
- Each user turn captures an immutable music-context snapshot.
- A mock model is the prototype default. Real provider and OAuth configuration are follow-up work.

## Context model

```ts
type MusicContextSnapshot = {
  id: string;
  revision: number;
  capturedAt: string;
  fileName: string;
  abc: string;
  selection?: {
    measureStart?: number;
    measureEnd?: number;
    abcRange?: { start: number; end: number };
  };
  annotations?: Array<{
    id: string;
    kind: 'chord' | 'phrase' | 'harmony' | 'fingering' | 'comment' | string;
    label: string;
    description?: string;
    measureStart?: number;
    measureEnd?: number;
    abcRange?: { start: number; end: number };
  }>;
};
```

Prototype scope:

- `abc`, `fileName`, and `revision`
- conversation history

Future scope already represented by the boundary:

- the user's current range, note, or measure selection
- existing musical annotations, including chord and phrase descriptions
- other structured score analysis

The future fields are optional so they can be added to the snapshot producer without replacing the chat UI or agent adapter.

## Prototype architecture

```text
App score state
  |
  +-> captureMusicContext()
  |       |
  |       +-> immutable ABC snapshot per turn
  |
  +-> AgentChatPanel
          |
          +-> Chorale conversation store -> localStorage
          |
          +-> PiSheetAgent
                  |
                  +-> @earendil-works/pi-agent-core Agent
                  +-> deterministic mock stream function
                  +-> current snapshot embedded in the user turn
```

The mock response must be generated through Pi's agent loop, not by bypassing the SDK in the React component. The mock reads the current context block and returns a short streamed acknowledgement with score-derived facts.

## UX

- An `Ask` button in the header opens and closes a right-side panel.
- The score stays primary; the chat is a secondary rail on wide screens and an overlay on narrow screens.
- The panel provides an empty state, transcript, current-context badge, composer, Send, Stop, Clear, loading, and error states.
- Sending is disabled when there is no ABC context or the composer is empty.
- User turns display the file name and ABC revision captured for that request.
- Editing ABC after sending does not rewrite prior context badges or the in-flight request.
- History is restored after reload and may be cleared explicitly.

## Persistence

Persist a versioned Chorale-owned record:

```ts
type PersistedConversation = {
  version: 1;
  messages: ChatMessage[];
};
```

Do not persist Pi internal state, provider credentials, or refresh tokens. On startup, reconstruct the Pi agent's conversational state from the validated Chorale messages.

## Validation criteria

- The production Vite build can bundle the chosen Pi package.
- A question is sent through a Pi `Agent` instance and the mock answer streams into the panel.
- The mock answer demonstrably sees the current unsaved ABC.
- Every user message points to an immutable context revision.
- Multiple turns form one conversation.
- Reload restores the transcript.
- Stop prevents late stream events from changing the transcript.
- Existing tests, new focused tests, lint, and production build pass.

## Follow-up architecture

Production web mode should put durable credentials and Pi provider calls behind a same-origin service. Electron should run the adapter in the main process and expose a narrow preload API with OS-backed secret storage. Both modes should retain the same React panel and `MusicContextSnapshot` contract.

ChatGPT subscription OAuth remains optional. It should ship only after callback handling, PKCE/state validation, secure token storage, refresh, logout, and failure recovery work in both supported runtimes.

### Global agent configuration

A production iteration needs an app-level settings dialog that remains available when chat is closed:

- provider and model selection
- thinking level when the selected model supports it
- API-key or subscription-login status
- custom OpenAI-compatible endpoint
- connection test with a redacted failure message
- conversation-persistence and diagnostic-logging preferences

Secrets are write-only after save. In web mode the dialog talks to the same-origin agent service; in Electron it talks through the validated preload API to OS-backed secret storage. Provider credentials never become React state, conversation content, or local-storage fields.

### Why Pi remains a candidate

Pi's low-level agent and AI packages fit the multi-provider, streaming, and optional subscription-login direction. Chorale does not adopt Pi's prebuilt web UI or its internal persistence format. Keeping `MusicContextSnapshot`, chat messages, and the transport contract under Chorale's control makes Vercel AI SDK or OpenAI Agents SDK viable fallbacks if the production web or Electron spikes expose a blocking Pi limitation.
