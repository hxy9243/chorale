# ABC Editor Spec

Date: 2026-07-25  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the ABC editor as a first-class workspace pane rather than a loose debug surface.

## 2. Pane behavior

The editor should appear as an optional right-side pane within the central workspace.

Required behavior:

- split view with the score remaining primary
- draggable divider between score and editor
- persistent editor visibility state
- editor width that can be adjusted without collapsing the score

## 3. Editor chrome

Expected UI elements:

- `ABC code` heading
- visible validity status
- line numbers
- live refresh or rebuild status

These are not decoration. They communicate whether the current text can safely drive score and playback output.

## 4. Synchronization rules

The editor must stay synchronized with:

- rendered score output
- playback preparation
- active file revision

Source edits should travel through the same rebuild pipeline as imported or applied file changes.

## 5. Failure behavior

Invalid ABC should be treated explicitly.

Required behavior:

- invalid state is visible in the editor
- stale score output is cleared or disabled
- stale audio output is cleared or disabled
- newer valid revisions must not be overwritten by older invalid async results

## 6. Relationship to current implementation

The current branch already proves:

- editable ABC text
- live score re-rendering

The design still requires:

- split-pane workspace integration
- revision-aware status chrome
- resize behavior
- stronger rebuild and invalid-state guarantees
