# Pane drag investigation — 2026-10-26

Status: DONE.

## Symptom

Dragging a pane toward the lower-left area unexpectedly changed all three panes into side-by-side columns.

## Root cause

The three-pane hit test recognized corners only inside the outer 30% of both workspace axes. The remainder of the lower-left quarter was treated as a flat left-edge drop. In the browser, dragging Waterfall to approximately 8% from the left and 66% from the top reproduced `layout-horizontal`, even though the position appeared to be a lower-left stack target. The corner layout renderer itself worked correctly at the more extreme corner coordinates.

## Fix

The visible three-pane target map and hit testing now share 40% / 20% / 40% tracks. Four generous corner areas select stack slots. Four explicit edge-center bands select rows or columns; their active labels name the full arrangement. Releasing in the middle preserves the current layout. The existing two-pane edge behavior remains intact.

Files: `usePaneTabDrag.ts`, `PaneSnapOverlay.tsx`, `App.tsx`, and `workspace-split-stack.css`; contract updated in `spec/workspace-layout.md`.

## Verification

- Nine new regression cases failed against the old hit test and passed after the fix, covering inner corners and neutral-center release.
- The application integration test exercises all eight targets for each of the three panes (24 moves), verifies correct slots, unchanged pane/transport instances, center cancellation and reload persistence.
- Live browser checks passed for every pane in every corner, four explicit three-pane edges, and all four two-pane edges. Center and outside drops preserved layout. Both resize axes moved and returned correctly. Closing the solo pane expanded the stack; reopening and reload restored all three saved slots and the single dock.
- Full suite: 251 Node tests and 999 frontend tests passed (1,250 total). TypeScript, lint and production build passed, with existing lint and large-chunk warnings.

## Evidence

- [Reproduced column layout](pane-lower-left-bug.png)
- [Same lower-left drop after the fix](pane-lower-left-fixed.png)
- [Restored split after reload](pane-layout-after-reload.png)
- [Live browser checks](pane-drag-browser-results.json)
