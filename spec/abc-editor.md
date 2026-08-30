---
title: "ABC Editor Spec"
description: "Specification for the ABC code editor pane, split view, draggable divider, and score/playback synchronization"
category: "core-workspace"
date: 2026-07-28
updated: 2026-08-29
status: "implemented"
source_files:
  - src/components/AbcEditor.tsx
  - src/music/abcPresentation.ts
  - src/components/SheetMusicView.tsx
  - src/components/AudioPlayer.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/utils/abcMetadata.ts
  - src/hooks/useWorkspaceLayout.ts
  - src/utils/abcAudio.ts
  - src/components/FileRail.tsx
  - src/App.tsx
test_files:
  - src/components/__tests__/AbcEditor.test.tsx
  - src/music/__tests__/abcPresentation.test.ts
  - src/components/__tests__/SheetMusicView.test.tsx
  - src/components/__tests__/AudioPlayer.test.tsx
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
Updated: 2026-08-29
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

The title, status, view controls, voice selector, and close action remain fixed while the
editor content scrolls. ABC metadata is part of the source content and scrolls normally.

## 4. Formatted and raw views

The pane provides three views over one canonical ABC string:

- **Measure View** is the default experimental workspace. It lays every written measure on
  one horizontally scrollable timeline, stacks all voices inside each measure, and positions
  note events by cumulative duration so simultaneous beats align vertically. Every voice row
  also preserves its complete literal measure source without truncation and uses that source
  as the editable surface; unusually long measures widen the timeline. Measure headers or
  source rows navigate, scroll, and focus the corresponding sheet range; sheet selection
  scrolls the matching source measure into view. Playback automatically scrolls the active
  playing measure into view along the horizontal timeline. Vertical wheel movement traverses
  the horizontal source, and a persistent bottom navigator scrubs the same timeline.

- **Formatted** is a text-focused, voice-colored projection. It preserves literal header
  fields, adds dim human-readable field labels, and lays each voice's measures out using
  the same system groups as the rendered sheet. One shared horizontal canvas scrolls all
  systems together rather than giving every system an independent scrollbar.
- **Raw Source** retains the complete editable textarea and current every-keystroke
  revision, autosave, validation, score, and playback behavior. It enriches raw ABC text
  with inline commented sheet explanations for header lines (`X:1   Reference: 1`,
  `T:rainy day  Title: rainy day`, `M:3/4   Meter: 3/4`), distinct background colors for
  different voice lines matching the palette of the measure score, and highlights for both
  range selection and active playback across voices.

Formatted view is available only for a valid single tune whose source ownership can be
proved. Each voice has a deterministic accessible color used by its selector and source
background. Source fragments that cannot be represented safely remain available in Raw
Source and produce a visible warning rather than being silently omitted.

### 4.1 Safe formatted editing

A formatted measure is editable only when abcjs maps it to one contiguous, single-line,
measure-local source range. Bar and repeat boundaries, volta markers, comments, newlines,
overlapping ranges, and structural or ambiguous fragments are read-only or Raw Source-only.

An edit is committed only when the candidate:

- parses as exactly one tune without fatal warnings;
- retains voice identifiers and order, measure count, header bytes, and boundary bytes;
- changes only the target cell's source range; and
- produces the same presentation ownership for all non-target fragments.

Invalid drafts remain local to the editor with an error state; they do not update the
canonical ABC, score, revision history, autosave, or playback. A draft is cancelled if its
document identity or base revision becomes stale.

## 5. Selection, navigation, and playback

- Clicking or keyboard-activating an ABC measure selects that measure through the shared
  `ScoreAnchor`; Shift extends from the existing selection origin.
- Every voice's cells in the selected written-measure range receive the selection cue.
- A voice selector scrolls to the selection's first measure in that voice, or the voice's
  beginning when there is no selection.
- Playback source ranges resolve to one written measure, automatically scroll that measure
  into view along the timeline, and apply a distinct transient measure tint across voices.
  Unresolved or conflicting events clear the tint.
- Playback tint clears on pause, stop, finish, source change, and unmount.

Rendered system snapshots are accepted only when document ID, revision, and measure domain
match the current presentation. While a matching snapshot is unavailable, Formatted renders
the complete measure domain immediately in readable four-measure fallback systems, then
progressively adopts the exact rendered system groups when the matching snapshot arrives.

## 6. Synchronization rules

The editor stays synchronized with:

- rendered score output (debounced rebuild pipeline)
- visual score metadata header (`ScoreMetadataHeader`): edits in `ScoreMetadataHeader` update the underlying ABC code in the editor, and text edits in `AbcEditor` modifying header tags (`T:`, `C:`, `A:`, `K:`, `M:`, `Q:`, `O:`, `R:`) immediately reflect in the visual score header chips
- playback preparation (`prepareAbcForPlayback`)
- active file revision number

Source edits travel through the same rebuild pipeline as imported or applied file changes.

## 7. Failure behavior

Invalid ABC is treated explicitly:

- invalid state is visible in the editor with a clear status banner and error message
- stale score output is prevented from overwriting newer edits
- stale audio output is cleared or disabled (`hasPlayback: false`)
- newer valid revisions must not be overwritten by older invalid async results
- the fixed editor chrome remains visible even when pasted source is long or invalid

## 8. Relationship to current implementation

The current implementation provides:

- editable ABC text in a dedicated pane
- live score re-rendering with debounced validation (140ms debounce)
- split-pane workspace integration with a draggable resize divider
- bidirectional metadata synchronization with `ScoreMetadataHeader`
- revision-aware status chrome (`Valid · r{revision}`, `Rebuilding`, `Invalid ABC`)
- persistent pane visibility and width in `localStorage`
- copy to clipboard functionality
