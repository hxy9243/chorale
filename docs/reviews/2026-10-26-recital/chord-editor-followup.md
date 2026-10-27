# Chord editor overflow and focus dismissal

Status: DONE.

## Symptom and root cause

The chord editor stayed open after focus moved away, and its fields extended beyond its border.

The 240 px popup inherited an automatic grid track with a 253.6 px minimum-content width, driven by the unwrapped action row. Its available inner width was only about 213 px. The fields expanded with that track. The editor also had no outside-pointer, outside-focus or window-blur dismissal; it only closed through explicit actions.

## Fix

- Constrain the form and field tracks to `minmax(0, 1fr)` and allow actions to wrap. The popup is up to 288 score-scene pixels wide, capped by its notation system, so the normal action row fits without pushing Save below the short sheet pane.
- Inline chord editing cancels an unsaved draft on outside pointer/focus or window blur. Internal interaction stays open. Outside dismissal preserves the user's new focus; explicit Cancel/Escape still restores badge focus.
- Pending save/delete operations remain mounted, including on Escape, so asynchronous errors can still be shown. Full annotation forms retain their existing explicit-close workflow.
- Keep the React annotation overlay beside the abcjs-owned paper. No new portal or notation DOM ownership changes were needed.

Source: `AnnotationEditor.tsx`, `AnnotationOverlay.tsx`, `SheetMusicView.tsx`, and the chord editor rules in `chorale-theme.css`. Contract: `spec/annotations-and-proposals.md`.

## Evidence and regression coverage

- Reproduced both issues in the Bach BWV 371 preview before changing code.
- Five checks failed before the fix: three outside-dismissal cases, pending-save Escape behavior, and integrated sheet dismissal. All passed afterward. The full-form preservation case passed before and after.
- Focused tests: 54 passed across AnnotationEditor, SheetMusicView and AnnotationRail. New cases live in `AnnotationEditor.test.tsx`; the existing SheetMusicView chord-switching test now checks discarded drafts and preserved outside focus.
- Full `npm test`: 251 Node tests and 1,008 frontend tests passed (1,259 total), exit 0.
- Browser, Studio/Sage: inputs and all three action buttons were inside the popup border at 100% and 60% score zoom. At 100%, every action also fit within the short sheet pane. Switching to another chord kept the editor inside the notation width.
- Keyboard navigation within fields/actions kept the popup open; Tab out, outside search focus and a click on blank backdrop collapsed it. Reopening restored the saved chord, without persisting the test draft. Escape restored focus to the corresponding badge. Window blur and pending failures were covered in component tests.
- TypeScript, lint, production build and whitespace checks passed. Existing React lint warnings and the large bundle warning remain.

## Screenshots

- [Overflow before the fix](chord-editor-overflow-before.png)
- [Contained controls at 100%](chord-editor-contained.png)
- [Contained controls at 60%](chord-editor-60-percent.png)

Related: the preceding Voices change also distinguished outside dismissal from explicit close to preserve the user's focus target. Engraved-label popup history reinforced preserving annotation sibling ownership and checking stacking/overflow before introducing a portal.
