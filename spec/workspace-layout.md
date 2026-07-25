# Workspace Layout Spec

Date: 2026-07-25  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the top-level desktop workspace composition for Chorale.

The design is no longer a simple player page. It is a persistent application workspace with four primary regions:

1. global header
2. project and file rail
3. central score workspace
4. right-side chat panel

## 2. Header

The header should communicate application identity and current file state.

Required regions:

- left: Chorale branding
- center: active project and file title
- right: save-state badge, share action, user affordance

The current PoC header is still tool/demo oriented. The product header should instead anchor the user in the active file and current save state.

## 3. Project and file rail

The left rail introduces persistent navigation and file scope.

Required content:

- import score action
- library shortcuts such as All projects, Recent, and Favorites
- project list with score counts
- file list scoped to the selected project
- file metadata such as imported, edited, or draft

Implication:

- Chorale needs a file/session model rather than a single score loaded into component state.

## 4. Central workspace

The center column is the primary editing and reading surface.

It contains:

- score toolbar
- rendered score surface
- optional split ABC editor pane
- playback dock anchored at the bottom

The score remains the dominant surface. The editor is subordinate even when visible.

## 5. Right-side chat panel

The chat panel is part of the fixed workspace layout rather than a transient overlay on desktop.

It should feel like a persistent product surface with:

- file-scoped thread header
- conversation transcript
- tool disclosure
- anchored composer

## 6. Responsive guidance

The Figma file is desktop-first. Implementation should preserve the desktop hierarchy while adapting smaller widths carefully.

Required behavior:

- collapse non-essential regions before compressing the score beyond readability
- keep the active file and score context visible
- avoid turning desktop chat structure into an unusable narrow transcript

Desktop should remain the primary fidelity target until the product behavior is stable.
