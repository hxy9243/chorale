---
title: "Workspace Layout Spec"
description: "Specification for the top-level desktop workspace structure, header, file rail, central score workspace, and chat panel"
category: "core-workspace"
date: 2026-07-28
updated: 2026-10-26
status: "implemented"
source_files:
  - src/App.tsx
  - src/main.tsx
  - src/components/Header.tsx
  - src/components/FileRail.tsx
  - src/components/DeleteFileConfirmModal.tsx
  - src/components/AgentChatPanel.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/components/ScoreCardHeader.tsx
  - src/components/EditingHistoryModal.tsx
  - src/components/PaneSnapOverlay.tsx
  - src/utils/abcMetadata.ts
  - src/utils/fileHistory.ts
  - src/hooks/useWorkspaceLayout.ts
  - src/utils/workspaceSizing.ts
  - src/styles/controls.css
  - src/hooks/useWorkspacePanes.ts
  - src/hooks/usePaneTabDrag.ts
  - src/hooks/useSplitStackLayout.ts
  - src/components/workspace/WorkspacePaneMenu.tsx
  - src/hooks/useResizablePanel.ts
  - src/styles/workspace-responsive.css
  - src/styles/workspace-split-stack.css
  - tokens.css
test_files:
  - src/App.test.tsx
  - src/components/__tests__/FileRail.test.tsx
  - src/components/__tests__/Header.test.tsx
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/components/__tests__/EditingHistoryModal.test.tsx
  - src/utils/__tests__/abcMetadata.test.ts
  - src/utils/__tests__/fileHistory.test.ts
  - src/hooks/__tests__/useResizablePanel.test.ts
  - src/hooks/__tests__/useWorkspacePanes.test.ts
  - src/hooks/__tests__/useWorkspaceLayout.test.tsx
  - src/utils/__tests__/workspaceSizing.test.ts
  - scripts/electron-smoke.mjs
  - src/hooks/__tests__/usePaneTabDrag.test.ts
  - src/hooks/__tests__/useSplitStackLayout.test.ts
  - src/components/workspace/__tests__/WorkspacePaneMenu.test.tsx
  - src/styles/__tests__/workspaceLayoutCss.test.ts
  - src/test/usability.test.tsx
related_specs:
  - spec/design.md
  - spec/score-surface.md
  - spec/abc-editor.md
  - spec/playback-dock.md
  - spec/pi-agent-chat.md
  - spec/settings-and-auth.md
---

# Workspace Layout Spec

Date: 2026-07-28  
Updated: 2026-10-25
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the top-level desktop workspace composition for Chorale.

The design is a persistent application workspace with two primary regions:

1. left work rail (spans the full viewport height, top of page to bottom)
2. central column: global header above the central score workspace

The left work rail spans the full viewport height. The header spans only the central column; there is no right work rail or separate chat column.

## 2. Header

The header communicates score context, editing actions, and persistence/render health without cluttering the score reading surface. It sits at the top of the central column only — the full-height left work rail sits beside it.

Required regions:

- left: edit history actions (`Undo` / `Redo` buttons without borders, tooltips indicating shortcuts Ctrl+Z / ⌘Z and Ctrl+Shift+Z / ⌘Shift+Z)
- center: active file title/breadcrumb, dead-centered between the two flanking groups; it truncates with an ellipsis rather than overlapping anything
- right: Sheet, ABC code, and Waterfall visibility toggles grouped in a warm stone segmented pill next to one status dot and label (`Music ready`, `Music pending`, `Saving…`, or `Save failed`)

The three regions share one row and never collide with each other or with the side rails. Adaptivity is driven by the central column's own width (container queries), not the viewport: at narrow column widths pane toggles and history buttons collapse to icons while the single status stays visible; the title keeps truncating throughout.

No branding icon or wordmark appears in either the header or the rails; the application name lives only in the window/document title.

The Electron window and renderer document title are exactly `Chorale`. Save and build state capsules live in the global header so they remain continuously visible when scrolling through long musical scores.

## 3. Left work rail

The left rail uses a persistent narrow vertical selection bar (`3.5rem` / `56px`) rendered in deep warm charcoal (`#292824`) with warm parchment icons (`#b8b2a6`, active `#f5f2eb` on `#3a3832` with a terracotta accent indicator) that remains visible at all times and spans the entire page height to switch between **Files**, **Tools**, and desktop **Chat** panels. Each selection is one icon with a tooltip and accessible name. Clicking the currently active panel icon collapses the secondary content panel stack; clicking an icon while collapsed expands the rail with that panel active.

