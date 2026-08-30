---
title: "Agent Tools and Profiles Implementation Spec"
description: "Specification for internal analysis profiles, immutable ScoreSnapshot runtime, Pi score tools, and IPC event contracts"
category: "agent-tools"
date: 2026-08-05
updated: 2026-08-29
status: "implemented"
source_files:
  - electron/ai/agentProfiles.ts
  - electron/ai/sheetTools.ts
  - electron/ai/sheetAgentRuntime.ts
  - electron/ai/systemPrompt.ts
  - electron/ai/toolEvents.ts
  - src/agent/abcPrompt.ts
  - src/agent/promptUtils.ts
  - src/music/scoreSnapshot.ts
  - src/music/rational.ts
  - src/agent/musicContext.ts
  - src/agent/DesktopSheetAgent.ts
  - electron/ipcValidation.ts
test_files:
  - src/agent/__tests__/sheetTools.test.ts
  - src/agent/__tests__/agentProfiles.test.ts
  - src/agent/__tests__/sheetToolFlow.test.ts
  - src/agent/__tests__/toolEvents.test.ts
  - src/agent/__tests__/musicContext.test.ts
  - src/agent/__tests__/musicBenchmark.test.ts
  - src/agent/__tests__/promptUtils.test.ts
  - src/agent/__tests__/systemPrompt.test.ts
  - src/music/__tests__/scoreSnapshot.test.ts
related_specs:
  - spec/design.md
  - spec/pi-agent-chat.md
  - spec/file-workspace-architecture.md
  - spec/annotations-and-proposals.md
  - spec/agent-analysis-and-annotations.md
---

# Agent Tools and Profiles Implementation Spec

Date: 2026-08-05
Updated: 2026-08-29
Status: Implemented in `electron/ai/`, `src/agent/`, and shared music libraries

## 1. Purpose

Define the internal analysis profiles, immutable score runtime, Pi tools, and renderer-safe event contracts for Chorale's visible Music Tutor.

## 2. Runtime boundary

The renderer captures a serializable `MusicContextSnapshot` when the user sends a prompt:

```ts
type MusicContextSnapshot = {
  id: string; // immutable snapshot ID
  documentId: string;
  revision: number;
  capturedAt: string;
  fileName: string;
  abc: string;
  selection?: ScoreAnchor;
  annotations: Annotation[];
};
```

Electron validates the snapshot and constructs one immutable `ScoreSnapshot` for the run. The runtime snapshot holds normalized score metadata, written measures, voices, rationally positioned events, ABC source ranges, active key and meter state, and annotation indexes. Every tool reads that same object. Historical user turns are reconstructed from each turn's own captured `MusicContextSnapshot`; the current run's parsed score must not be reused for an older revision.

Pure score parsing and validation belong in shared non-React library modules. React components do not parse or normalize agent tool data.

## 3. Analysis profiles

| Profile ID | Visible name | Focus |
|---|---|---|
| `general` | General analysis | Basic explanation and synthesis across domains |
| `harmony` | Harmony analysis | Chord symbols, Roman numerals, cadences, tonicization, and modulation |
| `voice-leading` | Voice-leading analysis | Voice motion, tendency tones, crossings, parallels, and notable leaps |
| `form-phrase` | Form and phrase analysis | Phrase boundaries, cadence placement, repetition, contrast, and formal function |

Before making passage-specific claims, the agent calls:

```ts
type SelectAnalysisProfileInput = {
  profiles: AgentProfileId[];
};
```

The tool validates and deduplicates the requested IDs, returns their prompt modules, and emits a typed `profile-route` event. Multiple profiles are allowed for mixed questions. Profile state is scoped to the run and recorded with the assistant turn for display.

## 4. Musical time

Tool data uses exact rational durations:

```ts
type RationalDuration = {
  numerator: number;
  denominator: number;
};

type MusicalPosition = {
  measure: number;
  offset: RationalDuration;
};
```

`offset` is elapsed whole-note duration from the written barline. Values are normalized to a positive denominator and reduced form. Beat labels and SVG positions are derived, not stored in tool records.

## 5. Tool contracts

The runtime exposes six score tools in addition to `select_analysis_profile`.

### 5.1 `get_score_summary`

Input: `{}`

```ts
type ScoreSummaryResult = {
  title?: string;
  composer?: string;
  key?: string;
  keySignature: string;
  meter?: string;
  tempoText?: string;
  totalMeasures: number;
  voices: string[];
};
```

### 5.2 `read_measure_range`

```ts
type ReadMeasureRangeInput = {
  startMeasure: number;
  endMeasure: number;
};

type ReadMeasureRangeResult = {
  startMeasure: number;
  endMeasure: number;
  activeKeyAtStart?: string;
  activeMeterAtStart?: string;
  measures: Array<{
    measureNumber: number;
    abcSlice: string;
    activeKey: string;
    activeMeter: string;
    keyChange?: string;
    meterChange?: string;
  }>;
};
```

