---
title: "Passage-Aware Music Tutor, Agent Tools, and Annotations"
description: "Authoritative product specification for passage analysis, analysis profiles, score tools, proposal review, and canonical annotation overlay rendering"
category: "core-product"
date: 2026-08-05
updated: 2026-09-03
status: "implemented"
source_files:
  - src/components/SheetMusicView.tsx
  - src/components/AnnotationOverlay.tsx
  - src/components/AnnotationRail.tsx
  - src/components/AgentChatPanel.tsx
  - src/components/chat/ChoraleStreamdownMessage.tsx
  - src/components/chat/ChoraleReasoningView.tsx
  - src/components/AnnotationProposalCard.tsx
  - src/components/AnnotationEditor.tsx
  - src/music/documentSchema.ts
  - src/music/scoreSnapshot.ts
  - src/music/annotationLayout.ts
  - src/music/annotationMutations.ts
  - src/music/rational.ts
  - src/agent/DesktopSheetAgent.ts
  - src/agent/proposalActions.ts
  - src/agent/measureReferences.ts
  - electron/ai/sheetAgentRuntime.ts
  - electron/ai/sheetTools.ts
  - electron/ai/agentProfiles.ts
  - electron/ipcValidation.ts
test_files:
  - src/components/__tests__/passageAnalysisJourney.integration.test.tsx
  - src/components/__tests__/AgentChatPanel.test.tsx
  - src/components/__tests__/AnnotationProposalCard.test.tsx
  - src/agent/__tests__/sheetToolFlow.test.ts
  - src/agent/__tests__/sheetAgentRuntime.integration.test.ts
  - src/agent/__tests__/DesktopSheetAgent.test.ts
  - src/music/__tests__/scoreSnapshot.test.ts
  - src/music/__tests__/annotationLayout.test.ts
  - src/music/__tests__/documentSchema.test.ts
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
  - spec/score-surface.md
  - spec/interaction-model.md
  - spec/file-workspace-architecture.md
  - spec/agent-tools-and-profiles.md
  - spec/annotations-and-proposals.md
  - spec/pi-agent-chat.md
---

# Passage-Aware Music Tutor, Agent Tools, and Annotations

Date: 2026-08-05  
Updated: 2026-09-03
Status: Implemented specification (Milestones 1 & 2 delivered)

## 1. Product goal

Chorale should help theory-literate students and music hobbyists explore a score through selection, conversation, explanation, and lightweight annotation.

The first complete workflow is:

1. Select one continuous passage.
2. Ask a musical question.
3. See which internal analysis profile is active.
4. Receive a grounded Markdown answer with measure references.
5. Follow a reference back to the score and paused playback position.
6. Review proposed chord, modulation, voice-leading, or explanation annotations.
7. Edit or reject individual proposals, then apply the remaining proposals together.
8. Revisit applied annotations after reload or desktop restart.

The tutor should answer chord-analysis, voice-leading, modulation, and basic form or phrase questions accurately. It may use established theory terms, but it should connect terms such as *secondary dominant* to concrete facts: chord name, Roman numeral, resolution, and role in tonicization or modulation.

## 2. Delivery scope

Implementation is split into two vertical milestones (both delivered):

### Milestone 1: Passage analysis loop (Delivered)

- Continuous written-measure selection.
- One visible Music Tutor with transparent internal profile routing.
- Immutable prompt snapshots and read-only score tools.
- Grounded Markdown answers, visible tool status, and interactive measure links.

### Milestone 2: Annotation loop (Delivered)

- Canonical annotation storage and legacy normalization.
- Chord, modulation, voice-leading, and explanation proposals.
- Turn-level atomic Apply All with individual Edit and Reject.
- Score-side annotation presentation, accepted-annotation editing, deletion, and persistence.

Staleness, regeneration, and agent-initiated removal remain deferred. Reviewable agent-authored score
editing is specified separately in [score-drafting.md](./score-drafting.md).

```text
shared range/music contracts ─┬─> continuous selection ────────┐
                              └─> immutable score tools ───────┤
                                                               v
                                                Milestone 1 integrated loop (Done)
                                                               |
                                                               v
annotation/proposal contracts -> review UI -> overlays/persistence
                                                               |
                                                               v
                                                Milestone 2 integrated loop (Done)
```

Milestone 2 builds on the same canonical annotation and musical-position contracts established in Milestone 1. It does not introduce a second score parser or anchor model.

## 3. Current-state constraints

Verified 2026-09-03:

| Capability | Current state | Evidence |
|---|---|---|
| Measure selection | One continuous written-measure range at a time | `src/components/SheetMusicView.tsx` |
| Playback handoff | Shared anchor and repeat-aware occurrence behavior exist | `src/components/AudioPlayer.tsx`, `src/utils/repeatPlayback.ts` |
| Agent runtime | Production Pi runtime streams structured text and reasoning deltas plus score-tool lifecycle events | `electron/ai/sheetAgentRuntime.ts` |
| Chat grounding | Full ABC and one optional selection are captured | `src/components/AgentChatPanel.tsx`, `src/agent/types.ts` |
| Markdown | Assistant text and reasoning render through sanitized Streamdown surfaces with raw HTML disabled | `src/components/chat/ChoraleStreamdownMessage.tsx`, `src/components/chat/ChoraleReasoningView.tsx` |
| Annotations | Canonical annotations support proposal review, persistence, editing, and React-owned overlays | `src/types/document.ts`, `src/hooks/useDocumentStore.ts`, `src/components/AnnotationOverlay.tsx` |
| Persistence | Documents and full conversations use IndexedDB; conversations also keep a compact local-storage mirror | `src/utils/storageAdapter.ts`, `src/agent/conversationStore.ts` |

Existing provider configuration, cancellation, playback, repeat handling, ABC editing, and workspace persistence must continue to work.

## 4. Architecture

```text
React renderer
  active FileDocument + ScoreAnchor
             |
             | capture at prompt send
             v
  MusicContextSnapshot (IPC DTO)
             |
             | validate in Electron main
             v
  immutable ScoreSnapshot (normalized runtime model)
             |
       +-----+-----------------------------+
       |                                   |
       v                                   v
  profile routing                    score tools
       |                                   |
       +---------------+-------------------+
                       v
       Markdown + measure links + proposals
                       |
                renderer review UI
                       |
         atomic Apply All after validation
                       v
              FileDocument.annotations
                       |
                       v
           React-owned score overlay layer
```

### 4.1 Snapshot boundary

`MusicContextSnapshot` remains the serialized renderer-to-main contract. It contains the active document identity, revision, raw ABC, selection, and a copied canonical `Annotation[]`.

Electron validates that DTO and constructs one immutable `ScoreSnapshot` per run. `ScoreSnapshot` contains normalized metadata, measures, voices, events, rational musical positions, ABC source ranges, and annotation lookup indexes. Every tool in the run reads the same instance; tools do not reparse ABC independently.

### 4.2 DOM ownership boundary

abcjs exclusively owns its rendered score container. React owns a sibling annotation overlay layer. React must not mount children inside DOM that abcjs clears and rebuilds.

A pure annotation-layout library resolves musical positions to SVG-local geometry. The overlay copies each abcjs SVG view box and bounds, then recomputes geometry after score render, wrapping, zoom, or resize without changing annotation state.

## 5. Shared musical contracts

```ts
type RationalDuration = {
  numerator: number;
  denominator: number;
};

type MusicalPosition = {
  measure: number;          // one-based written measure
  offset: RationalDuration; // elapsed whole-note duration from the barline
};

type MeasureSpan = {
  startMeasure: number;
  endMeasure: number;
};

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
```

`endMeasure` equals `startMeasure` for a one-measure selection. Playback and navigation use `startMeasure` for a range. Existing optional beat, voice, ABC-offset, and playback hints remain supported for cross-surface handoff, but they are not the persisted identity of a chord annotation.

Chord positions persist musical time, never layout coordinates. For example, beat 2 in 4/4 is offset `1/4`; the second compound beat in 6/8 is offset `3/8`. Friendly beat labels, ABC offsets, playback times, and SVG coordinates are derived at runtime.

## 6. Agent profiles and prompts

One Pi `Agent` owns the conversation turn. Profiles are predefined prompt modules, not separate provider calls or user-visible agents.

| Profile | Responsibility |
|---|---|
| `general` | Basic explanation and synthesis across domains |
| `harmony` | Chords, Roman numerals, progressions, cadences, tonicization, and modulation |
| `voice-leading` | Voice motion, tendency-tone resolution, crossings, parallels, and notable leaps |
| `form-phrase` | Phrase boundaries, repetition, contrast, cadence placement, and basic formal function |

The agent must call `select_analysis_profile` before making passage-specific claims. It may select multiple profiles for a mixed question. The call emits a visible route such as `Harmony analysis`.

All profiles must:

- inspect the score with tools before asserting musical facts;
- explain theory terms with concrete score context;
- cite passage-specific claims with valid measure links;
- state uncertainty rather than invent notes, chords, keys, voices, or measures;
- never claim that a proposal is already applied;
- create annotations only through `propose_annotations`;
- avoid raw HTML and direct score-mutation claims.

## 7. Tool registry

The runtime exposes one routing tool and six score tools:

| Tool | Contract |
|---|---|
| `select_analysis_profile` | Selects one or more predefined prompt profiles and emits visible routing status |
| `get_score_summary` | Returns title, composer, key, meter, tempo, written-measure count, and declared voices |
| `read_measure_range` | Returns ABC source slices and local key or meter changes for a continuous written-measure range |
| `get_annotations` | Returns canonical annotations intersecting a requested range |
| `propose_annotations` | Validates and stages annotation proposals without mutating `FileDocument` |
| `propose_measure_replacement` | Validates and stages a source-aware replacement for a previously read measure range |
| `propose_score_edit` | Validates and stages a complete non-destructive score replacement |

Tool invariants:

- Tools operate only on the run's immutable `ScoreSnapshot`.
- Written-measure numbers are one-based and inclusive. A pickup is the first written measure.
- `read_measure_range` may return any continuous written-measure range within the score.
- All tool inputs and outputs use normalized rational durations.
- Invalid payloads return structured errors and never mutate renderer state.
- Tools receive no credentials and no filesystem or network access.

There is no `remove_annotations`, direct document mutation, agent-driven measure removal, or
navigation tool. Score changes remain proposals until the renderer validates and applies them.

## 8. Annotation model

```ts
type AgentProfileId =
  | 'general'
  | 'harmony'
  | 'voice-leading'
  | 'form-phrase';

type AnnotationKind =
  | 'chord'
  | 'modulation'
  | 'voice-leading'
  | 'explanation';

type AnnotationBase = {
  id: string;
  span: MeasureSpan;
  label: string;
  body: string;
  source: 'user' | 'assistant';
  agentProfiles?: AgentProfileId[];
  createdAt: string;
  updatedAt: string;
};

type ChordAnnotation = AnnotationBase & {
  kind: 'chord';
  position: MusicalPosition;
  chordSymbol: string;
  romanNumeral?: string;
};

type RangeAnnotation = AnnotationBase & {
  kind: 'modulation' | 'voice-leading' | 'explanation';
};

type Annotation = ChordAnnotation | RangeAnnotation;

type ProposalState =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'outdated'
  | 'unavailable';

type AnnotationProposal = {
  id: string;
  runId: string;
  documentId: string;
  sourceRevision: number;
  state: ProposalState;
  annotation: Annotation;
};
```

Chord annotations require `position`, `chordSymbol`, and a one-measure-or-longer span containing `position.measure`. The discriminated union enforces those fields at compile time and validators enforce them at persistence and IPC boundaries. Roman numeral is optional. Inversion and figured bass are deferred.

The canonical `Annotation` type is reused by `FileDocument`, `MusicContextSnapshot`, IPC validation, `ScoreSnapshot`, tools, and overlays. The duplicate `MusicAnnotation` type is removed.

Pure `normalizeAnnotation` and `normalizeFileDocument` functions live outside React and run at the storage boundary. Legacy kinds normalize as follows:

- `harmony` becomes `chord`;
- `analysis`, `phrase`, `comment`, and `edit-note` become `explanation`;
- valid unknown records are retained as `explanation` annotations.

## 9. Selection and navigation

- Clicking a measure selects only that measure.
- Shift-clicking or the keyboard equivalent extends one continuous inclusive range.
- Reverse selection normalizes to the lower measure first.
- Highlights cover every selected measure across wrapped systems.
- File switching clears selection; closing chat does not.
- Disconnected selections are unsupported.
- Clicking a valid chat measure link selects the range, scrolls and focuses `startMeasure`, and seeks paused playback without starting it.
- Repeat-aware occurrence behavior is preserved.

## 10. Markdown and links

Assistant responses render sanitized CommonMark/GFM with raw HTML disabled and no `dangerouslySetInnerHTML` path.

Supported score references are:

```md
[m. 5](#measure-5)
[mm. 5–8](#measure-5-8)
```

Only valid, in-range `#measure-N` and `#measure-N-M` targets navigate. Other Markdown links are visually highlighted but non-navigating in this phase. They are rendered without active anchor semantics or an Electron/browser handoff. External link opening is deferred.

## 11. Proposal review

