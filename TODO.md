# Passage-Aware Music Tutor Implementation Plan

Product goal: let a student select a continuous score passage, ask a theory question, receive a grounded Markdown explanation with score links, and optionally apply useful annotations.

Implementation favors explicit domain contracts, pure music libraries, and end-to-end usable milestones. Estimates and target test counts are intentionally omitted; each task is complete only when its behavior and regression coverage pass.

## Sequencing and parallel lanes

```text
M1 contracts/snapshot ─┬─> selection + score focus ─┐
                       └─> profiles + score tools ──┼─> chat/Markdown integration ─> M1 verification
                                                   |
M2 proposal/store work ───────┬─> review UI ───────┤
                              └─> overlay layout ───┴─> M2 workflow verification
```

- M1 contract and snapshot work is sequential foundation work because renderer and Electron contracts share it.
- After that foundation, score-selection UI and Electron tool/runtime work can proceed in parallel; chat integration waits for both.
- In M2, proposal/store work and pure overlay-layout work can proceed in parallel after the canonical annotation model exists. Their React integration should be sequential because both touch `AgentChatPanel`, `SheetMusicView`, and document-store wiring.
- Parallel worktrees must not independently edit shared contract files; land contract changes first to avoid merge conflicts.

## Milestone 1: Complete passage-analysis loop

Outcome: select a range, ask the Music Tutor, observe internal routing/tool progress, read a grounded response, and navigate from measure links back to the score and paused playback.

### M1.1 Shared range and musical-time primitives

- [ ] Replace `ScoreAnchor.measure` with required `startMeasure` and `endMeasure` in `src/types/document.ts`.
- [ ] Update all scoped anchor producers and consumers; do not rename unrelated fields such as abcjs `measureNumber`, `MeasureOccurrence.measure`, or chat migration fields mechanically.
- [ ] Ensure single-measure anchors set `startMeasure === endMeasure` and all ranged playback/navigation uses `startMeasure`.
- [ ] Add `src/music/rational.ts` with normalized exact rational duration construction, reduction, comparison, addition, and validation.
- [ ] Add `MusicalPosition` (`measure + rational offset`) and `MeasureSpan` shared contracts.
- [ ] Replace the legacy annotation shape with the canonical `AnnotationKind` and discriminated `Annotation` union; chord annotations require `MusicalPosition` and chord symbol.
- [ ] Remove the duplicate `MusicAnnotation` type and reuse canonical `Annotation` across documents and agent contracts.
- [ ] Update anchor unit tests and existing playback/selection tests without changing current repeat-aware behavior.

### M1.2 Pure score and document libraries

- [ ] Add `src/music/scoreSnapshot.ts` with pure ABC extraction for written measures, voices, notes, rests, durations, rational onsets, local key/meter changes, and ABC source ranges.
- [ ] Add pure `normalizeAnnotation` and `normalizeFileDocument` in `src/music/documentSchema.ts`.
- [ ] Invoke document normalization from `storageAdapter.getDocuments()` for IndexedDB and memory paths, before React consumes documents.
- [ ] Normalize legacy annotation kinds (`harmony` -> valid chord or explanation; `analysis`/`phrase`/`comment`/`edit-note` -> explanation).
- [ ] Treat the pickup, when present, as written measure 1 and keep measure identities aligned with abcjs global measure classes.
- [ ] Define the immutable main-process `ScoreSnapshot` runtime type and lookup indexes.
- [ ] Keep `MusicContextSnapshot` as the serialized renderer/IPC DTO; include document ID, revision, ABC, optional `ScoreAnchor`, and required copied `Annotation[]`.
- [ ] Construct `ScoreSnapshot` once per agent run after IPC validation; do not reparse ABC in each tool.
- [ ] Reuse the snapshot's measure/event/source indexes across every tool call in the run.
- [ ] Add deterministic score fixtures covering:
  - 4/4 with several events per measure;
  - pickup measures;
  - 6/8 compound meter;
  - fractional rhythms and tuplets;
  - rests and ties;
  - multiple simultaneous voices;
  - inline key and meter changes;
  - repeats and alternate endings.
- [ ] Verify extraction, rational positions, written-measure numbering, and malformed-ABC errors against the fixture corpus.

### M1.3 Continuous score selection

- [ ] Update `SheetMusicView.tsx` measure hit callbacks to retain modifier state.
- [ ] Single click selects one measure and resets the range origin.
- [ ] Shift-click and the keyboard equivalent extend one continuous inclusive range.
- [ ] Normalize reverse selection to lower `startMeasure` and higher `endMeasure`.
- [ ] Render highlights for every selected measure across wrapped systems.
- [ ] Preserve current repeat-pass selection and seek behavior using `startMeasure`.
- [ ] Clear selection on file switch but not when chat closes.
- [ ] Add accessible names/focus behavior and component tests for forward, reverse, keyboard, wrapped, and cleared ranges.