A dedicated **toggle expansion** icon sits at the very top of the selection bar (typical sidebar-toggle glyph: `PanelLeftClose` when expanded, `PanelLeft` when collapsed). Clicking it collapses the rail or re-expands it restoring the **last focused panel tab**. The last focused panel persists across refreshes as `chorale.workspace.fileRailActivePanel`.

A bottom-anchored **Settings** icon is a direct action that opens the settings dialog without replacing the selected work panel. Project and library hierarchy is omitted until the product has real project-backed behavior.

Required content:

- **Files**: equal-weight **New Score** and **Import Score** actions directly under the panel title,
  stacked vertically as two rows of text with full-width underlines and padding (instead of a square button style);
  import accepts `.xml`, `.musicxml`, `.mxl`, and `.abc`, while New Score opens the fixed two-staff
  piano-score builder. The panel also contains the active and available file list with format badge
  (MXL, ABC, MusicXML) and state indicator (`original`, `edited`)
- **Tools**: an `Editing history` button to open the score history timeline modal; future score tools join this panel rather than the score header
- **Settings**: its action icon anchors to the bottom of the selection bar and opens application settings directly
- icon-only panel selections expose hover titles and accessible names
- dedicated top-anchored toggle expansion icon (`PanelLeftClose` / `PanelLeft`) that collapses the rail and re-expands it to the last focused panel; last focused panel persists as `chorale.workspace.fileRailActivePanel`
- file management actions: compact 44px rows omit a leading document icon and use the full row as the pointer drag surface; sortable transforms move neighboring rows around a persistent source slot while a matching overlay follows the pointer and settles into place, without a native drag-image handoff or disappearing placeholder; Arrow Up/Arrow Down on the focused file name provides keyboard reordering; newly created or imported scores default to the top of the file list for immediate user visibility; score deletion allows deleting documents down to 0, which displays an empty workspace placeholder until a file is imported or loaded
- vertical scrolling is allowed inside the selected panel; horizontal scrolling is clipped
- persistent icon rail with collapsible content panel state (`railCollapsed` state) and horizontal drag-to-resize handle (`.file-rail-resize-handle`) when expanded; features a generous 14px hit target, `col-resize` cursor, transparent unhovered state preserving a clean sidebar edge with no right-side shadow or white sliver lines (nothing on the right side of the scroller), and a tactile hover indicator with a full-height track line and centered terracotta grip capsule (`#ad503b`)
- default width at 25% of the logical layout viewport when expanded (initially capped at 560px), with a 240px minimum; dragging can grow the shared sidebar until the other visible panes reach their minimum widths
- persistent resized width in local storage (`chorale.workspace.fileRailWidth`) and collapse state (`chorale.workspace.fileRailCollapsed`)

Implication:

- Chorale has a file/session model persisted through the shared SQLite service in browser and Electron. Display preferences and active-file selection remain local to each client.
- sample tracks and imported scores populate the file rail directly.

## 4. Central workspace

The center column is the primary editing and reading surface, following the **Focused Conservatory** ("Concept B") layout where the score page and its right-hand Margin Annotation Rail retain full horizontal width by default.

It contains:

