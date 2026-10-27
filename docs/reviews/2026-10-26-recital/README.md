# Recital visual foundation review

Latest paper refinement: [Compact sheet framing and conditional annotation space](sheet-framing-followup.md).

Latest annotation fix: [Chord editor containment and focus dismissal](chord-editor-followup.md).

Latest sheet refinement: [Zoom overlay, engraving contrast and Voices dismissal](sheet-display-followup.md).

Latest layout investigation: [Corner drop targets and pane rearrangement](pane-drag-followup.md).

Appearance refinement: [Studio accents, playback contrast, bundled logo and compact zoom](studio-followup.md).

Worktree: `recital-visual-language`, branch `feat/recital-visual-language`, based on `920c134`.

Imported the Recital design and seven concept images, preserved the prior design, and applied shared color, typography, radius and elevation roles to the existing workspace. Settings provides Recital/Studio/system themes and four hall colors. The conversation panel remains named Chat.

The follow-up refinement restores a visible boundary around Sheet, ABC and Waterfall panes, with outlined tabs attached to their top edge. Left-rail tabs are flat, with a small active underline and a thin keyboard focus outline.

## Browser review

Preview: http://127.0.0.1:5178/?file=score-bwv371, isolated daemon on port 1691 with separate preview storage.

- [Pane tabs and rail keyboard focus](tabs-and-rail-focus.png): Walnut with Files, Sheet and Measure Source visible at a narrow desktop width. Active Files has a small underline; keyboard-focused Tools has a neutral outline.
- [Conservatory appearance controls](conservatory-settings.png).
- [Studio appearance controls](studio-settings-final.png): dark frame and dock, light wings, retained and disabled hall choice.
- Charcoal, Velvet and Conservatory were switched through the UI and checked against rendered frame, wing and paper colors. Walnut was restored afterward.
- Existing source scrolling and score zoom remained available. Modal layering keeps the dock under the settings overlay.

Browser Chat is not available in this build, so its visual styles were not inspected in a running Electron window. Canvas video export retains its existing literal palette.

## Validation

- Full `npm test`: 251 Node tests and 988 frontend tests passed (1,239 total).
- An initial audio transport timing test failed, then passed in the focused rerun and the full suite rerun. Audio logic was not changed.
- TypeScript and production build passed. Lint completed with existing warnings. The build retains its existing large-chunk warning.
- Appearance tests cover validated defaults, persistence, blocked preference storage, theme and hall selection, system changes, cross-window synchronization and listener cleanup.

The design concepts also show diagnostics, analysis lenses, practice behavior and agent selection. Those remain separate feature work.
