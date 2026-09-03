---
title: "Chat With Music Sheet and Agent Tooling"
description: "Specification for the passage-aware Music Tutor chat panel, assistant-ui runtime integration, Streamdown rendering with score references, structured message parts, dual-lane queue with steering, and token accounting"
category: "agent-chat"
date: 2026-08-05
updated: 2026-09-02
status: "in-progress"
source_files:
  - src/components/AgentChatPanel.tsx
  - src/components/chat/ChoraleExternalStoreAdapter.ts
  - src/components/chat/ChoraleQueueAdapter.ts
  - src/components/chat/ChoraleStreamdownMessage.tsx
  - src/components/chat/ChoraleReasoningView.tsx
  - src/components/chat/ChoraleToolDisplay.tsx
  - src/components/chat/ChoraleTokenUsage.tsx
  - src/components/chat/ChoraleQueueList.tsx
  - src/components/AnnotationProposalCard.tsx
  - src/components/ScoreChangeProposalCard.tsx
  - src/agent/DesktopSheetAgent.ts
  - src/agent/conversationStore.ts
  - src/agent/measureReferences.ts
  - src/agent/proposalActions.ts
  - src/agent/promptUtils.ts
  - src/agent/aiTypes.ts
  - src/agent/types.ts
  - electron/ai/sheetAgentRuntime.ts
  - electron/ai/sheetTools.ts
  - electron/ai/agentProfiles.ts
  - electron/ai/agentTrace.ts
  - electron/ai/controller.ts
  - electron/ipcChannels.ts
  - electron/ipcValidation.ts
  - electron/preload.ts
test_files:
  - src/components/__tests__/AgentChatPanel.test.tsx
  - src/components/chat/__tests__/ChoraleStreamdownMessage.test.tsx
  - src/components/chat/__tests__/ChoraleQueueAdapter.test.ts
  - src/components/chat/__tests__/ChoraleExternalStoreAdapter.test.ts
  - src/components/__tests__/AnnotationProposalCard.test.tsx
  - src/agent/__tests__/sheetToolFlow.test.ts
  - src/agent/__tests__/sheetAgentRuntime.integration.test.ts
  - src/agent/__tests__/DesktopSheetAgent.test.ts
  - src/agent/__tests__/conversationStore.test.ts
  - src/agent/__tests__/controller.test.ts
  - src/agent/__tests__/ipcValidation.test.ts
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
  - spec/score-surface.md
  - spec/interaction-model.md
  - spec/agent-tools-and-profiles.md
  - spec/annotations-and-proposals.md
---

# Chat With Music Sheet and Agent Tooling

Date: 2026-08-05
Updated: 2026-09-02
Status: Stage 3 (Agent Creation & Editing)

## 1. Goal

Chat is a passage-aware Music Tutor attached to the active score file. Students and hobbyists can ask theory questions, see internal profile routing and tool progress, receive grounded Markdown with score references, inspect model reasoning, review annotation and score change proposals, queue follow-ups, and steer live agent runs safely.

## 2. Product rules

- Chat history belongs to the active file; provider/model selection remains global.
- Prompt send captures an immutable `MusicContextSnapshot` containing ABC, document identity and revision, active range, and canonical annotations.
- One visible Music Tutor internally selects predefined analysis profiles.
- Passage-specific claims require registered score tools.
- Tool calls never mutate a document directly. Score replacements remain proposals until the user applies one in the renderer.
- Accepted annotations outlive the thread that created them.
- Existing provider settings, streaming, cancellation, error mapping, panel resize, and desktop-only production behavior remain unchanged.
- Assistant-ui owns presentation/runtime coordination; Chorale remains the source of truth for persistence, score context, proposals, and Pi execution.

## 3. Panel structure

### Header

- Thread title/history selector and active-file subtitle.
- Thread deletion, AI settings, and close actions.
- Existing resizable and persisted panel behavior.

### Conversation Viewport