- score metadata header (`ScoreMetadataHeader`): centered serif title (`--font-serif`), right-aligned score taglines/attribution (composer, author/lyricist, subtitle, origin, rhythm) with an Add Field menu (`+`), and centered interactive metadata chips (Key, Meter, Tempo) supporting inline ABC editing and validation
- a compact rounded display-options pill (`ScoreCardHeader`) docked cleanly at the upper-right of the score paper so it never collides with the centered serif score title; it is translucent at rest, becomes less translucent during score scrolling, and becomes clearest on hover or keyboard focus
- pane-top tabs: each active pane (Sheet, ABC code, and Waterfall) has a dedicated tab attached directly flush on top of the actual pane (`| Sheet ✕ |` and `| ABC code ✕ |`); the tab's left edge aligns with the pane card's left edge, and clicking `✕` on a tab closes that pane
- pane elevation and layout: a small gap separates panes, each pane features a 1px border and soft paper drop shadow, and their vertical heights align and extend cleanly flush to the bottom with zero bottom padding on the central workspace
- `+` pane launcher: a `+` button in the workspace tab strip opens a small popover window listing the available panes ("Sheet", "ABC source", and "Waterfall") to open/show; if all panes are closed, an empty desk state displays a prompt to open panes
- continuous full-page paper score surface (`.sheet-viewport` spanning 100% width and height with simple pure-CSS paper background, full-width notation track + right-hand Margin Annotation Rail utilizing 100% of the Sheet tab pane width, auto-centering playback line, line-start measure numbers, and zoom layout space reservation)
- optional split ABC editor pane with interactive drag divider (defaulting to `'vertical'` orientation — a **Synchronized Horizontal Lower ABC Strip** docked beneath the Sheet pane so the score and Margin Annotation Rail are never horizontally squeezed):
  - in vertical orientation (`layout-vertical`, the default), a full-width horizontal divider (`.editor-divider.divider-horizontal` with `row-resize` cursor and centered horizontal grip capsule) allows height adjustment (bounded between 180px and the available shell content height minus the 200px Sheet minimum and 14px divider, default 320px, persisted as `chorale.workspace.editorHeight`; bounds are reapplied before paint on reload/reopen and whenever the shell resizes; if both minimum heights cannot fit, the vertical shell scrolls so panes and divider remain reachable)
  - in horizontal orientation (`layout-horizontal`), a full-height vertical divider (`.editor-divider` with `col-resize` cursor, full-height guide line, and centered terracotta grip capsule on hover) allows width adjustment (bounded between 320px and 720px, default 420px, persisted as `chorale.workspace.editorWidth`)
  - both panes support structural editing with the collapsible Measure Source toolbar belt
- drag-and-snap pane rearrangement: users can drag any open pane by its tab (`.pane-tab`) using pointer events to snap and rearrange the panes. As the pointer moves across the workspace, four snap zones (top, bottom, left, right) activate a translucent accent drop overlay (`.pane-snap-overlay`) indicating the target layout. Releasing the pointer snaps the panes into that arrangement (horizontal or vertical, with the dragged pane placed in the target region), updating and persisting `paneOrientation` and the three-pane sequence in `localStorage`, while retaining the legacy Sheet/ABC `paneOrder` preference. Only a primary-pointer release inside a nonempty workspace commits a snap; cancellation, Escape, lost capture, or an outside drop discards the preview without changing persisted layout. Stacked panes each use the full shell content width, without horizontal split constraints.
- playback dock anchored to the visible bottom of the central workspace with a distinct accent color (dark ink capsule surface) and drop shadow to separate cleanly from the desk background (expanded max-width bounded to 900px with playback progress occupying at least 60% of the width, and selected measure anchors rendered on a separate text metadata row to prevent blocking or clipping the track)

### Split stack layouts

The pane launcher includes Columns, Rows, Split stack left, and Split stack right. Selecting a split stack opens all three panes. The first two panes in the saved sequence occupy the top and bottom of the stacked column; the third occupies the other full-height column. The mirrored option retains the same stacked pair. A default sequence places Sheet above ABC on the left and Waterfall on the right.

The launcher menu renders above pane clipping boundaries, stays beside its launcher when space permits, and flips above it near the viewport bottom. Its placement accounts for interface zoom and remains scrollable in short windows.

Opening the launcher moves keyboard focus into its menu. Arrow keys and Home/End navigate pane and layout actions; Escape dismisses the menu and returns focus to the launcher. Selecting an action also restores launcher focus when it remains mounted, while clicking outside preserves the user's new focus target.

With three panes open, a visible 3-by-3 target map separates four corner stacks from the four edge-center row/column arrangements. Corner targets occupy the outer 40% on each axis; only the central 20% edge bands select a full row or column layout. The center 20% by 20% region preserves the current arrangement on release. The target map uses the same proportions as hit testing, and active edge labels explicitly say Rows or Columns. Two-pane dragging retains its existing four edge targets. Dragging a tab into a workspace corner previews and selects that half-column slot. The dragged pane takes the selected top/bottom slot, the next remaining pane fills the other stacked slot, and the last remaining pane fills the opposite column. Existing edge-center targets return to a single row or column. Two-pane drag behavior is unchanged.

Two independent keyboard/pointer resize handles adjust column widths and stacked heights. Proportions persist as `chorale.workspace.stackColumns` and `chorale.workspace.stackRows`; `paneOrientation` additionally accepts `split-left` and `split-right`, preserving existing horizontal/vertical settings and `paneSequence`/legacy `paneOrder`. Resize calculations use the rendered content box and account for interface zoom. Each column retains a 240px minimum and each stacked row a 180px minimum; undersized workspaces scroll to keep all panes and handles reachable.

