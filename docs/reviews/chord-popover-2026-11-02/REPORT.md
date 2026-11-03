# Chord analysis details beside the measure

Date: 2026-11-02 (America/Vancouver).
Status: DONE.
Checkout: `/home/kevin/Workspace/chorale`, main, base `1b08982`, following the local automatic-coverage and duplicate-annotation patches. This change is local and uncommitted; unrelated working changes and score data were preserved.

## Behavior

Clicking an automatic chord badge now opens a floating details card at the left edge of the score panel, vertically aligned with its measure. It no longer inserts a row above the score or pushes the music downward. Chord selection, explanation, evidence, model attribution and Keep as annotation remain available. Accepted chord editing and range-analysis inspection keep their existing workflows.

The panel tracks the measure during scrolling and layout changes, accounts for interface zoom, and clamps to the visible score/window bounds. Long contents scroll inside the card. Scrolling the measure out of view, outside pointer/focus interaction, Close or Escape dismisses the panel. Close and Escape restore focus to the initiating chord if it remains present, or to the sheet when it has been removed. Outside interaction preserves the user's new focus. The popover is a non-modal dialog rendered outside the score SVG and zoomed/clipped score layout.

## Implementation

- Added `src/components/ChordAnalysisPopover.tsx` for measure anchoring, resizing, scrolling, viewport bounds and dismissal.
- Updated `SheetMusicView.tsx` to retain the initiating badge, highlight the active automatic chord, and present its existing details through the floating panel.
- Added matching styles in `src/components/analysis.css` and documented behavior in `spec/automatic-score-analysis.md`.
- Extended the desktop smoke test to check left placement, measure alignment, unchanged score position, Escape/focus restoration and keeping annotations.

## Verification

- Dedicated popover checks: 4 passed (left/measure anchoring, scroll tracking and offscreen dismissal, narrow bounds/interface zoom, internal/outside/Escape interaction).
- Existing sheet/overlay checks: 52 passed.
- Node service suite: 261 passed.
- Complete interface suite: 1,109 passed across 119 files; 1,370 total service and interface tests passed.
- Typecheck and web/Electron builds: passed, including a final web build after the dialog accessibility update.
- Lint: 0 errors, 53 warnings in the existing workspace.
- Desktop analysis smoke: passed with synthetic provider responses.
- Diff/whitespace check: passed.

The desktop screenshot `chord-popover.png` was visually inspected: the card appears at the left at staff height, the selected chord remains visible, and the score stays in place. This preview uses a synthetic test score. `analysis.png` and `settings.png` are supporting smoke-test screenshots.

No provider-backed musical inference, score edits or annotation changes were performed on the user's managed scores. Restart the app built from this checkout to load the updated interface.