- Driven by assistant-ui `ThreadPrimitive.Viewport` with pinned-bottom auto-scrolling.
- User prompts styled in a light warm sandstone ledger tone (`--color-chat-user-surface`) with their captured range chip.
- Visible profile route such as `Harmony analysis`.
- Ordered structured parts: reasoning traces, tool activity, and text blocks.
- Tool rows correlated by `toolCallId` with friendly name, safe summary, running/success/error status, and elapsed duration badge.
- Collapsible thinking traces, collapsed by default, with lazy-mounted content, streaming status, and stopped/complete state. Redacted reasoning displays a neutral placeholder.
- Sanitized CommonMark/GFM assistant messages rendered via Streamdown with score reference links (`[m. 5](#measure-5)`), disabled raw HTML, and non-navigating external links.
- Inline proposal cards styled like sheet annotations with individual Edit and Reject actions, and turn-level Apply All.
- Token accounting footer at the end of completed assistant messages: `Round N tokens · Conversation M tokens` with expandable breakdown (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`). No cost display.
- Pending message queue list with edit, remove, reorder, "run next", and "steer now" controls.

### Composer

- Driven by assistant-ui `ComposerPrimitive.Root` and `ComposerPrimitive.Input` (auto-resizing textarea via `react-textarea-autosize`).
- Provider/model selector and thinking level selector (`off` through `max`).
- Active range chip such as `mm. 5–8`.
- Prompt input with keyboard shortcuts:
  - Idle `Enter`: send immediately.
  - Busy `Enter`: append a FIFO follow-up.
  - `Shift+Enter`: newline.
  - Busy `Ctrl/Cmd+Shift+Enter`: priority steer.
  - `Escape`: stop the active run while preserving draft and pending queue.
  - IME composition confirmation never submits.

## 4. Context and runtime snapshots

The renderer sends `MusicContextSnapshot`, a validated transport DTO. `annotations` is a required copied `Annotation[]`; no separate `MusicAnnotation` model exists.

Electron constructs one immutable normalized `ScoreSnapshot` per request. Every profile and score tool in that request uses the same snapshot. The main process, not React, owns parsing and tool execution.

The current prompt may reuse that request's parsed snapshot. Historical user prompts must instead be formatted from the `MusicContextSnapshot` captured with each turn so score edits do not combine old revision metadata or annotations with current score contents. Queued items snapshot their music context at enqueue time so context remains immutable regardless of later score edits.

## 5. Profiles and tools

The mandatory routing tool is `select_analysis_profile`. Profiles are `general`, `harmony`, `voice-leading`, and `form-phrase`; multiple profiles may be selected.

The score tool suite is:

- `get_score_summary`
- `read_measure_range`
- `get_annotations`
- `propose_annotations`
- `propose_measure_replacement`
- `propose_score_edit`

`read_measure_range` returns ABC source slices for any continuous measure range in the score. `propose_measure_replacement` treats the active selection as an optional hint, requires that its proposed range has been read, and emits at most one validated replacement proposal per run. There is no direct document mutation or navigation tool. Tool execution durations are measured with high-resolution timestamps.

## 6. Proposal review

Proposal cards remain read-only until the run completes.

- Edit validates and updates one staged proposal.
- Reject collapses and excludes one proposal.
- Apply All validates every remaining proposal and applies all or none in one renderer transaction.
- A file or revision mismatch labels pending proposals **Outdated** and disables their actions.
- Failed or aborted runs label unapplied proposals unavailable.

Applying annotations does not increment the ABC revision. Deleting a chat thread deletes its pending proposal records but not accepted annotations.

## 7. Markdown and links

Raw HTML is disabled (`allowedTags: []`) and there is no `dangerouslySetInnerHTML` rendering path.

```md
[m. 5](#measure-5)
[mm. 5–8](#measure-5-8)
```

A valid score link:

1. activates its normalized `ScoreAnchor` range;
2. scrolls and focuses `startMeasure`;
3. seeks paused playback to the range start with repeat-aware occurrence behavior;
4. never starts playback automatically.

Model reasoning is represented as a first-class structured message part rather than raw strings. External URL opening is deferred and safely disabled.

Markdown tables (GFM) render as clean, accessible semantic tables wrapped in horizontal overflow containers (`.chorale-table-container`), styled to match the Nordic Ledger design system. Streamdown built-in controls buttons (copy, download, fullscreen) are disabled (`controls={false}`) and whitespace inside message markdown is normalized (`white-space: normal`) to prevent synthetic gap artifacts between prose and table blocks.

## 8. IPC and Runtime Events

The IPC channels include:
- `AI_IPC.sendChat`: starts a new chat run.
- `AI_IPC.steerChat`: injects a steering prompt into an active run via Pi Agent's native `agent.steer()`.
- `AI_IPC.abortChat`: aborts the active run.

Runtime events:
```ts
type AIEvent =
  | {
      type: 'chat-start';
      requestId: string;
      connectionId: string;
      modelId: string;
      providerKind: AIProviderKind;
    }
  | {
      type: 'chat-delta';
      requestId: string;
      partId?: string;
      partType: 'text' | 'reasoning';
      text: string;
    }
  | {
      type: 'profile-route';
      requestId: string;
      profiles: AgentProfileId[];
    }
  | {
      type: 'tool-start';
      requestId: string;
      toolCallId: string;
      toolName: string;
      summary: string;
      startTime?: string;
    }
  | {
      type: 'tool-done';
      requestId: string;
      toolCallId: string;
      toolName: string;
      status: 'success' | 'error';
      summary: string;
      durationMs?: number;
      endTime?: string;
    }
  | { type: 'proposal-created'; requestId: string; proposal: AnnotationProposal }
  | { type: 'score-proposal-created'; requestId: string; proposal: ScoreChangeProposal }
  | { type: 'steer-accepted'; requestId: string; messageId: string }
  | { type: 'chat-done'; requestId: string; usage?: RoundUsage }
  | { type: 'chat-error'; requestId: string; code: AIErrorCode; message: string }
  | {
      type: 'oauth-update';
      flowId: string;
      status: 'starting' | 'pending' | 'complete' | 'cancelled' | 'error';
      details?: OAuthUpdateDetails;
    };
```

Text and reasoning deltas are batched in the main process at ~50 ms intervals and synchronously flushed before every tool start, proposal creation, turn completion, chat completion, error, or abort.

## 9. Conversation Storage v4

The per-file conversation schema is version 4:
- Messages store ordered structured parts (`ChatMessagePart`: `text`, `reasoning`, `tool`).
- Completed assistant messages store aggregated `RoundUsage`.
- Threads store persisted pending messages (`QueuedChatMessage[]`).
- Migration from v2 and v3:
  - Parses legacy `<think>...</think>` tags (including unclosed tags from interrupted runs) into structured `text` and `reasoning` parts.
  - Converts interrupted `streaming` status to `stopped`.
  - Upgrades without modifying the v3 key (`chorale.pi-agent-conversation.v3`) to maintain rollback safety.
  - Writes v4 to `chorale.pi-agent-conversation.v4` across IndexedDB and local storage.
  - Queue-only persistence path preserves queued items added during streaming without prematurely persisting partial assistant states.
  - Restored queues never auto-run on app restart; restored steer items normalize to FIFO queue items.
