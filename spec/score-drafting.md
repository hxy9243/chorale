---
title: "Score Drafting MVP"
description: "Authoritative MVP contract for blank score creation, measure-range editing, and agent score-change proposals"
category: "core-workspace"
date: 2026-08-23
updated: 2026-08-30
status: "implemented"
source_files:
  - src/music/scoreDrafting.ts
  - src/components/NewScoreModal.tsx
  - src/components/MeasureDraftingToolbar.tsx
  - src/components/AbcEditor.tsx
  - src/components/SheetMusicView.tsx
  - src/hooks/useDocumentStore.ts
  - src/components/AgentChatPanel.tsx
  - electron/ai/sheetTools.ts
test_files:
  - src/music/__tests__/scoreDrafting.test.ts
  - src/music/__tests__/scoreSnapshot.test.ts
  - src/hooks/__tests__/useDocumentStore.test.ts
  - src/components/__tests__/MeasureDraftingToolbar.test.tsx
  - src/components/__tests__/AbcEditor.test.tsx
  - src/components/__tests__/NewScoreModal.test.tsx
  - src/components/__tests__/SheetMusicView.test.tsx
  - src/components/__tests__/AgentChatPanel.test.tsx
  - src/agent/__tests__/sheetTools.test.ts
  - src/agent/__tests__/conversationStore.test.ts
related_specs:
  - spec/design.md
  - spec/file-workspace-architecture.md
  - spec/score-surface.md
  - spec/abc-editor.md
  - spec/pi-agent-chat.md
  - spec/agent-tools-and-profiles.md
---

# Score Drafting MVP

## 1. Goal

Deliver one safe drafting loop: create a blank two-staff piano score, select written measures, edit
those measures manually or ask the agent for replacement music, preview the result, and either apply
or discard it. The accepted document remains the only playback and persistence source except while a
user has explicitly entered proposal preview.

## 2. Blank score creation

- **New Score** and **Import Score** are equal-weight actions in the Files rail and empty workspace.
- The New Score dialog collects a required title, optional subtitle and composer, ABC key and meter,
  integer tempo from 20 through 300 BPM, and 1 through 256 measures. It identifies the fixed instrument
  as `Piano · two staves`.
- Defaults are `Untitled score`, `C`, `4/4`, 120 BPM, and eight measures.
- The builder emits one canonical tune with upper and lower piano voices and one `Z` full-measure rest
  per requested measure in each voice. A subtitle is a second `T:` field and tempo is
  `Q:1/4=<bpm>`.
- The complete ABC is parsed before document creation. Failure leaves the dialog open and the active
  document unchanged. Success activates the document and enters the existing autosave pipeline.

## 3. Measure source and mutations

`ScoreSnapshot` retains an internal source slice and absolute source range for every written measure
and active voice. Voice identity follows the active body `V:` or `[V:]` marker at the parsed source
position, so declaration order and `%%score`/`%%staves` layout order may differ without relabeling
parts. Declaration order is only the fallback for implicit source without body voice markers. The
public `read_measure_range` result remains concise and unchanged.

Focused manual and agent-authored measure edits pass through one pure mutation function:

```ts
type MeasureMutation =
  | { kind: 'insert'; span: MeasureSpan; position: 'before' | 'after'; count: number }
  | { kind: 'replace'; span: MeasureSpan; replacementAbc: string }
  | { kind: 'delete'; span: MeasureSpan };
```

- Insert adds 1 through 256 full-measure rests to every active voice.
- Replace requires the same written-measure count and must retain every existing voice. Multi-voice
  replacement uses explicit `[V:<id>]` sections. A replacement may add voices; each added voice is
  declared as a separate staff and padded with full-measure rests outside the selected range.
- Delete requires confirmation and cannot remove all measures.
- Every mutation preserves all bytes outside the source segments it owns. Adding a voice is the
  narrow exception: it also inserts the required declaration, score-layout entry, original-voice
  marker when needed, and full-length voice body. Missing, overlapping, or ambiguous segments;
  and any structure that cannot be losslessly isolated return `unsupported` and create no revision.
  Content replacement may cross repeats and volta endings and may include or modify inline key,
  meter, and tempo changes within the target measures because it edits the music between
  leading and rightmost barlines and preserves the target's repeat/ending bytes. Insert and delete
  remain unsupported at repeat, ending, or inline key/meter boundaries because they change measure structure.
