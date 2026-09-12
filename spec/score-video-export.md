---
title: "Score Video Export Spec"
description: "Specification for exporting scores as synchronized two-line sheet videos with audio playback, progress indicator, and intro/outro cards"
category: "core-workspace"
date: 2026-09-12
status: "in-progress"
source_files:
  - src/music/scoreVideoTimeline.ts
  - src/music/scoreVideoRenderer.ts
  - src/music/scoreVideoRecorder.ts
  - src/components/ScoreVideoExportModal.tsx
  - src/components/FileRail.tsx
  - src/components/workspace/WorkspaceModals.tsx
test_files:
  - src/music/__tests__/scoreVideoTimeline.test.ts
  - src/music/__tests__/scoreVideoRenderer.test.ts
  - src/components/__tests__/ScoreVideoExportModal.test.tsx
related_specs:
  - spec/score-export.md
  - spec/score-surface.md
  - spec/playback-dock.md
---

# Score Video Export Spec

Date: 2026-09-12  
Source: `spec/score-video-export.md`

## 1. Goal

Allow musicians to export the active score as an MP4/WebM video suitable for sharing on YouTube, Instagram Reels, TikTok, or educational presentations:
- **Two-Line Lookahead Layout**: Viewport displays the active system (top or active row) and the next upcoming system (lookahead row) with smooth transitions.
- **Synchronized Visual Progress**: Cursor line gliding across notes in the active system, accompanied by an active measure highlight.
- **Intro & Outro Sequences**:
  - *Intro*: Elegant title slide displaying piece title, composer, key, meter, tempo, and animated 4-beat visual count-in dots.
  - *Outro*: Reverb tail decay and graceful fade-out credits screen.
- **Synchronized Audio**: Synthesized audio track generated via `abcjs.synth.CreateSynth` buffer or Web Audio oscillator fallback.
- **Interactive Modal**: Preview video playback with scrub controls, format toggles (16:9 Landscape vs 9:16 Portrait, Dark vs Warm Paper themes), and 1-click recording with download.

## 2. System Architecture

```
                                  [ABC Source]
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        [Score Engraving & Systems]           [Offline Audio Synthesis]
          abcjs SVG + Bounding Boxes             AudioBuffer (PCM)
                    │                                     │
                    └──────────────────┬──────────────────┘
                                       ▼
                       [ScoreVideoTimeline Engine]
                 Time t ──> { phase, activeLine, nextLine,
                              cursorX, cursorY, measure, beat }
                                       │
                                       ▼
                       [ScoreVideoRenderer (Canvas)]
                       Draws 16:9 / 9:16 high-res frames
                                       │
                   ┌───────────────────┴───────────────────┐
                   ▼                                       ▼
         [Interactive Preview]                   [MediaRecorder Stream]
         60fps live canvas preview               Muxes canvas + audio stream
                                                 ──> Downloadable .webm / .mp4
```

## 3. Timeline Engine (`src/music/scoreVideoTimeline.ts`)

Pure TypeScript module with zero React or Electron dependencies.

### 3.1 Timeline Phases
- **`intro`** (`0 <= t < introDuration`): Title card, piece metadata, beat count-in.
- **`score`** (`introDuration <= t < introDuration + scoreDuration`): Music playback across systems.
- **`outro`** (`introDuration + scoreDuration <= t <= totalDuration`): Decay tail, credits.

### 3.2 Two-Line System Pagination
Given $M$ systems extracted from the score:
- When playing system $k$:
  - Primary Line: System $k$ (receives cursor line and measure highlight).
  - Preview Line: System $k+1$ (if $k+1 < M$, else blank or end of piece indicator).
- Smooth transition: At the end of system $k$, when transitioning to $k+1$, system $k+1$ becomes Primary and $k+2$ becomes Preview.

### 3.3 Cursor Interpolation
- Given timing events $\{ (t_i, x_i, y_i) \}$, for current score time $t_{\text{score}}$:
  - If $t_{\text{score}}$ falls between event $i$ and $i+1$, linear interpolation computes exact $x(t)$.
  - Bounding box of the active measure is highlighted with a soft translucent pill.

## 4. Canvas Video Renderer (`src/music/scoreVideoRenderer.ts`)

Pure rendering module for HTML5 Canvas (`OffscreenCanvas` or `HTMLCanvasElement`):
- **Resolutions**:
  - `16:9 Landscape`: $1920 \times 1080$ (default for YouTube and desktop).
  - `9:16 Portrait`: $1080 \times 1920$ (default for Shorts, TikTok, mobile).
- **Themes**:
  - `Dark`: Dark slate background (`#161618`), white/silver staves, vibrant cyan/gold playhead.
  - `Warm Paper`: Cream/urtext parchment (`#f8f6f0`), dark charcoal staves (`#2a2825`), amber playhead.
- **Frame Composition**:
  1. Background fill & ambient gradient.
  2. Intro card / Outro card overlay when in respective phases.
  3. Two-line staff rendering:
     - Slices SVG elements of System $k$ and System $k+1$.
     - Draws to top half and bottom half of the score viewport.
  4. Playhead cursor: vertical glow line at $x(t)$ bounded between the top and bottom of the active staff.
  5. Measure highlight: rounded rectangle over active measure.

## 5. UI Integration

- Context menu entry in `FileRail.tsx` under `Export ▸`:
  - `MusicXML (.musicxml)`
  - `PDF (.pdf)`
  - `Sheet Video (.webm)`
- Modal `ScoreVideoExportModal.tsx`:
  - Live preview canvas with Play / Pause / Seek / Time display.
  - Controls: Aspect Ratio (16:9 / 9:16), Intro duration (0–5s), Outro duration (0–5s), Theme (Dark / Warm Paper).
  - "Export Video" action: runs through the timeline, captures stream, downloads file.

## 6. Testing Strategy

- `scoreVideoTimeline.test.ts`: Phase transitions, beat calculation, time-to-system mapping, cursor interpolation.
- `scoreVideoRenderer.test.ts`: Canvas dimensions, frame drawing without errors, theme palette tokens.
- `ScoreVideoExportModal.test.tsx`: Modal rendering, control changes, preview transport controls.
