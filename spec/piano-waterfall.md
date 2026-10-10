---
title: "Piano Waterfall"
description: "Optional piano waterfall pane synchronized with the shared audio transport"
category: "core-workspace"
date: 2026-10-09
updated: 2026-10-09
status: "implemented"
source_files:
  - src/components/WaterfallView.tsx
  - src/components/WaterfallPane.tsx
  - src/music/waterfallLayout.ts
  - src/music/waterfallPlayback.ts
  - src/utils/abcAudio.ts
  - src/utils/repeatPlayback.ts
  - src/components/AudioPlayer.tsx
  - src/App.tsx
  - src/hooks/useResizablePanel.ts
  - src/hooks/useWorkspacePanes.ts
  - src/hooks/usePaneTabDrag.ts
  - src/components/workspace/WorkspacePaneMenu.tsx
  - src/components/Header.tsx
  - src/styles/waterfall.css
test_files:
  - src/music/__tests__/waterfallLayout.test.ts
  - src/music/__tests__/waterfallPlayback.test.ts
  - src/utils/__tests__/abcAudio.test.ts
  - src/utils/__tests__/repeatPlayback.test.ts
  - src/components/__tests__/WaterfallView.test.tsx
  - src/App.test.tsx
  - src/hooks/__tests__/useWorkspacePanes.test.ts
  - src/components/__tests__/Header.test.tsx
  - src/hooks/__tests__/useResizablePanel.test.ts
  - src/components/__tests__/AudioPlayer.test.tsx
related_specs:
  - spec/playback-dock.md
  - spec/workspace-layout.md
---

# Piano waterfall

Sheet, ABC code, and Waterfall toggles sit on the right side of the header beside one status indicator. The healthy status is Music ready; saving, save failure, and pending music remain visible as one status rather than separate save/SVG/audio pills. Every pane launcher menu includes Waterfall. The optional resizable Waterfall pane shares the score/source workspace: dragging any pane tab snaps it to the left, right, top, or bottom, and orientation plus the complete three-pane order persist. Existing two-pane layout preferences remain compatible. A lone pane fills the workspace; the empty desk appears only when all three panes are closed. With Waterfall open horizontally, ABC resizing starts from the rendered pane width rather than a fitted or saved preference. The drag holds Waterfall at its rendered width, reserves the other panes and dividers, and permits the existing 140px split-pane minimum so small drags remain responsive in narrow workspaces. Closing panes never interrupts playback. There is one shared playback dock.

Notes use the same resolved synthesis timeline as audio, including repeated passages, chords, overlapping voices, ties, rests and the tempo handling already supported by the synthesizer. No second synthesizer or pixel-collision audio scheduler is created. Each animation frame samples the synth's playback clock; seek, pause, resume, restart and playback-speed changes cannot accumulate animation drift. The paused image remains still and key highlights clear when audio is not playing. A replaced or invalid score clears stale visual data.

The lower/leading edge of each descending note reaches the exact top edge of the keyboard at its onset. There is no separate strike line and no gap above the keyboard. Sounding notes shrink into that boundary until their resolved note end; keys remain highlighted for that duration. White and black note lanes use the same pitch geometry as the keyboard, with correct two/three black-key groups. The range expands to include the score's notes, with at least two full octaves and readable horizontally scrollable keys when needed. Muted voice colors are consistent between notes, active keys and a labeled legend. Falling notes have pill-shaped rounded caps and a gradient that fades the trailing (upper) end into the background, making adjacent notes on the same key easier to distinguish. Keyboard colors and note timing remain unchanged.

Animation runs only in the visible pane, uses bounded visible-note lookup, and cleans up its animation frame and resize subscriptions. The renderer never modifies score content or abcjs SVG children. Component, timing, pitch geometry and transport tests supplement browser playback QA. Video export is outside this feature.

When the Sheet pane is closed, source changes are engraved into a detached element using the same audio preparation pipeline, keeping playback current without a visible score. Hiding panes alone does not rebuild or stop the transport. A shared speed selector offers 0.5–2× playback; visualization uses score-time seconds and the actual audio clock scaled by the selected speed.

Detached score preparation initializes timing before the first Play, so the shared dock can show duration and retain pre-play seeks. Pause and resume keep the notation timer aligned to the exact paused audio position rather than the last beat callback.

Notation timing uses the exact synth tempo after a speed rebuild, including fractional BPM and non-quarter-note tempo markings; rounding the timing callback tempo must not make the waterfall finish before the audio.

Every explicit seek uses one abcjs adapter to update audio offset, running clock origin, and notation resume position together, including seeks made before the first buffer is ready. Reopening Sheet for the same document and source rebinds notation events to the new SVG without rebuilding audio or changing speed, position, or playing state. Document/source changes invalidate that transport identity. A failed speed rebuild replaces the unusable controller and restores the latest requested score position paused at 1×, with a retry message; Stop during a failed rebuild remains at zero.
