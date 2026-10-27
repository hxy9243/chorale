# Compact sheet framing

Status: DONE.

## Design

The broad borders came from several nested padded wrappers and an annotation scene that reserved blank side tracks even when no range annotations existed.

The notation column now owns the square paper surface and its shadow. The surrounding zoom scene stays transparent, and range annotations sit beside the paper on the backdrop. One compact gutter replaces the canvas, sheet and paper-wrapper padding. Empty annotation rails and their balancing track/gaps collapse, including for scores with chord badges only. Existing pane boundaries and attached tabs remain defined.

Music size, engraving, score zoom, source and annotation contents are preserved. Adding/removing range annotations adjusts the side tracks without replacing the notation SVG or clearing selection. A collapsed rail is hidden from focus/accessibility navigation; after deleting its last annotation, explicit close returns focus to the sheet instead of the hidden rail.

## Verification

- The empty-track regression failed before implementation. The last-annotation focus regression also failed before its fix. Both pass afterward.
- Focused verification: 62 tests passed across SheetMusicView, AnnotationRail, AnnotationEditor and score scene sizing.
- TypeScript, lint, production build and whitespace checks passed. Existing lint/act warnings and the large bundle warning remain.
- The initial full suite passed: 251 Node tests plus 1,009 frontend tests, exit 0. After the keyboard fallback, the complete frontend suite passed 1,010 tests with exit 0, for 1,261 passing tests across both suites.
- Browser: checked the unannotated Nocturne and the annotated Bach score in Studio/Sage and Recital/Velvet at 50%, 60% and 100% score zoom. White paper is restricted to notation; visible range cards remain beside it. The chord editor remains contained and closes on outside focus.
- Reload preserved Studio/Sage, 100% score zoom and the Sheet/ABC split. At 100%, the unannotated paper was about 768 px wide and centered within 0.01 px of its viewport. The empty rail was hidden, and horizontal scrolling was unnecessary.
- At the end of the Nocturne, the paper ended around 491 px and the zoom pill began around 497 px: the final staff stayed clear of the overlay.
- Restored the requested Nocturne view in Studio/Sage at the original 100% zoom, with its opening system visible. The matched before/after framing images use 60% zoom.

## Evidence

- [Before, at 60%](sheet-framing-before.png)
- [After, at 60%](sheet-framing-nocturne-60.png)
- [Annotations beside the paper](sheet-framing-annotations.png)
- [Dark-mode framing](sheet-framing-recital.png)
- [Final staff and overlay clearance](sheet-framing-final-staff.png)
- [Restored 100% view](sheet-framing-handoff.png)