Agent proposals appear inline with the assistant turn. Cards are read-only while the run is active.

- **Edit** updates one staged proposal after validation; it does not apply it.
- **Reject** collapses one proposal and excludes it from Apply All.
- **Proposal presentation**: cards in the chat panel share the same square, borderless, kind-derived palette surface as sheet annotations, and the entire annotation block acts as an interactive link reference to select the corresponding measures on the score.
- **Apply All** is the only apply action. It considers every remaining `proposed` proposal in the turn, including edited proposals.

Apply All is atomic:

1. Exclude rejected, outdated, and unavailable proposals.
2. Verify the active document ID and revision still match the run snapshot.
3. Validate every eligible proposal.
4. If any validation fails, apply none and identify the invalid cards.
5. Otherwise append all annotations and mark all eligible proposals accepted in one renderer transaction.

If the active document ID or revision changes before application, pending proposals display an **Outdated** label and all actions are disabled. The user must rerun analysis. This is a coarse revision guard, not the deferred annotation-staleness system.

If a run fails or is aborted, its unapplied proposals become `unavailable`. Deleting a chat thread removes its pending proposal records but never removes already accepted annotations.

## 12. Annotation presentation and editing

- **Chord:** a collision-free symbol and optional Roman numeral above the staff at its rational onset.
  The entire badge is the accessible edit control; activating it opens a compact symbol/Roman-numeral
  editor over the notation.
- **Modulation, voice leading, and explanation:** score-sorted cards in the persistent annotation rail.
  They stay vertically aligned with their rendered measure spans; graphical voice-leading arrows are
  deferred.

One zoom scene contains fixed `24rem / 48rem / 24rem` balance, notation, and annotation tracks. The
notation remains centered, the rail remains beside it at exactly half its width, and narrow surfaces
overflow horizontally instead of stacking. Range cards collapse to two body lines, expand one at a
time, and use palette-derived square surfaces with text/icon selected state. Their 44px pen controls
replace the selected card with the full accepted-annotation editor.

The score surface exposes no manual Add or count controls. Users select measures and ask the AI Agent
to propose new annotations, then review them in chat. Accepted range annotations expose full editing;
accepted chord annotations expose chord symbol, optional Roman numeral, and Delete while their other
fields remain unchanged. Agent-initiated deletion is not supported.

The React chord overlay is a sibling of the abcjs container. Its background ignores pointer events;
badges remain keyboard- and pointer-interactive. Range annotations render only in the React rail.
Focusing an annotation shows focus styling without activating it; click, Enter, or Space selects its
span and opens its detail or editing UI.

## 13. Persistence and transport

- Accepted annotations remain inline in `FileDocument` and use IndexedDB autosave.
- Annotation changes do not increment the ABC revision or create `ScoreVersion` records.
- Conversation storage uses schema version 4 for ordered text, reasoning, and tool parts; token usage;
  persisted pending messages; proposals; and profile routes.
- Version-2 and version-3 conversations migrate to v4. Legacy thinking markup becomes structured
  reasoning, interrupted streams become stopped messages, and the v3 key remains untouched for rollback.
- IndexedDB stores full conversations; local storage is a compact synchronous mirror and fallback.
- Hydration merges both stores by file ID and prefers IndexedDB when the same file exists in both.
- No IndexedDB object-store migration is required.
- `MusicContextSnapshot.annotations` is a required copied `Annotation[]`.

Pi tool events are normalized for IPC:

```ts
type ToolStartEvent = {
  type: 'tool-start';
  requestId: string;
  toolCallId: string;
  toolName: string;
  summary: string;
};

type ToolDoneEvent = {
  type: 'tool-done';
  requestId: string;
  toolCallId: string;
  toolName: string;
  status: 'success' | 'error';
  summary: string;
};
```

Main process summaries are compact and renderer-safe. Full tool arguments and score payloads are not forwarded for display. `profile-route` and `proposal-created` remain separate typed domain events.

## 14. Failure handling

- Invalid ABC disables passage analysis until a normalized `ScoreSnapshot` can be built.
- Provider, authentication, network, rate-limit, cancellation, and save failures retain the existing error contract.
- File switch, chat close, reload, or window destruction aborts active work.
- Late events from aborted or superseded runs are ignored by `requestId`.
- Concurrent tool rows are matched by `requestId + toolCallId`.
- No tool call directly mutates `FileDocument`.
- Failed document saves retain the in-memory annotation and surface the existing save-error state.

### Performance constraints

