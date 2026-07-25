# Playback Dock Spec

Date: 2026-07-25  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define playback as a shared workspace dock tied to the same musical anchor model as score interaction and chat.

## 2. Dock composition

The playback dock sits at the bottom of the central workspace.

Expected elements:

- primary play control
- progress timeline
- elapsed and total duration
- current score location label such as `m.5 beat 3`
- tempo and volume readouts

## 3. Shared cursor behavior

The playback dock must not own an unrelated cursor model.

Required behavior:

- clicking the score can update playback seek location
- playback progress can expose the current score anchor
- chat and score UI can reference the same anchor
- playback position labels should match the same measure and beat identity shown elsewhere

## 4. Timeline semantics

The progress track should represent both transport progress and score location context.

Expected behavior:

- seeking updates the active musical location
- progress UI can show a selected anchor or seek result
- transport state remains synchronized with the currently rendered revision

## 5. Relationship to current implementation

The current branch already has a working audio player and score highlighting path.

The design still requires:

- bottom-dock workspace treatment
- explicit measure and beat labeling
- tighter integration with the shared `ScoreAnchor`
- stronger synchronization with revision-gated score rebuilds
