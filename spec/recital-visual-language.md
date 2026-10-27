---
title: Recital visual foundation
status: implemented
date: 2026-10-26
source_files:
  - tokens.css
  - src/main.tsx
  - src/index.css
  - src/chorale-theme.css
  - src/styles/controls.css
  - src/styles/recital.css
  - src/styles/waterfall.css
  - src/styles/mcp-integration.css
  - src/components/ErrorBoundary.tsx
  - src/components/chat/ChoraleQueueList.tsx
  - src/components/chat/ChoraleTokenUsage.tsx
  - src/utils/appearance.ts
  - src/hooks/useAppearance.ts
  - src/components/FileRail.tsx
  - src/components/AgentChatPanel.tsx
  - src/components/SettingsModal.tsx
  - src/assets/chorale-logo.svg
  - src/components/WaterfallView.tsx
test_files:
  - src/utils/__tests__/appearance.test.ts
  - src/components/__tests__/SettingsModal.test.tsx
  - src/components/__tests__/SettingsAppearance.test.tsx
  - src/components/__tests__/FileRail.test.tsx
  - src/styles/__tests__/workspaceLayoutCss.test.ts
related_specs:
  - DESIGN.md
  - spec/design.md
  - spec/workspace-layout.md
  - spec/abc-editor.md
  - spec/settings-and-auth.md
---

# Recital visual foundation

Adopt the imported Recital visual language around the existing workspace. Preserve the established layout, score editing, playback, proposal review, and persistence contracts.

## Surface and signal roles

`tokens.css` owns all application colors, fonts, radii, and shadows. Frame and dock stay dark in both themes. Wings follow the selected theme. The backdrop surrounds a bright, square paper score. Each region explicitly binds its own foreground, borders, controls, and focus color, so Studio never inherits dark text on the dark frame or light text on paper.

Sound controls use vermilion. Chat and selected score context use blue. Files, Tools, settings, and pane tabs use neutral selection indicators. Pending/errors use amber plus text; saved/applied uses sage. Voice inks are restricted to score/source/waterfall and voice identity controls. Existing six-voice support is retained using the four named stage inks and two supplemental inks. On-paper and night variants share voice identity.

## Typography and styles

Load only DM Sans 400/500/600 for interface text, Instrument Serif 400 and italic for score/display titles, and DM Mono 400/500 for source and music metadata. Use only `--font-ui`, `--font-title`, and `--font-meta` in application styles. Music glyph fallbacks remain available for notation controls. Consolidate legacy color aliases centrally, remove superseded visual declarations, and preserve layout-related overrides until their contracts are separately replaced.

Pane tabs attach to a visible one-pixel pane boundary. Left-rail tabs are flat icon-and-label controls with a small underline for the active panel; keyboard focus uses a thin neutral outline. Raised active tiles, inset shadows and decorative active borders are excluded.

The paper score and floating controls have the two elevation levels from DESIGN.md; panels and rows remain flat. Only the notation column paints paper and its shadow. A single compact gutter replaces nested workspace padding; range annotations sit alongside on the backdrop, and empty annotation tracks collapse. Use consistent chip/control/panel/popover radii. Theme transitions respect reduced motion. High contrast raises muted text and separator contrast.

## Appearance preferences

Settings > Appearance provides Theme (Recital, Studio, Match system) and Hall color (Charcoal, Walnut, Velvet, Conservatory), alongside the existing interface scale. Default is Recital and Charcoal. Persist validated display preferences as `chorale.workspace.theme` and `chorale.workspace.hall`. Apply resolved `data-theme` and `data-hall` before mounting, follow OS changes only in Match system, and synchronize client storage changes. Studio offers independent Linen, Sage, Clay and Lavender accent palettes for the surrounding workspace. Persist the validated accent as `chorale.workspace.studioAccent` and apply `data-studio-accent` before mounting. Only the relevant hall or accent controls are shown; both selections survive theme changes. Accent palettes leave paper, sound and context colors consistent. The dark playback dock binds its measure, selection and progress backgrounds as well as its foregrounds to frame roles in every theme. Measure text uses the Sound accent; selected passage text uses the context accent. Preferences must not interrupt startup when local display preference storage is unavailable.

The compact sheet zoom bar overlays the bottom center of the score viewport, without reserving layout space or covering the score title. It is faint and translucent while idle, fades further during scrolling, and becomes readable on hover or keyboard focus. Its existing zoom actions are preserved. Staff lines, ledger lines, stems and notation use dark paper ink; panel-border colors must never override engraving strokes or outline thin filled staff/ledger paths. The About logo is bundled into the application so opening Settings does not need a later public-path image request.

## Existing content

The conversation surface remains named Chat. Style existing messages, context chips, progress, proposal cards, source validity, settings dialogs, file menus, the playback dock, ABC source, and waterfall without adding implied analysis/practice capabilities. The original imported design and seven concept PNGs are preserved under `docs/design/recital/`.

## Verification

Run the repository test, typecheck, lint, and production build gates. Verify browser screenshots with a representative score, source strip, Tools and settings; check both themes, all halls, keyboard focus, persistence and system-theme changes. Confirm notation stays ink on paper, playback/context/status meanings remain distinct, and controls stay reachable at narrow desktop widths and enlarged interface scale.
