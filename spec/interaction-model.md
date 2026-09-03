---
title: "Interaction Model Spec"
description: "Specification for cross-surface interaction flows connecting score selection, playback seek, chat references, and annotation proposals"
category: "interaction"
date: 2026-08-05
updated: 2026-09-03
status: "implemented"
source_files:
  - src/types/document.ts
  - src/utils/anchor.ts
  - src/utils/repeatPlayback.ts
  - src/utils/abcMetadata.ts
  - src/utils/fileHistory.ts
  - src/agent/promptUtils.ts
  - src/agent/proposalActions.ts
  - src/agent/measureReferences.ts
  - src/hooks/useDocumentStore.ts
  - src/components/SheetMusicView.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/components/EditingHistoryModal.tsx
  - src/components/AgentChatPanel.tsx
  - src/components/chat/ChoraleStreamdownMessage.tsx
  - src/components/chat/ChoraleReasoningView.tsx
test_files:
  - src/utils/__tests__/anchor.test.ts
  - src/utils/__tests__/repeatPlayback.test.ts
  - src/utils/__tests__/abcMetadata.test.ts
  - src/utils/__tests__/fileHistory.test.ts
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/components/__tests__/EditingHistoryModal.test.tsx
  - src/agent/__tests__/measureReferences.test.ts
  - src/agent/__tests__/proposalActions.test.ts
  - src/components/__tests__/passageAnalysisJourney.integration.test.tsx
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/playback-dock.md
  - spec/pi-agent-chat.md
  - spec/annotations-and-proposals.md
---

# Interaction Model Spec

Date: 2026-08-05  
Updated: 2026-09-03
Source: `spec/agent-analysis-and-annotations.md`

## 1. Goal

Define the shared interactions connecting score selection, playback, chat references, annotation proposals, applied annotations, visual score metadata editing, and editing history undo/redo.

## 2. Shared score anchor

```ts
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

Measures are one-based, written, and inclusive. A single-measure selection sets both fields to the same value. Playback, chat, score focus, and annotation spans share this anchor; ranged playback starts or seeks from `startMeasure`. Existing optional beat, voice, ABC-offset, and playback hints remain available.

Chord onset is not stored as a layout field on `ScoreAnchor`. Chord annotations use a separate `MusicalPosition` containing written measure plus exact rational offset from the barline.

## 3. Selection flow

1. Clicking a measure replaces the selection with that one measure.
2. Shift-clicking or the keyboard equivalent extends a continuous range from the selection origin.
3. Reverse selection normalizes to the lower measure first.
4. Every measure in the range is highlighted, including across wrapped systems.
5. Repeat-aware occurrence resolution seeks the current playback pass from `startMeasure`.
6. The composer displays a compact `m. N` or `mm. N–M` chip.
7. File switching clears selection; closing chat does not.

Disconnected ranges are not supported.

## 4. Chat analysis flow

1. Prompt send captures `MusicContextSnapshot` with document ID, revision, ABC, active range, and canonical annotations.
2. Electron validates it and constructs one immutable `ScoreSnapshot`.
3. The agent calls `select_analysis_profile`; chat displays the selected route.
4. The agent reads score data through registered tools; correlated tool rows display progress.
5. Model reasoning streams as structured reasoning parts into collapsible thinking disclosure blocks;
   legacy `<think>...</think>` history is converted during conversation migration.
6. The agent returns Markdown with score references and may call `propose_annotations`.
7. A valid measure reference selects, scrolls, focuses, and seeks the passage without autoplay.

Other Markdown links are highlighted but non-navigating for this phase.

## 5. Proposal flow

1. Proposal cards remain disabled while the run is active.
2. Edit changes one staged proposal but does not apply it.
3. Reject collapses and excludes one proposal.
4. Apply All validates all remaining proposals and applies all or none.
5. If document ID or revision changed, pending proposals become Outdated and cannot be acted on.
6. Accepted annotations persist in `FileDocument`; deleting chat never removes them.

## 6. Annotation flow

- Focusing an annotation exposes focus styling only; click, Enter, or Space activates its span and
  opens its detail or editing UI.
- New annotations come from AI Agent proposals after passage selection; the score surface exposes no
  manual Add control.
- Accepted range annotations expose full in-card editing. Accepted chords expose compact inline
  symbol/Roman-numeral editing over the notation.
- Explicit user deletion removes an applied annotation.
- Agent-initiated deletion is unsupported.
- Chord annotations can occur multiple times per measure at distinct rational offsets.

## 7. Score metadata editing flow

- **Double-click / Keyboard activation:** Double-clicking or pressing Enter/Space on any rendered metadata element (Title, Subtitle, Composer, Author/Lyricist, Origin, Rhythm, Key, Meter, Tempo) switches the field to inline editing mode.
- **Visual tag feedback:** In edit mode, the field displays its corresponding ABC header badge (e.g. `T`, `C`, `A`, `K`, `M`, `Q`, `O`, `R`) alongside the input field.
- **Validation & Tooltips:**
  - Key signatures validate note root, optional accidentals, and mode types.
  - Meter inputs validate time fraction format (e.g. `4/4`, `6/8`) and standard symbols (`C`, `C|`).
  - Tempo inputs validate BPM range (20–500 BPM) and note-value prefixes.
  - Invalid entries display an inline error tooltip and prevent invalid commits.
- **Commit & Cancel:** Pressing Enter or blurring the input with valid data commits the edit; pressing Escape cancels editing and restores previous text.
- **Add field menu:** The `+` action button reveals a menu of unpopulated header tags to insert into the score.
- **Source synchronization:** Commits invoke `updateAbcHeaderMetadata`, modifying the underlying ABC string, updating `FileDocument.scoreInfo`, incrementing the document revision, and triggering autosave without losing notation data.

## 8. Score editing history and undo/redo flow

- **Header Undo/Redo:**
  - Accessible Undo (`Ctrl+Z` / `⌘Z`) and Redo (`Ctrl+Shift+Z` / `⌘Shift+Z`) buttons in the center header chrome allow instant sequential navigation through score edit states.
  - Controls enable/disable dynamically based on `canUndo` / `canRedo` history stack boundaries.
- **Editing History Modal:**
  - Opened via the **Tools** rail panel (`Editing history` button).
  - Displays a chronological list of up to 100 version snapshots with category badges (`origin`, `metadata`, `body`, `annotation`), action summaries, timestamps, and active state indicators.
  - Selecting "Revert to this version" restores the document's ABC source, score info, and annotations to that exact historical state without losing the undo trail.

## 9. Interaction invariants

- Tools read only the prompt-time immutable snapshot.
- Tool calls do not mutate `FileDocument`.
- Apply All is the only proposal-application action.
- Annotation changes do not create ABC revisions; metadata and musical note edits in ABC create document revisions.
- User scrolling retains the existing playback auto-centering pause behavior.
- Staleness and regeneration are deferred; Outdated applies only to pending proposals whose snapshot revision no longer matches.
