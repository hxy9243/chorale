# Workspace Layout Spec

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the top-level desktop workspace composition for Chorale.

The design is no longer a simple player page. It is a persistent application workspace with four primary regions:

1. global header
2. left work rail
3. central score workspace
4. right-side chat panel

## 2. Header

The header should communicate application identity without duplicating score-local state.

Required regions:

- left: plain `Chorale` wordmark and File Rail collapse/expand toggle button; no separate brand icon
- center: active file title
- right: Chat Panel visibility toggle

The Electron window and renderer document title are exactly `Chorale`. Save and build state belong under the score title rather than in global chrome.

## 3. Left work rail

The left rail is divided into visibly named **Files**, **Tools**, and **Settings** panels. Project and library hierarchy is omitted until the product has real project-backed behavior.

Required content:

- **Files**: import score action (`.xml`, `.musicxml`, `.mxl`, `.abc`) plus the active and available file list with format badge (MXL, ABC, MusicXML) and state indicator (`original`, `edited`)
- **Tools**: an `ABC display` toggle; future score tools join this panel rather than the score header
- **Settings**: a bottom-aligned application settings button
- icon-led actions expose hover titles and accessible names
- file management actions: file reordering (up/down) and score deletion (preserving at least 1 document)
- collapsible state (`railCollapsed` state) and horizontal drag-to-resize handle
- default width at 25% of the logical layout viewport, bounded between 240px and 560px so long file names remain legible
- persistent resized width in local storage (`chorale.workspace.fileRailWidth`)

Implication:

- Chorale has a file/session model persisted to local storage rather than a single score loaded into component state.
- sample tracks and imported scores populate the file rail directly.

## 4. Central workspace

The center column is the primary editing and reading surface.

It contains:

- score title and composer with `Auto-saved`, `SVG ready`, and `Audio ready` status directly underneath
- an 80%-opaque rounded display-options panel floating in the score's upper-right corner; it becomes fully opaque on hover or keyboard focus
- score zoom controls inside that floating panel, without `Score` or `ABC code` view tabs
- rendered score surface (with auto-centering playback line and zoom layout space reservation)
- optional split ABC editor pane (horizontal drag-to-resize, width bounded between 320px and 720px, default 420px, persisted as `chorale.workspace.editorWidth`)
- playback dock anchored to the visible bottom of the central workspace, independent of content height and interface zoom (max-width bounded to 800px for centered desktop presentation)

The score remains the dominant surface. The editor is subordinate even when visible.

## 5. Right-side chat panel

The chat panel is part of the fixed workspace layout on desktop. It supports horizontal drag-to-resize (minimum 280px, maximum one third of the logical layout viewport, default 392px) via a left drag handle. Its resized width persists as `chorale.workspace.chatWidth`. Closing it expands the score workspace, but a persistent header control always allows the user to reopen it.

It functions as a persistent product surface with:

- file-scoped title row and a full-width, consistently styled thread selector beneath it
- conversation transcript
- tool disclosure
- anchored composer
- resize drag handle on left edge

## 6. Responsive guidance

The Figma file is desktop-first. Implementation should preserve the desktop hierarchy while adapting smaller widths carefully.

Required behavior:

- collapse non-essential regions (such as file rail or chat panel) before compressing the score beyond readability
- keep the active file and score context visible
- avoid turning desktop chat structure into an unusable narrow transcript

Desktop remains the primary fidelity target until the product behavior is stable.
