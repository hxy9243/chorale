# Studio follow-up — 2026-10-26

## Symptoms and causes

The measure and selection pills had light text on light backgrounds in Studio. Their legacy selectors used the workspace backdrop instead of the dock material, and overrode the lower-specificity Recital styles.

The About image had zero natural dimensions while the preview server was stopped. Restarting the server and reopening About loaded the SVG correctly. Its late public-path image request was the point of failure.

The zoom bar measured 197.36 by 37.45 CSS pixels before the refinement.

## Changes

- Bound measure, selection and progress backgrounds to the dark frame roles with the same selector specificity as the dock styles. Measure text uses Sound; selected passage text uses context blue.
- Added independently persisted Studio accents: Linen, Sage, Clay and Lavender. Palette choices switch with the resolved theme and survive theme changes and reloads. Recital hall selection is retained.
- Moved the existing SVG into application assets and bundled it as an inline image. The browser shows nonzero natural dimensions and a data image source.
- Compacted the zoom control to 162.20 by 30.19 CSS pixels: 17.8% narrower and 19.4% shorter. Its 11px labels and existing zoom actions remain available.

## Evidence

- [Studio accent settings](studio-accent-settings.png)
- [Fixed playback labels and compact zoom control](studio-playback-fixed.png)
- [Bundled About logo](studio-about-logo-fixed.png)

Browser checks verified all four palettes against rendered wing/backdrop colors. Paper stayed unchanged. The measure label contrast is 4.97:1 and the selected-passage label is 6.03:1. Accent and the restored Nocturne score survived a page reload. The Nocturne source was reopened from the original local MXL after restarting the stopped preview returned to the sample score.

## Tests

Appearance and settings regression tests cover invalid stored accents, independent palette retention, reload persistence, cross-window accent changes, and an embedded logo source. The focused appearance/settings/zoom checks passed (19 tests). TypeScript, lint and production build passed, with existing lint and large-chunk warnings.

Full suite: 251 Node tests and 989 frontend tests passed (1,240 total).

Status: DONE. The live preview is left on Studio Linen with the Nocturne score reopened; the screenshots above demonstrate the Sage accent.
