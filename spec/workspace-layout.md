---
title: "Workspace Layout Spec"
description: "Specification for the top-level desktop workspace structure, header, file rail, central score workspace, and chat panel"
category: "core-workspace"
date: 2026-07-28
updated: 2026-08-21
status: "implemented"
source_files:
  - src/App.tsx
  - src/components/Header.tsx
  - src/components/FileRail.tsx
  - src/components/RightRail.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/components/ScoreCardHeader.tsx
  - src/components/EditingHistoryModal.tsx
  - src/utils/abcMetadata.ts
  - src/utils/fileHistory.ts
  - src/hooks/useWorkspaceLayout.ts
  - src/hooks/useResizablePanel.ts
  - src/styles/workspace-responsive.css
test_files:
  - src/App.test.tsx
  - src/components/__tests__/FileRail.test.tsx
  - src/components/__tests__/RightRail.test.tsx
  - src/components/__tests__/Header.test.tsx
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/components/__tests__/EditingHistoryModal.test.tsx
  - src/utils/__tests__/abcMetadata.test.ts
  - src/utils/__tests__/fileHistory.test.ts
  - src/hooks/__tests__/useResizablePanel.test.ts
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
Updated: 2026-08-21
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the top-level desktop workspace composition for Chorale.

The design is a persistent application workspace with four primary regions:

1. global header
2. left work rail
3. central score workspace
4. right-side chat panel

## 2. Header

The header communicates application identity, score context, editing actions, and persistence/render health without cluttering the score reading surface.

Required regions (3-column centered layout):

- left: plain `Chorale` wordmark; no separate brand icon or redundant toggle button (the left sidebar rail is always accessible)
- center:
  - active file title/breadcrumb
  - edit history actions (`Undo` / `Redo` buttons with tooltips indicating shortcuts Ctrl+Z / ⌘Z and Ctrl+Shift+Z / ⌘Shift+Z)
  - consolidated status group (`Auto-saved`/`Saving…`/`Save failed`, `SVG ready`/`SVG pending`, `Music ready`/`Music pending` with status dot indicators)
- right: none; chat visibility moved to the persistent right work rail icon bar

The Electron window and renderer document title are exactly `Chorale`. Save and build state capsules live in the global header so they remain continuously visible when scrolling through long musical scores.

## 3. Left work rail

The left rail uses a persistent narrow vertical selection bar (`3.5rem` / `56px`) that remains visible at all times to switch between **Files** and **Tools** panels. Each selection is one icon with a tooltip and accessible name. Clicking the currently active panel icon collapses the secondary content panel stack; clicking an icon while collapsed expands the rail with that panel active. A bottom-anchored **Settings** icon is a direct action that opens the settings dialog without replacing the selected work panel. Project and library hierarchy is omitted until the product has real project-backed behavior.

Required content:

- **Files**: a compact, centered import score action (`.xml`, `.musicxml`, `.mxl`, `.abc`) directly under the panel title, plus the active and available file list with format badge (MXL, ABC, MusicXML) and state indicator (`original`, `edited`)
- **Tools**: an `ABC display` toggle and an `Editing history` button to open the score history timeline modal; future score tools join this panel rather than the score header
- **Settings**: its action icon anchors to the bottom of the selection bar and opens application settings directly
- icon-only panel selections expose hover titles and accessible names
- file management actions: compact 44px rows omit a leading document icon and use the full row as the pointer drag surface; sortable transforms move neighboring rows around a persistent source slot while a matching overlay follows the pointer and settles into place, without a native drag-image handoff or disappearing placeholder; Arrow Up/Arrow Down on the focused file name provides keyboard reordering; score deletion allows deleting documents down to 0, which displays an empty workspace placeholder until a file is imported or loaded
- vertical scrolling is allowed inside the selected panel; horizontal scrolling is clipped
- persistent icon rail with collapsible content panel state (`railCollapsed` state) and horizontal drag-to-resize handle when expanded
- default width at 25% of the logical layout viewport when expanded, bounded between 240px and 560px so long file names remain legible
- persistent resized width in local storage (`chorale.workspace.fileRailWidth`) and collapse state (`chorale.workspace.fileRailCollapsed`)

Implication:

- Chorale has a file/session model persisted to local storage and IndexedDB rather than a single score loaded into component state.
- sample tracks and imported scores populate the file rail directly.

## 4. Central workspace

The center column is the primary editing and reading surface.

It contains:

- score metadata header (`ScoreMetadataHeader`): centered serif title (`--font-serif`), right-aligned score taglines/attribution (composer, author/lyricist, subtitle, origin, rhythm) with an Add Field menu (`+`), and centered interactive metadata chips (Key, Meter, Tempo) supporting inline ABC editing and validation
- a compact rounded display-options panel (`ScoreCardHeader`) floating at the score's upper center; it is highly translucent at rest, becomes less translucent during score scrolling, and becomes clearest on hover or keyboard focus
- score zoom controls inside that floating panel (−, %, +, Fit), without `Score` or `ABC code` view tabs
- continuous full-page paper score surface (`.sheet-viewport` spanning 100% width and height with pure-CSS paper texture, centered notation track, auto-centering playback line, line-start measure numbers, and zoom layout space reservation)
- optional split ABC editor pane (horizontal drag-to-resize, width bounded between 320px and 720px, default 420px, persisted as `chorale.workspace.editorWidth`)
- playback dock anchored to the visible bottom of the central workspace, independent of content height and interface zoom (max-width bounded to 800px for centered desktop presentation)

The score remains the dominant surface. The editor is subordinate even when visible.

## 5. Right work rail and chat panel

The right side mirrors the left work rail: a persistent narrow vertical icon bar (`3.5rem` / `56px`) anchored to the right screen edge remains visible at all times. Its **Chat** button toggles the chat panel; the open/closed state persists as `chorale.workspace.chatOpen`.

The chat panel is part of the fixed workspace layout on desktop. It supports horizontal drag-to-resize (minimum 280px, maximum one half of the whole logical layout viewport, default 392px) via a left drag handle. Its resized width persists as `chorale.workspace.chatWidth` and is restored across refreshes (re-clamped to the current viewport maximum on load and resize). Closing it collapses the workspace back to the persistent icon bar.

It functions as a persistent product surface with:

- file-scoped title row and a full-width, consistently styled thread selector beneath it
- conversation transcript with collapsible reasoning/thinking traces and tool progress
- tool disclosure
- anchored composer with provider/model selector, thinking level selector (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), and active range chip
- resize drag handle on left edge

## 6. Responsive guidance

The Figma file is desktop-first. Implementation should preserve the desktop hierarchy while adapting smaller widths carefully.

Required behavior:

- collapse non-essential regions (such as file rail or chat panel) before compressing the score beyond readability
- keep the active file and score context visible
- avoid turning desktop chat structure into an unusable narrow transcript

Desktop remains the primary fidelity target until the product behavior is stable.
