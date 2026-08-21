---
title: "ABC Editor Spec"
description: "Specification for the ABC code editor pane, split view, draggable divider, and score/playback synchronization"
category: "core-workspace"
date: 2026-07-28
updated: 2026-08-21
status: "implemented"
source_files:
  - src/components/AbcEditor.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/utils/abcMetadata.ts
  - src/hooks/useWorkspaceLayout.ts
  - src/utils/abcAudio.ts
  - src/components/FileRail.tsx
  - src/App.tsx
test_files:
  - src/components/__tests__/AbcEditor.test.tsx
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/utils/__tests__/abcMetadata.test.ts
  - src/App.test.tsx
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
  - spec/score-surface.md
  - spec/playback-dock.md
---

# ABC Editor Spec

Date: 2026-07-28  
Updated: 2026-08-21  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the ABC editor as a first-class workspace pane rather than a loose debug surface.

## 2. Pane behavior

The editor appears as an optional right-side pane within the central workspace.

Required behavior:

- split view with the score remaining primary
- draggable divider between score and editor (width bounded between 320px and 720px, default 420px)
- persistent editor visibility and width state stored in local storage (`chorale.workspace.editorVisible`, `chorale.workspace.editorWidth`)
- editor width that can be adjusted without collapsing the score
- opening from the left-rail **Tools** panel through the `ABC display` toggle

## 3. Editor chrome

Expected UI elements:

- `ABC code` heading and subtitle
- visible validity status pill (`Valid · r{revision}`, `Rebuilding`, `Invalid ABC`)
- line numbers
- live refresh or rebuild status indicator
- copy ABC action button
- an always-visible icon close button in the ABC pane's upper-right corner; reopening remains available from **Tools**

These communicate whether the current text can safely drive score and playback output.

## 4. Synchronization rules

The editor stays synchronized with:

- rendered score output (debounced rebuild pipeline)
- visual score metadata header (`ScoreMetadataHeader`): edits in `ScoreMetadataHeader` update the underlying ABC code in the editor, and text edits in `AbcEditor` modifying header tags (`T:`, `C:`, `A:`, `K:`, `M:`, `Q:`, `O:`, `R:`) immediately reflect in the visual score header chips
- playback preparation (`prepareAbcForPlayback`)
- active file revision number

Source edits travel through the same rebuild pipeline as imported or applied file changes.

## 5. Failure behavior

Invalid ABC is treated explicitly:

- invalid state is visible in the editor with a clear status banner and error message
- stale score output is prevented from overwriting newer edits
- stale audio output is cleared or disabled (`hasPlayback: false`)
- newer valid revisions must not be overwritten by older invalid async results

## 6. Relationship to current implementation

The current implementation provides:

- editable ABC text in a dedicated pane
- live score re-rendering with debounced validation (140ms debounce)
- split-pane workspace integration with a draggable resize divider
- bidirectional metadata synchronization with `ScoreMetadataHeader`
- revision-aware status chrome (`Valid · r{revision}`, `Rebuilding`, `Invalid ABC`)
- persistent pane visibility and width in `localStorage`
- copy to clipboard functionality
