# Workspace Layout Spec

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the top-level desktop workspace composition for Chorale.

The design is no longer a simple player page. It is a persistent application workspace with four primary regions:

1. global header
2. file rail
3. central score workspace
4. right-side chat panel

## 2. Header

The header should communicate application identity and current file state.

Required regions:

- left: Chorale branding and File Rail collapse/expand toggle button
- center: active file title
- right: save-state badge (`Saved`, `Saving`, `Error`, `No file`), Chat Panel visibility toggle, user affordance

The product header anchors the user in the active file and current save state.

## 3. File rail

The left rail is intentionally limited to file scope. Project and library hierarchy is omitted until the product has real project-backed behavior.

Required content:

- import score action (`.xml`, `.musicxml`, `.mxl`, `.abc`)
- active and available file list with format badge (MXL, ABC, MusicXML) and state indicator (`original`, `edited`)
- file management actions: file reordering (up/down) and score deletion (preserving at least 1 document)
- collapsible state (`railCollapsed` state) and horizontal drag-to-resize handle (width bounded between 160px and 420px, default 236px)

Implication:

- Chorale has a file/session model persisted to local storage rather than a single score loaded into component state.
- sample tracks and imported scores populate the file rail directly.

## 4. Central workspace

The center column is the primary editing and reading surface.

It contains:

- score toolbar (title, zoom controls, semitone transposition)
- rendered score surface (with auto-centering playback line and zoom layout space reservation)
- optional split ABC editor pane (horizontal drag-to-resize, width bounded between 320px and 720px, default 420px)
- playback dock anchored to the visible bottom of the central workspace, independent of content height and interface zoom (max-width bounded to 800px for centered desktop presentation)

The score remains the dominant surface. The editor is subordinate even when visible.

## 5. Right-side chat panel

The chat panel is part of the fixed workspace layout on desktop. It supports horizontal drag-to-resize (width bounded between 280px and 680px, default 392px) via a left drag handle. Closing it expands the score workspace, but a persistent header control always allows the user to reopen it.

It functions as a persistent product surface with:

- file-scoped thread header
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