### M1.4 Chat context and active-range UI

- [ ] Update `AgentChatPanel.tsx` to show `m. N` or `mm. N–M` in the composer and captured user message context.
- [ ] Capture immutable `MusicContextSnapshot` at prompt send, including canonical annotations.
- [ ] Distinguish snapshot identity from `documentId`; carry both through the request and proposal contracts.
- [ ] Extend `electron/ipcValidation.ts` for normalized anchors, annotations, field lengths, counts, and rational values.
- [ ] Verify later document or selection changes cannot mutate the in-flight snapshot.

### M1.5 Internal profile registry and score tools

- [ ] Add `electron/ai/agentProfiles.ts` for `general`, `harmony`, `voice-leading`, and `form-phrase` prompt modules.
- [ ] Require `select_analysis_profile` before passage-specific claims and allow multiple profiles for mixed questions.
- [ ] Add `electron/ai/sheetTools.ts` with:
  - `get_score_summary`;
  - `read_measure_range` (maximum 32 continuous measures per call);
  - `get_annotations`.
- [ ] Make all tool handlers read the run's immutable `ScoreSnapshot` and return structured validation errors.
- [ ] Keep credentials, filesystem, network, document mutation, navigation, ABC editing, and annotation removal outside tool access.
- [ ] Update the shared system prompt to require inspection, contextual theory explanations, uncertainty, valid measure citations, and no raw HTML.
- [ ] Verify passage questions call profile selection and score-reading tools before the final answer.

### M1.6 Correlated tool and profile events

- [ ] Project Pi's built-in tool lifecycle from `sheetAgentRuntime.ts`; do not build a second tool loop.
- [ ] Add typed `profile-route`, `tool-start`, and `tool-done` IPC events.
- [ ] Include both `requestId` and Pi `toolCallId` on tool events.
- [ ] Generate compact renderer-safe summaries instead of forwarding full tool args/results.
- [ ] Extend `DesktopSheetAgent.ts` callbacks and chat state to correlate concurrent tool rows by `toolCallId`.
- [ ] Ignore late events after abort, file switch, supersession, unmount, reload, or window destruction.
- [ ] Test concurrent calls with the same tool name, errors, cancellation, and event cleanup.

### M1.7 Markdown and score links

- [ ] Add `MarkdownMessage.tsx` using a standard CommonMark/GFM renderer with raw HTML disabled and no `dangerouslySetInnerHTML` path.
- [ ] Add a pure parser/validator for `#measure-N` and `#measure-N-M` references.
- [ ] Render valid in-range score references as highlighted interactive controls.
- [ ] On activation, select the range, scroll and focus `startMeasure`, and seek paused playback without autoplay.
- [ ] Render other Markdown links with highlighted link styling but no navigation or Electron/browser handoff.
- [ ] Render malformed or out-of-range measure targets non-navigating.
- [ ] Test Markdown structure, keyboard activation, range normalization, invalid targets, raw HTML, and non-measure links.

### M1.8 Milestone verification

- [ ] Run the full existing unit/component suite and production build.
- [ ] Add an integration test covering snapshot capture -> profile route -> score tool -> Markdown response -> measure-link navigation.
- [ ] Electron smoke-test one single-measure question and one wrapped multi-measure question.
- [ ] Confirm paused playback seeks from the linked/selected `startMeasure` and never autoplays.
- [ ] Confirm provider selection, streaming, cancellation, repeat-aware playback, ABC editing, file persistence, and existing workspace geometry still work.

## Milestone 2: Complete annotation loop

Outcome: the Music Tutor proposes structured annotations; the student edits or rejects individual proposals, atomically applies the remainder, sees them aligned with the score, and retains them across sessions.

### M2.1 Annotation mutations and proposal contracts

- [ ] Add `AnnotationProposal` and `ProposalState` contracts to the shared document/agent types.
- [ ] Reuse the Milestone 1 canonical `Annotation` validators for manual edits, proposals, IPC, and persistence.
- [ ] Validate that chord position lies within its measure span and supports multiple distinct onsets in one measure.
- [ ] Keep all schema validation/migration out of `useDocumentStore` and other React components.
- [ ] Add document-store annotation CRUD methods without incrementing ABC revision or appending `ScoreVersion`.

### M2.2 Proposal events and conversation v3

- [ ] Implement `propose_annotations` validation and server-controlled proposal metadata in Electron main.
- [ ] Cap proposals at 32 per run and emit typed `proposal-created` events.
- [ ] Add proposal, profile-route, and compact tool-display metadata to assistant turns.
- [ ] Upgrade the per-file conversation store from version 2 to version 3 with a pure migration.
- [ ] Migrate version-2 threads with empty/default proposal and tool metadata.
- [ ] Mark proposals `unavailable` when their run fails or aborts.
- [ ] Delete pending proposal records with a chat thread while retaining accepted document annotations.