- Parse and normalize ABC once when constructing the run's `ScoreSnapshot`.
- Reuse measure/event and source-offset indexes across all tools in a run.
- Coalesce overlay geometry work to one animation frame after render/resize changes.
- Do not recompute all annotation geometry on playback cursor ticks or ordinary chat streaming.
- Do not forward complete score tool payloads through display IPC events.

### Failure-mode coverage

| Failure | Required handling | Verification |
|---|---|---|
| Invalid or unsupported ABC | Reject snapshot construction and show the existing score/analysis error | Unit fixture plus agent integration test |
| Tool calls finish out of order | Correlate rows by `requestId + toolCallId` | Concurrent-tool integration test |
| Run aborts after proposal events | Mark unapplied proposals unavailable and ignore later events | Runtime and component cancellation test |
| File or revision changes before Apply All | Mark pending proposals Outdated and disable actions | Component/integration revision test |
| One proposal fails validation | Apply no annotations and identify invalid cards | Atomic store test |
| Chord onset has no exact SVG event | Use adjacent onset geometry, then measure-bound fallback | Overlay fixture test |
| Overlay target disappears after rerender | Rebuild placement from the new render; keep durable annotation data | Resize/rerender integration test |
| IndexedDB save fails | Keep in-memory data and expose save error | Store/component failure test |
| Assistant emits unsafe or external link | Render highlighted but non-navigating content | Markdown security test |

## 15. Acceptance criteria

1. Users can select any continuous written-measure range with pointer and keyboard interactions.
2. Range highlights remain correct across wrapped systems and playback begins or seeks from `startMeasure`.
3. Prompt send captures the range, revision, canonical annotations, and immutable ABC snapshot.
4. Passage-specific answers route through a visible profile and inspect score data with registered tools.
5. Assistant Markdown is readable, sanitized, and supports highlighted links.
6. Valid measure links select, focus, scroll, and seek the referenced range without autoplay.
7. Non-measure links never navigate in this phase.
8. Agents can propose chord, modulation, voice-leading, and explanation annotations.
9. Multiple chord changes in one measure retain distinct rational onsets.
10. Chord proposals support chord symbols and optional Roman numerals; inversion is not required.
11. Each proposal supports Edit and Reject; each turn has one Apply All and no individual Apply.
12. Apply All is atomic and excludes rejected proposals.
13. A document ID or revision mismatch labels pending proposals Outdated and disables their actions.
14. Applied annotations persist across reload and Electron restart.
15. Deleting a chat thread does not delete accepted annotations.
16. Chords render in a React-owned score overlay, range annotations render in the aligned React rail,
    and both remain pointer- and keyboard-interactive.
17. Existing playback, repeat-aware selection, ABC editing, provider selection, cancellation, and persistence tests continue to pass.

## 16. Verification strategy

Use behavior-based coverage rather than target test counts.

### Deterministic score fixture corpus

- 4/4 with multiple chord changes in one measure.
- Pickup measure.
- 6/8 compound meter.
- Fractional rhythms and tuplets.
- Rests and tied notes.
- Multiple simultaneous voices.
- Inline key and meter changes.
- Repeats and alternate endings.
- A passage wrapping across systems.

### Coverage layers

- **Unit:** rational arithmetic, measure/event extraction, canonical normalization, validators, profile routing, link parsing, and conversation migration.
- **Component:** forward/reverse range selection, keyboard extension, Markdown rendering, proposal actions, Outdated UI, annotation focus, and overlay geometry updates.
- **Integration:** snapshot separation, Pi tool loop, correlated IPC events, atomic Apply All, document persistence, abort handling, and repeat-aware navigation.
- **Electron smoke:** complete passage-analysis journey, complete annotation journey, reload/restart persistence, resize/zoom alignment, and paused playback seeking.

Model accuracy evaluation remains a next-phase project and is not a release gate for this implementation.

## 17. Out of scope

- Annotation fingerprinting, dependency-level staleness, stale styling, and regeneration.
- Agent-initiated annotation removal.
- Agent-driven score contraction and measure removal.
- External link navigation.
- Graphical note-to-note voice-leading arrows.
- Chord inversion and figured bass.
- Disconnected measure selections.
- Whole-score automatic analysis.
- Custom user-authored agents or prompts.
- Collaboration, annotation import/export, or cross-file analysis.
- Model certification or a fixed accuracy threshold.

## 18. Rollback

The feature is additive. Reverting it restores the current read-only chat path without changing ABC revisions. New document and conversation fields must be read defensively so rollback does not corrupt stored scores or accepted annotations.
