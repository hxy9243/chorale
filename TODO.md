# TODO

Date: 2026-07-25  
Goal: implement the Figma `Chorale — Chat with Music Sheet · V1` design in phased, testable steps.

## Recommended sequencing

The requested priorities make sense, but one reorder is worth making:

1. Build the static UI shell first.
2. Introduce file/session management before deeper interaction wiring.
3. Add the shared `ScoreAnchor` before playback/chat-specific selection features.

That order avoids rebuilding selection and playback state twice once multiple files exist.

## Phase 1. Build basic UI structure with minimal or no behavior

1. Replace the current PoC layout with the Figma-aligned workspace shell: header, left file rail, central score area, right chat panel, and bottom playback dock.
2. Move existing components into their target regions even if they remain mostly presentational.
3. Add placeholder affordances for file actions, chat thread controls, score metadata, anchor chips, and playback controls.
4. Implement the base CSS, layout tokens, spacing, and responsive rules needed for the desktop design.
5. Treat the visual language as part of the deliverable, not polish:
   - warm off-white workspace surfaces instead of stark white
   - dark charcoal file rail and playback dock as persistent utility bands
   - muted coral-raspberry accent for import, selection, send, and annotation emphasis
   - soft mint and pale blue status pills for saved and ready states
   - thin neutral borders, large card radii, and light shadowing rather than glassy effects
   - editorial hierarchy with compact utility labels and larger score-title typography
6. Match the score-focused density of the Figma file:
   - generous whitespace around the score card
   - compact controls with pill or segmented-button treatment
   - restrained iconography and no loud gradients
   - visual separation between durable file objects, temporary selections, and chat actions

Validation:

- The app visually matches the Figma structure at desktop width.
- The app visually reflects the Figma look and feel, not just its box layout.
- Layout regions resize and collapse predictably without overlapping.
- Existing sample-load and chat components still render inside the new shell.

## Phase 2. Implement file import and file management

1. Introduce domain types for `FileDocument`, `ScoreVersion`, `BuildResult`, and file-rail items.
2. Replace top-level single-file state in `App.tsx` with an active-file session model.
3. Refactor import and sample loading so both create or update `FileDocument` entries instead of mutating loose top-level state.
4. Support active-file switching in the left rail with clear loading, error, and empty states.

Validation:

- Imported files and built-in samples both appear in the file rail.
- Switching files updates the visible score, editor source, and playback target.
- TypeScript build passes and existing import/sample behavior does not regress.

## Phase 3. Implement the global anchor and shared interaction model

1. Introduce `ScoreAnchor`, `ScoreInfo`, and the session/controller state that owns the active anchor.
2. Define a single anchor shape that can represent clicked notes, measures, or future selected passages.
3. Surface the active anchor in shared UI chrome: score header, playback dock, and chat composer banner/chips.
4. Add clear/replace rules so every component reads and writes the same anchor source of truth.

Validation:

- The app maintains one active anchor per active file.
- Changing files swaps anchor context cleanly.
- Anchor updates propagate without remounting score, playback, or chat panels.

## Phase 4. Implement basic score selection and playback interaction

1. Extend score rendering callbacks so clicks on rendered notation resolve into a basic `ScoreAnchor`.
2. Highlight the currently selected note or measure in the score view with simple visual treatment.
3. Wire playback controls to the selected anchor where possible, including seek/jump behavior and current-location display.
4. Keep the first pass narrow: no durable annotations, no advanced proposal flows, just shared selection and playback response.

Validation:

- Clicking the score updates the active anchor and visible selection state.
- Playback controls respond consistently to the current selection.
- Selection survives routine UI updates such as zoom or chat panel toggles.

## Phase 5. Implement selection-aware chat interaction

1. Attach the active `ScoreAnchor` to outgoing chat messages.
2. Show the selected score context in the composer and transcript with lightweight anchor chips or labels.
3. Allow the chat panel to clear, replace, or confirm the current selection context without mutating the score itself.
4. Preserve the current streaming behavior while moving conversation state toward file-scoped ownership.

Validation:

- Sending a chat message captures the active file and active anchor together.
- Changing the score selection updates the chat composer context immediately.
- Chat remains usable when no selection is active, with a clear fallback state.

## Phase 6. Convert the score workspace to continuous score plus annotation-ready structure

1. Upgrade the score surface toward the design: metadata header, continuous scroll behavior, measure labels, and score toolbar actions.
2. Add structural overlay layers for future annotations and passage highlights, even if persistence is not implemented yet.
3. Add an annotation detail affordance with an `Ask about this` entry point that reuses the shared anchor model.
4. Keep overlay positioning data-driven so later persistence does not require DOM scraping.

Validation:

- Score remains readable and scrollable with existing samples.
- Selected passages and overlay placeholders stay positioned correctly after zoom changes.
- `Ask about this` hands off the correct anchor into chat.

## Phase 7. Convert the ABC editor into a synchronized split pane

1. Move the ABC editor into the central workspace as a resizable pane aligned with the design.
2. Add visible validity status and live refresh status to the editor chrome.
3. Keep editor state revision-aware and scoped to the active file.
4. Persist divider state and editor visibility per session or per file as appropriate.

Validation:

- Dragging the divider resizes score and editor panes without layout breakage.
- ABC edits still update the rendered score for the active file.
- Invalid ABC clearly disables or clears stale render/audio output.

## Phase 8. Make score rebuilds revision-gated and atomic

1. Replace implicit `abcCode` side effects with an explicit build pipeline keyed by file revision.
2. Debounce validation and rebuild work after editor changes.
3. Cancel older async score and audio work when a newer revision starts.
4. Commit build results only when they match the latest file revision.

Validation:

- Rapid ABC edits do not flash stale score or playback state.
- Invalid intermediate edits cannot overwrite valid newer output.
- Unit tests cover stale-job rejection and invalid-source handling.

## Phase 9. Upgrade chat and durable file objects

1. Replace the single local conversation with per-file chat threads and thread summaries.
2. Introduce browser persistence for file-owned objects, preferably IndexedDB.
3. Store annotations, score info, chat thread summaries, and restorable source versions by file.
4. Keep chat history disposable without deleting durable file objects.

Validation:

- Reload restores the correct thread for the active file.
- Switching files switches chat threads and visible durable score objects together.
- Reload preserves annotations and score info independently of the active thread.

## Phase 10. Add proposal-based score tools and final QA

1. Define score-tool interfaces for reading score info, creating or updating annotations, and proposing ABC edits.
2. Keep source-changing actions reviewable: tool proposes, user reviews, app applies.
3. Record accepted tool actions as durable file revisions.
4. Run the full automated suite: `npm test -- --run`, `npm run build`, `npm run lint`, and `git diff --check`.
5. Perform browser visual QA against the Figma layout and verify keyboard/focus behavior.

Exit criteria:

- Workspace behavior matches the Figma interaction model closely enough to dogfood.
- File management, anchor propagation, playback, and chat selection all share the same session model.
- Durable file objects and ephemeral chat state are clearly separated in code and behavior.
- Stale render/audio/chat updates are rejected correctly.
