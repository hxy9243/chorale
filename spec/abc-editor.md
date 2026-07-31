# ABC Editor Spec

Date: 2026-07-28  
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
- an icon close button inside the ABC pane; reopening remains available from **Tools**

These communicate whether the current text can safely drive score and playback output.

## 4. Synchronization rules

The editor stays synchronized with:

- rendered score output (debounced rebuild pipeline)
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
- revision-aware status chrome (`Valid · r{revision}`, `Rebuilding`, `Invalid ABC`)
- persistent pane visibility and width in `localStorage`
- copy to clipboard functionality
