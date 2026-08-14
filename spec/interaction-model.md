# Interaction Model Spec

Date: 2026-08-05
Updated: 2026-08-14
Source: `spec/agent-analysis-and-annotations.md`

## 1. Goal

Define the shared interactions connecting score selection, playback, chat references, annotation proposals, and applied annotations.

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
5. The agent returns Markdown with score references and may call `propose_annotations`.
6. A valid measure reference selects, scrolls, focuses, and seeks the passage without autoplay.

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

## 7. Interaction invariants

- Tools read only the prompt-time immutable snapshot.
- Tool calls do not mutate `FileDocument`.
- Apply All is the only proposal-application action.
- Annotation changes do not create ABC revisions.
- User scrolling retains the existing playback auto-centering pause behavior.
- Staleness and regeneration are deferred; Outdated applies only to pending proposals whose snapshot revision no longer matches.