### M2.3 Proposal review and atomic Apply All

- [ ] Add inline `AnnotationProposalCard.tsx` with individual Edit and Reject actions.
- [ ] Add one turn-level Apply All action; do not add individual Apply buttons.
- [ ] Keep cards read-only until their agent run completes.
- [ ] Let Edit validate and update the staged proposal without applying it.
- [ ] Let Reject collapse and exclude the proposal from Apply All.
- [ ] Before Apply All, compare every eligible proposal's `documentId` and `sourceRevision` with the active document.
- [ ] On mismatch, label proposals **Outdated**, disable all actions, and ask the user to rerun analysis.
- [ ] Validate all eligible proposals first; if any fail, apply none and identify the invalid cards.
- [ ] Otherwise append all eligible annotations and mark all eligible proposals accepted in one renderer state transaction.
- [ ] Exclude rejected, outdated, and unavailable proposals from Apply All.
- [ ] Test empty eligible sets, mixed rejected/edited proposals, validation failure, revision mismatch, repeated action, and all-or-none commit.

### M2.4 Annotation editor and direct user actions

- [ ] Add `AnnotationEditor.tsx` for manual creation, staged-proposal editing, and accepted-annotation editing.
- [ ] Provide fields appropriate to each kind; chord onset edits use exact rational position with a friendly beat/subdivision UI.
- [ ] Add explicit user Delete for accepted annotations.
- [ ] Save manually authored annotations directly without proposal state.
- [ ] Keep agent-initiated deletion out of scope.
- [ ] Add validation, keyboard, focus-return, cancel, and save-error tests.

### M2.5 React-owned annotation overlays

- [ ] Add a React-owned sibling overlay layer next to the abcjs container; never mount React children inside abcjs-owned DOM.
- [ ] Add pure `src/music/annotationLayout.ts` to project canonical annotations into SVG-local placements.
- [ ] Build render-time lookup from written measure and rational onset through parsed events/ABC source ranges to abcjs timing/selectable geometry.
- [ ] Use ephemeral source/SVG data only as lookup hints; never persist layout coordinates.
- [ ] Align transparent overlay SVGs with each abcjs SVG view box and bounds.
- [ ] Recompute geometry after score render, wrap, zoom, transpose, and `ResizeObserver` updates, coalesced to one animation frame.
- [ ] Do not recompute all annotation geometry on playback cursor ticks or ordinary chat streaming.
- [ ] Render:
  - modulation ribbons above the passage;
  - chord symbols and Roman numerals above the staff at rational onset;
  - voice-leading callouts below the passage;
  - explanation markers and side stickers.
- [ ] Disable pointer events on overlay backgrounds and enable pointer/keyboard interaction only on annotation elements.
- [ ] Add focused/unfocused styling using one restrained shared palette.
- [ ] Clicking/focusing an annotation activates its span and opens Edit/Delete details.

### M2.6 Persistence and complete-workflow verification

- [ ] Verify accepted and manual annotations survive reload and Electron restart.
- [ ] Verify annotation changes never change ABC revision/history.
- [ ] Verify deleting a chat thread cannot delete accepted annotations.
- [ ] Add overlay integration fixtures for multiple chord changes in 4/4, compound 6/8, simultaneous voices, and wrapped systems.
- [ ] Verify overlay alignment after resize, zoom, transpose, score rerender, and file switch.
- [ ] Electron smoke-test: select passage -> ask -> inspect route/tools -> receive proposals -> edit/reject -> Apply All -> click annotation -> reload.
- [ ] Run the full existing unit/component suite and production build.

## Current acceptance checklist

- [ ] Continuous pointer and keyboard range selection works across wrapped systems.
- [ ] Playback and measure-link navigation use `startMeasure` for ranges.
- [ ] One visible Music Tutor routes transparently among predefined profiles.
- [ ] Passage claims use immutable score tools and readable contextual theory language.
- [ ] Markdown is sanitized; measure links navigate; other links are highlighted but do not open.
- [ ] Chord analysis supports multiple rationally positioned changes in one measure.
- [ ] Proposals provide individual Edit/Reject and one atomic Apply All.
- [ ] Revision mismatch displays Outdated and disables proposal actions.
- [ ] Applied annotations render in the correct React-owned overlay tracks and persist.
- [ ] Existing score, playback, provider, editor, and persistence behavior remains green.

## Explicitly deferred to the next sprint

- Annotation fingerprints and dependency-level staleness.
- Stale visual treatment and regeneration.
- Agent-initiated annotation removal.
- Agent-authored note, rhythm, metadata, or ABC editing.
- External-link opening.
- Chord inversion and figured bass.
- Graphical voice-leading arrows.
- Disconnected selections and automatic whole-score analysis.
- Model accuracy certification/evaluation gate.