Rules:

- Measures are one-based, written, and inclusive; a pickup is measure 1.
- `endMeasure >= startMeasure`.
- One call may return any continuous written-measure range within the score.
- A failed call records no read authorization; authorization is committed only after every requested
  measure has been validated.

### 5.3 `get_annotations`

```ts
type GetAnnotationsInput = {
  startMeasure?: number;
  endMeasure?: number;
  kinds?: AnnotationKind[];
};

type GetAnnotationsResult = {
  annotations: Annotation[];
};
```

The result contains canonical annotations intersecting the range. Freshness and stale state are not part of this phase.

### 5.4 `propose_annotations`

```ts
type AnnotationProposalBase = {
  span: MeasureSpan;
  label: string;
  body: string;
};

type AnnotationProposalInput =
  | AnnotationProposalBase & {
      kind: 'chord';
      position: MusicalPosition;
      chordSymbol: string;
      romanNumeral?: string;
    }
  | AnnotationProposalBase & {
      kind: 'modulation' | 'voice-leading' | 'explanation';
    };

type ProposeAnnotationsInput = {
  annotations: AnnotationProposalInput[];
};

type ProposeAnnotationsResult = {
  proposedCount: number;
  proposalIds: string[];
};
```

The main process validates inputs and creates server-controlled IDs, timestamps, source, profiles, document ID, and source revision. A chord input requires a position within its span and a chord symbol. The tool emits typed `proposal-created` events and never mutates `FileDocument`.

### 5.5 `propose_measure_replacement`

The tool accepts an inclusive target span, a non-whitespace summary, and replacement ABC. It requires that
the proposed span has been read prior to proposing replacement music.
The active selection is an optional intent and navigation hint; it is not required and does not
constrain the proposed span.
Only one score proposal may be emitted per run. The replacement must preserve the proposed measure
count and every existing voice, remain below 64 KiB, and pass both the shared fail-closed mutation
engine and full-score validation. Explicitly named new voices are allowed; the mutation engine adds
them as complete score-length parts with rests outside the proposed span. Proposed ranges may cross
repeat and volta boundaries and may include or modify inline key, meter, or tempo changes; the
mutation engine preserves the target barline and ending bytes while replacing musical content. The tool emits
`score-proposal-created` and never mutates `FileDocument`.

### 5.6 `propose_score_edit`

The tool accepts a non-whitespace summary and a complete candidate ABC source. It does not require a measure
selection because the immutable prompt context already contains the full source. The candidate may
change key and tempo headers, add inline key or tempo changes, add or reconfigure voices and staves,
and make other valid ABC mutations. It must differ from the source, remain below 2 MB, parse as valid
ABC, and may retain or increase the written-measure count. Added measures require no pre-existing
selection and begin without annotations; removing existing measures remains unsupported so persisted
anchors cannot be orphaned. It shares the
one-score-proposal-per-run limit with `propose_measure_replacement`, emits
`score-proposal-created`, and never mutates `FileDocument`.

## 6. Tool and IPC invariants

- Invalid tool input returns a compact structured error.
- Tools receive no credentials and no filesystem or network access.
- There is no `remove_annotations`, direct document mutation, agent-driven measure removal, or navigation tool.
- Tool execution uses Pi's built-in loop; Chorale forwards normalized lifecycle events rather than implementing a second loop.
- Late events are ignored after cancellation or supersession.

```ts
type AIEvent =
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
    }
  | {
      type: 'score-proposal-created';
      requestId: string;
      proposal: ScoreChangeProposal;
    };
```

Lifecycle events supplement the existing `chat-start`, `chat-delta`, `chat-done`, and `chat-error` events. Summaries are compact, sanitized display strings; raw score arguments and results are not forwarded to the renderer for display.

## 7. Implementation boundaries

- `src/music/rational.ts`: normalized rational arithmetic.
- `src/music/scoreSnapshot.ts`: pure ABC-to-`ScoreSnapshot` construction and measure/event indexing.
- `src/music/documentSchema.ts`: annotation and document validation/normalization.
- `electron/ai/agentProfiles.ts`: profile registry and prompt modules.
- `electron/ai/sheetTools.ts`: Pi tool definitions and input validation.
- `electron/ai/sheetAgentRuntime.ts`: run construction, event projection, and cancellation.
- `electron/ipcValidation.ts`: untrusted renderer DTO validation.
- `src/agent/aiTypes.ts`: shared transport contracts.
- `src/agent/DesktopSheetAgent.ts`: correlated renderer event consumption.

## 8. Verification

- Snapshot construction occurs exactly once per run.
- Each historical prompt is derived from its own captured score revision.
- Every passage claim follows profile selection and a score read.
- Concurrent calls with the same tool name remain distinct by `toolCallId`.
- Range limits and rational values reject malformed inputs.
- Tool errors do not expose ABC payloads or provider secrets.
- Aborted and superseded runs cannot add proposal cards or finish a superseded assistant message.
