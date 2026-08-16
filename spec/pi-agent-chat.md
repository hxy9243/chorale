---
title: "Chat With Music Sheet and Agent Tooling"
description: "Specification for the passage-aware Music Tutor chat panel, profile routing, score tools, Markdown formatting with score references, thinking traces, and proposal review"
category: "agent-chat"
date: 2026-08-05
updated: 2026-08-15
status: "implemented"
source_files:
  - src/components/AgentChatPanel.tsx
  - src/components/MarkdownMessage.tsx
  - src/components/AnnotationProposalCard.tsx
  - src/agent/DesktopSheetAgent.ts
  - src/agent/conversationStore.ts
  - src/agent/measureReferences.ts
  - src/agent/proposalActions.ts
  - src/agent/promptUtils.ts
  - src/agent/aiTypes.ts
  - electron/ai/sheetAgentRuntime.ts
  - electron/ai/sheetTools.ts
  - electron/ai/agentProfiles.ts
  - electron/ai/agentTrace.ts
test_files:
  - src/components/__tests__/AgentChatPanel.test.tsx
  - src/components/__tests__/MarkdownMessage.test.tsx
  - src/components/__tests__/AnnotationProposalCard.test.tsx
  - src/agent/__tests__/sheetToolFlow.test.ts
  - src/agent/__tests__/sheetAgentRuntime.integration.test.ts
  - src/agent/__tests__/DesktopSheetAgent.test.ts
  - src/agent/__tests__/conversationStore.test.ts
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
Updated: 2026-08-15  
Status: Implemented in desktop app

## 1. Goal

Chat is a passage-aware Music Tutor attached to the active score file. Students and hobbyists can ask theory questions, see internal profile routing and tool progress, receive grounded Markdown with score references, inspect model reasoning, and review annotation proposals.

## 2. Product rules

- Chat history belongs to the active file; provider/model selection remains global.
- Prompt send captures an immutable `MusicContextSnapshot` containing ABC, document identity and revision, active range, and canonical annotations.
- One visible Music Tutor internally selects predefined analysis profiles.
- Passage-specific claims require registered score tools.
- Tool calls never mutate a document.
- Accepted annotations outlive the thread that created them.
- Existing provider settings, streaming, cancellation, error mapping, panel resize, and desktop-only production behavior remain unchanged.

## 3. Panel structure

### Header

- Thread title/history selector and active-file subtitle.
- Thread deletion, AI settings, and close actions.
- Existing resizable and persisted panel behavior.

### Conversation

- User prompts with their captured range chip.
- Visible profile route such as `Harmony analysis`.
- Tool rows correlated by `toolCallId` with compact start/success/error summaries.
- Collapsible thinking traces (`<think>...</think>`) displaying reasoning progress.
- Sanitized CommonMark/GFM assistant messages.
- Inline proposal cards with individual Edit and Reject.
- One Apply All action for the assistant turn; no individual Apply buttons.

### Composer

- Existing provider/model selector.
- Thinking level selector (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) persisted in local storage (`chorale.agent.thinkingLevel`).
- Active range chip such as `mm. 5–8`.
- Prompt input, send action, and streaming stop action.

## 4. Context and runtime snapshots

The renderer sends `MusicContextSnapshot`, a validated transport DTO. `annotations` is a required copied `Annotation[]`; no separate `MusicAnnotation` model exists.

Electron constructs one immutable normalized `ScoreSnapshot` per request. Every profile and score tool in that request uses the same snapshot. The main process, not React, owns parsing and tool execution.

## 5. Profiles and tools

The mandatory routing tool is `select_analysis_profile`. Profiles are `general`, `harmony`, `voice-leading`, and `form-phrase`; multiple profiles may be selected.

The score tool suite is:

- `get_score_summary`
- `read_measure_range`
- `get_annotations`
- `propose_annotations`

`read_measure_range` returns exact rational musical positions and is capped at 32 measures per call. `propose_annotations` is capped at 32 proposals per run. There is no agent removal, ABC mutation, metadata mutation, or navigation tool.

## 6. Proposal review

Proposal cards remain read-only until the run completes.

- Edit validates and updates one staged proposal.
- Reject collapses and excludes one proposal.
- Apply All validates every remaining proposal and applies all or none in one renderer transaction.
- A file or revision mismatch labels pending proposals **Outdated** and disables their actions.
- Failed or aborted runs label unapplied proposals unavailable.

Applying annotations does not increment the ABC revision. Deleting a chat thread deletes its pending proposal records but not accepted annotations.

## 7. Markdown and links

Raw HTML is disabled and there is no `dangerouslySetInnerHTML` rendering path.

```md
[m. 5](#measure-5)
[mm. 5–8](#measure-5-8)
```

A valid score link:

1. activates its normalized `ScoreAnchor` range;
2. scrolls and focuses `startMeasure`;
3. seeks paused playback to the range start with repeat-aware occurrence behavior;
4. never starts playback automatically.

Model reasoning emitted inside `<think>...</think>` tags is automatically rendered as collapsible details disclosure elements, keeping thinking traces distinct from final answers. Other Markdown links are visually highlighted but non-navigating. External URL opening is deferred.

## 8. IPC events

The existing chat and OAuth event contracts remain. Passage tooling adds:

```ts
type PassageAIEvent =
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
    }
  | {
      type: 'tool-done';
      requestId: string;
      toolCallId: string;
      toolName: string;
      status: 'success' | 'error';
      summary: string;
    }
  | {
      type: 'proposal-created';
      requestId: string;
      proposal: AnnotationProposal;
    };
```

The main process projects Pi's built-in tool lifecycle into these events. Display summaries never contain full score results, credentials, or arbitrary raw error payloads.

Renderer events are matched by `requestId`; tool rows are additionally matched by `toolCallId`. Stop, file switch, unmount, reload, or window destruction aborts the run and causes late events to be ignored.

## 9. Conversation storage

The per-file conversation schema advances from version 2 to version 3 to persist proposal state, profile routes, and compact tool metadata. Version-2 data migrates with empty/default values. Accepted annotations remain in IndexedDB-backed `FileDocument`, not in the chat store.
