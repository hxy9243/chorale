# Interaction Model Spec

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the shared interaction model that ties together score selection, playback, annotations, editing, and chat.

## 2. Shared score anchor

The key interaction primitive is a single `ScoreAnchor`.

A `ScoreAnchor` identifies a musical location in a way that survives UI handoff:

- measure number
- beat or sub-beat location
- voice or staff identity when available
- ABC offset when recoverable
- playback time in seconds when available
- normalized playback fraction when absolute timing is not yet available
- formatted label (e.g., `m. 5`)

Every feature references the same anchor object instead of keeping separate local selection states.

## 3. Core flows

### Score click to seek & repeat pass resolution

When the user clicks the score:

1. score surface resolves the clicked measure and ABC offset
2. measure selection evaluates repeat structure (`selectMeasureWithRepeats`) against current playback timestamp to target the active repeat pass
3. Chorale creates or updates the active `ScoreAnchor`
4. playback seeks to the resolved timestamp or playback fraction
5. chat and annotation affordances reuse that anchor immediately

Selecting another measure replaces the previous highlight without triggering full DOM re-renders.

### Auto-centering playback & user scroll pause

During playback:

1. playback cursor updates dispatch `chorale-playback-cursor` events with note timing and SVG coordinates
2. score view calculates target vertical scroll position to keep the playback line centered
3. when the playback cursor crosses staff lines or moves vertically, the score container smooth-scrolls to center the active line
4. if the user manually scrolls (mouse wheel, touch gesture, keyboard navigation), auto-scrolling pauses for 2 seconds before smoothly re-centering

### ABC edit to atomic rebuild & persistence

When the user edits ABC:

1. draft source updates immediately in the active document state
2. validation and rebuild work are debounced (140ms for build status, 400ms for local storage persistence)
3. older async work is cancelled when a newer revision exists
4. render and audio outputs commit only if they match the latest revision
5. document revisions are bounded to 10 stored versions (`limitScoreVersions`) to preserve local storage limits

### Chat tool to durable mutation

When chat proposes a score mutation:

1. tool reads the active file and current `ScoreAnchor`
2. returns a reviewable patch or proposal
3. approved changes create a durable file revision
4. durable file objects persist independently of the chat thread

## 4. Interaction invariants

- playback, chat, and annotations must not invent separate selection models
- selected measure remains visually highlighted until replaced, cleared, or active file changes
- closing chat or collapsing file rail does not clear active score anchor
- user manual scrolling pauses playback auto-centering for 2 seconds
- chat history may change without deleting durable annotations or score info
- stale render or synth output must never overwrite a newer revision

## 5. Relationship to architecture

This interaction model depends on the architecture captured in [file-workspace-architecture.md](./file-workspace-architecture.md), especially:

- `FileSessionController` & document utilities (`fileSession.ts`)
- `ScoreAnchor` & repeat playback helpers (`repeatPlayback.ts`)
- `autoScroll.ts` smooth scroll controller
- revision-gated build results and debounced local storage persistence
