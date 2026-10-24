---
title: "Playback Dock Spec"
description: "Specification for the WebAudio playback dock, volume/mute GainNode, progress seek track, and unified score-anchor synchronization"
category: "core-workspace"
date: 2026-07-28
updated: 2026-10-24
status: "implemented"
source_files:
  - src/components/AudioPlayer.tsx
  - src/components/VoicesPanel.tsx
  - src/music/voiceMixer.ts
  - src/music/instruments.ts
  - src/styles/waterfall.css
  - src/utils/abcAudio.ts
  - src/utils/repeatPlayback.ts
  - src/utils/autoScroll.ts
  - src/utils/anchor.ts
  - src/App.tsx
test_files:
  - src/components/__tests__/AudioPlayer.test.tsx
  - scripts/playback-layout-smoke.mjs
  - src/utils/__tests__/abcAudio.test.ts
  - src/utils/__tests__/repeatPlayback.test.ts
  - src/utils/__tests__/autoScroll.test.ts
  - src/App.test.tsx
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
  - spec/score-surface.md
  - spec/interaction-model.md
  - spec/piano-waterfall.md
  - spec/abc-editor.md
  - spec/voices-panel.md
---

# Playback Dock Spec

Date: 2026-07-28  
Updated: 2026-10-23
Source: Figma file `Chorale — Chat with Music Sheet · V1`

## 1. Goal

Define playback as a shared workspace dock tied to the same musical anchor model as score interaction and chat.

Visible and detached score rendering share one preparation function in `abcAudio.ts`: source normalization, engraving, audio-source binding, synthetic-rest cleanup, and initial timing. Measure occurrence collection consumes that prepared timing without repeating initialization. Presentation-specific SVG controls and annotations stay in SheetMusicView.

## 2. Dock composition

The playback dock is positioned against the central workspace viewport and stays anchored to its visible bottom, independent of score/editor content height or interface zoom. On wide workspaces it uses 66% of the central viewport width with a 40rem minimum; narrower workspaces cap it at 40rem and let it shrink to the available space. It is rendered as a warm dark grey capsule (`#52504a`, subtle border `#68655e`, soft light text `#f7f5f0`, and gentle elevation shadow) matching the warm neutral tone of the application to provide clear distinction from the desk surface without black contrast, pure gray washout, or unrelated tints.

Expected elements:

- primary play/pause and stop controls
- progress timeline seek track with high-contrast elapsed and total duration (`mm:ss`)
- active score anchor label badge (e.g. `Selected m.5`)
- audio status indicator (`Synth Ready`, `Buffering Audio...`, `No Score Loaded`, or error banner)
- WebAudio master gain volume slider (0–100%) and mute toggle, with a high-contrast percentage readout

The volume track stays 4rem long at every supported width, with fixed space for
mute and the percentage. Only the timeline stretches. When the card's available
width falls below 34rem, transport, timeline and measure status stay on the first
row; speed and the compact volume group move to the second row, aligned to
opposite edges. This responds to the score column shrinking beside chat or file
rails, as well as to window resizing.

After building, `node scripts/playback-layout-smoke.mjs` checks the real workspace
in Chromium against an isolated score store. It verifies the track length,
control bounds and overlap across window and score-column widths. Set
`CHORALE_CHROMIUM` to use a different Chromium executable and
`CHORALE_LAYOUT_SCREENSHOTS` to save dock screenshots.

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

Measure Source's Enter shortcut sends a single-measure preview request to this
same transport. Requests wait for their exact committed document/source and synth
readiness. Preview seeks to the current repeat occurrence of the written measure,
plays every voice, and stops at the next occurrence boundary (or tune end), using
prepared abcjs timing with the written-measure map for pickups and meter changes.
WebAudio source stops are scheduled on the audio clock so hidden-tab throttling
cannot continue audible playback beyond the measure. The visible transport returns
to the preview start. Enter during playback stops and resets the shared transport;
a stop request cannot become a new preview after a source rebuild. Ordinary
transport Play resumes continuous playback, and an explicit seek exits preview.

Sheet-focused Enter uses the same source-bound request path in continuous mode.
It seeks to the selected measure's repeat-aware occurrence without installing a
single-measure stop boundary. A second Enter stops, including a pending audio
start. ABC Measure Source retains its single-measure preview behavior.

The Voices panel provides per-voice instrument, sample preview, mute and solo
listening controls; see `spec/voices-panel.md`. The hidden abcjs UI retains its
tempo input because controller rebuilds update it even though users interact
with the application's own playback controls.

## 5. Relationship to current implementation

The current implementation provides:

- working WebAudio piano synthesizer with remote and fallback soundfonts
- volume slider and mute toggle backed by WebAudio GainNode
- play/pause/stop transport controls and seek progress bar
- live score cursor line and auto-scroll synchronization
- repeat-aware playback timing and multi-voice tempo alignment
- shared-anchor seeking path

## 6. Optional waterfall pane

The shared transport remains mounted while an active document exists, independently of pane visibility. The waterfall reads the same resolved synth notes and WebAudio clock, with the keyboard top edge representing note onset. The dock includes a 0.5–2× speed selector backed by abcjs warp; rebuilding the buffer preserves score position and ignores cancelled starts. See `spec/piano-waterfall.md` for visualization and interrupted-flow requirements.