- Successful mutations use existing revision, history, autosave, undo, and redo paths. Replacement
  preserves annotation anchors. Insert/delete rebase anchors, and delete removes annotations wholly
  contained by the deleted span.

Agent-authored structural edits use a second pure whole-score replacement validator. The candidate
must be a non-empty, changed, valid single-score ABC source below 2 MB and may retain or increase the
written-measure count. Existing annotation anchors remain attached to their original measures, while
new measures begin without annotations. Within that boundary it may freely change
headers and body fields, including global or inline `K:` and `Q:` fields, voice declarations, score
layout, clefs, and notation content. The accepted document is still changed only through preview and
Apply against the proposal's immutable source revision.

## 4. Selection controls

Measure selection is bidirectionally linked between the interactive sheet music surface and the ABC
editor. When a measure or continuous measure range is selected, the ABC editor's **Measure Source**
view exposes a compact contextual toolbar belt directly beneath the editor tabs. The belt displays the
selected span label (e.g. `Measure 1` or `Measures 3–4`) and provides three structural mutation actions:
**Add before**, **Add after**, and **Delete**.

Direct cell editing in Measure Source is the sole content-editing mechanism; a separate "Edit ABC"
replacement modal is not retained.

Structural actions reuse the shared mutation engine:
- **Add before** / **Add after** open an add-count dialog requesting the number of measures (1–256).
- **Delete** opens a confirmation alertdialog warning that the selected measures will be removed across
  all voices and can be restored via Undo.
- Invalid structural edits keep their dialog open with the error message displayed.

The toolbar belt is hidden when there is no active measure selection and is unavailable in Raw Source
view. The score surface does not render or reserve layout for a drafting toolbar.

Selection and draft UI are file scoped. Switching documents or editing raw source clears ephemeral
selection, editor, and preview state.

## 5. Agent score proposals

The desktop agent exposes focused `propose_measure_replacement` and structural `propose_score_edit`
tools. They share a limit of one score proposal per run. The active selection is an optional intent
and navigation hint, not an authorization boundary: measure replacement may target any existing
span after reading that proposed span, including when there is no active selection. A focused
replacement may target any continuous measure span up to the full measure count of the score.
Failed reads authorize no measures; read authorization is committed only after the entire requested
range has been validated. Proposal summaries must contain non-whitespace text after trimming.
The replacement must be below 64 KiB, target the same span, retain every existing voice and measure
count, pass the shared mutation engine, and produce a valid complete score. It may add explicitly
named voices, which become complete score-length parts with rests outside the proposed span.

`propose_score_edit` accepts a complete candidate ABC source already available in the immutable music
context. It does not require a selection. The shared whole-score validator checks size, syntax,
non-destructive measure expansion, and that the candidate differs from the source before a proposal
is created. The agent may extend a score to the musically appropriate length without pre-creating or
selecting destination measures.

Score proposals are persisted separately from annotation proposals and include their source document
and revision. The complete conversation, including large whole-score replacement payloads, is backed
by IndexedDB; local storage remains a synchronous mirror and may omit score payloads when its quota is
exhausted. Durable hydration merges file entries from both stores, preferring IndexedDB when both
stores contain the same file while recovering local-only files. A proposal card provides **Preview**,
**Apply**, and **Discard**.

- Preview reconstructs the candidate score and temporarily routes the main score surface and playback
  dock to it without mutating the document.
- A persistent banner identifies the affected measures and provides **Back to current**.
- Apply rechecks document identity and revision, commits one `tool-apply` revision, and exits preview.
- A revision mismatch marks the proposal Outdated. Discard creates no history.
- Without an exact read of the proposed span or safe source segmentation, the agent explains the recovery action
  and emits no proposal.

Existing annotation proposals and old conversations remain backward compatible through optional
score-proposal fields.

## 6. Deferred

Note-entry controls, drag editing, agent-driven measure removal, repair loops, side-by-side comparison,
and a general lossless ABC serializer are outside this MVP.
