# Interaction Model Spec

Date: 2026-07-25  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define the shared interaction model that ties together score selection, playback, annotations, editing, and chat.

## 2. Shared score anchor

The key interaction primitive is a single `ScoreAnchor`.

A `ScoreAnchor` should identify a musical location in a way that survives UI handoff:

- measure number
- beat or sub-beat location
- voice or staff identity when available
- ABC offset when recoverable
- playback time when available

Every feature should reference the same anchor object instead of keeping separate local notions of selection.

## 3. Core flows

### Score click to seek

When the user clicks the score:

1. the score resolves the clicked note or region
2. Chorale creates or updates the active `ScoreAnchor`
3. playback seeks to the same location
4. chat and annotation affordances reuse that anchor immediately

### ABC edit to atomic rebuild

When the user edits ABC:

1. the draft source updates immediately
2. validation and rebuild work are debounced
3. older async work is cancelled when a newer revision exists
4. render and audio outputs commit only if they match the latest revision
5. invalid ABC clears or disables stale score and audio output

### Chat tool to durable mutation

When chat proposes a score mutation:

1. the tool reads the active file and current `ScoreAnchor`
2. it returns a reviewable patch or proposal
3. approved changes create a durable file revision
4. durable file objects persist independently of the chat thread

## 4. Interaction invariants

- playback, chat, and annotations must not invent separate selection models
- chat history may change without deleting durable annotations or score info
- stale render or synth output must never overwrite a newer revision
- source-changing AI actions must remain reviewable before durable application

## 5. Relationship to architecture

This interaction model depends on the architecture captured in [file-workspace-architecture.md](./file-workspace-architecture.md), especially:

- `FileSessionController`
- `ScoreAnchor`
- revision-gated build results
- durable file storage