Closing a pane collapses its empty slot while retaining the saved split arrangement: a remaining stack member fills its column, the stacked pair fills the workspace if the solo pane closes, and a lone pane fills the workspace. Reopening restores its slot without reordering. Waterfall visibility persists so the selected three-pane layout survives reload. Pane components stay under the same parent across layout changes, and the single shared playback dock continues uninterrupted.

The score and editor panes present clean physical paper depth above the desk surface. Native system window controls (minimize, maximize, close) are enabled without an application menu bar.


## 5. Chat in the left work rail

Desktop Chat is the third tab in the left work rail, alongside Files and Tools. Only the selected panel is visible. Chat uses the shared sidebar width and right-edge resize handle; there is no right rail, independent chat width, or chat overlay. There is no fixed maximum width on the shared rail. Its maximum follows the logical viewport width after reserving the central workspace minimum (560px), any side-by-side ABC editor minimum (320px), and any side-by-side Waterfall minimum (140px), plus dividers. Vertically stacked panes share the same width reservation; split stacks reserve their two 240px grid-column minimums. Chat retains a 336px rail minimum so the transcript has at least 280px beside the 56px icon bar. If the viewport cannot fit all minimums, the rail keeps its usable minimum and the existing pane scrolling handles the constrained center.

The shared collapse control and clicking the active Chat tab collapse the left panel. Reopening restores Chat. The assistant close button also collapses the shared rail and exits any score preview. Dragging starts from the displayed width, including after viewport or interface scale changes. A wider saved preference survives reload and temporarily smaller windows, then fits the available space as panes open, close, or rearrange. The active panel and collapsed state persist using `chorale.workspace.fileRailActivePanel` and `chorale.workspace.fileRailCollapsed`; the retired `chatOpen` and `chatWidth` preferences no longer affect the layout. Files remains the default panel. When desktop chat is unavailable, a saved Chat selection falls back to Files and the Chat tab is omitted.

The chat component remains mounted when switching panels or collapsing the rail, preserving drafts, conversation state, and in-progress responses. It retains:

- file-scoped title row and thread selector
- scrollable conversation transcript with reasoning, tool progress, and token usage
- persisted follow-up queue controls
- anchored composer with provider/model selector, thinking level, and active range chip

## 6. Responsive guidance

The Figma file is desktop-first. Implementation should preserve the desktop hierarchy while adapting smaller widths carefully.

Required behavior:

- collapse non-essential regions (such as file rail or chat panel) before compressing the score beyond readability
- the left file rail always remains an in-flow inline grid column flanking the central column; it must never be positioned absolutely or rendered as a floating overlay that occludes or underlaps the music sheet, score tabs, or clef margins
- toggling, resizing, or closing the chat panel must never clip the annotation rail: the central score workspace rebalances its internal scene tracks elastically (balance spacer first, then rail floor — see `spec/score-surface.md` §5) before falling back to horizontal overflow
- keep the active file and score context visible
- when both Sheet and ABC source panes are open in default horizontal mode, they remain side by side (`flex-direction: row; flex-wrap: nowrap`) with an interactive resize divider, sharing available width proportionally rather than automatically stacking via media queries or hiding the divider. Vertical stacking is an explicit user preference controlled via drag-and-snap rearrangement.
- avoid turning desktop chat structure into an unusable narrow transcript

Desktop remains the primary fidelity target until the product behavior is stable.

## 7. Modal Dialogs and Stacking Scale

All modal and confirmation dialogs (`DeleteFileConfirmModal`, `MeasureDraftingToolbar` delete confirmation, `EditingHistoryModal`, `SettingsModal`, `NewScoreModal`, `ScoreVideoExportModal`) must render at the root level via `createPortal` or directly in `WorkspaceModals` to escape ancestor stacking contexts (such as `file-rail`, pane cards, and toolbelts).

The stacking scale strictly adheres to DESIGN.md §5:
- `--z-content: 0`
- `--z-base: 1`
- `--z-raised: 10`
- `--z-sticky: 20` (in-page sticky headers, below sidebars and modals)
- `--z-sidebar: 30`
- `--z-siderail: 40`
- `--z-popover: 100`
- `--z-dropdown: 100`
- `--z-modal: 200` (dialogs and overlays)
- `--z-toast: 300`
- `--z-tooltip: 400`

`--z-sticky` must never equal or exceed `--z-modal`, ensuring sticky headers and in-pane controls remain covered by dialog backdrops.
