# Playback Dock Spec

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define playback as a shared workspace dock tied to the same musical anchor model as score interaction and chat.

## 2. Dock composition

The playback dock sits at the bottom of the central workspace with a `max-width: 800px` layout boundary for clean desktop presentation.

Expected elements:

- primary play/pause and stop controls
- progress timeline seek track with elapsed and total duration (`mm:ss`)
- active score anchor label badge (e.g. `Selected m.5`)
- audio status indicator (`Synth Ready`, `Buffering Audio...`, `No Score Loaded`, or error banner)
- WebAudio master gain volume slider (0–100%) and mute toggle

## 3. Shared cursor behavior

The playback dock shares the application's unified anchor model:

- clicking a measure on the score seeks playback to the resolved musical timestamp (`applyAnchorSeek`)
- playback progress emits `chorale-playback-cursor` and `chorale-playback-state` events to drive the score cursor line (`abcjs-playback-cursor`) and auto-centering scroll
- seek track clicks calculate fractional tune position and update transport time immediately
- playback position labels match the measure and beat identity shown in chat and the score toolbar

When an anchor is selected, playback seeks immediately to the anchor's resolved time or fallback measure fraction.

## 4. Timeline and synth semantics

The progress track represents transport progress, audio synthesis, and score location:

- seeking updates active musical position without breaking WebAudio synth state
- WebAudio Master GainNode controls master volume without re-initializing soundfonts
- audio preparation sanitizes inline tempo markings across voices, handles extended tuplets, hides synthetic rests, and keeps hairpin voices audible
- transport state remains synchronized with the currently rendered ABC revision

## 5. Relationship to current implementation

The current implementation provides:

- working WebAudio piano synthesizer with remote and fallback soundfonts
- volume slider and mute toggle backed by WebAudio GainNode
- play/pause/stop transport controls and seek progress bar
- live score cursor line and auto-scroll synchronization
- repeat-aware playback timing and multi-voice tempo alignment
- shared-anchor seeking path
