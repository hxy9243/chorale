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
  - src/music/__tests__/scoreVideoRecorder.test.ts
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

### 3.4 Audio Synthesis & High-Fidelity Recording Pipeline (`src/music/scoreVideoRecorder.ts`)
- **Multi-Voice Summation & Peak Normalization**:
  - Synthesized polyphonic buffers from `abcjs.synth.CreateSynth` are mixed across voices in `mixAudioBuffers`.
  - When raw audio summation exceeds peak amplitude $0.92$, samples are smoothly normalized down to $0.92$ to prevent harsh digital clipping.
- **Gain Staging & Headroom**:
  - `musicSource` routes through a master `GainNode` ($0.95$ gain) into the `MediaStreamAudioDestinationNode` to ensure clean headroom.
- **Audio Bitrate Configuration**:
  - Highest quality audio encoding is explicitly specified: $320\text{ kbps}$ for `High Quality` mode, and $192\text{ kbps}$ for `Compressed` mode (eliminating browser-default $64\text{ kbps}$ artifacts).
- **MIME Type Prioritization**:
  - MP4 recording prioritizes standard AAC audio codecs (`video/mp4;codecs=avc1,mp4a.40.2`, `video/mp4;codecs=avc1,aac`, `video/mp4;codecs=avc1`, `video/mp4`) for universal cross-platform playback.
- **Container Finalization & Duration Indexing**:
  - `MediaRecorder.start()` is invoked without fractional timeslicing, enabling browser muxers to generate valid movie fragment random access (`mfra`) tables and full duration metadata without truncation.
- **Post-Recording MP4 Container Box Duration Repair (`repairMp4BoxDurations`)**:
  - In Chromium on Linux/Windows/macOS, `MediaRecorder` has an internal ISO-BMFF muxing bug: when generating MP4 files, it writes unscaled millisecond durations into `mdhd` (media header) boxes rather than scaling by the track timescale (e.g. writing `50,000` instead of $50,000 \times 48 = 2,400,000$ for a 48 kHz audio track, and $50,000 \times 30 = 1,500,000$ for a 30 kHz video track).
  - External players (VLC, GStreamer, Totem, QuickTime, Windows Media Player) read the unscaled duration and conclude the audio/video streams end after ~1.04s and ~1.72s, causing video freezing after a few seconds and garbled/choppy/prematurely aborted audio.
  - `repairMp4BoxDurations` parses the MP4 `moov` hierarchy, locates all `trak` and `mdia.mdhd` boxes, extracts the authoritative movie duration from `mvhd`, and rescales the `mdhd` durations to `(durationMs / 1000) * timescale`, ensuring seamless 100% playback across all native OS media players.
- **Synchronous Canvas Capture & DOM Attachment**:
  - The recording canvas is mounted into the DOM (`position: fixed; left: -9999px; visibility: hidden;`) during export to connect Chromium's compositor to regular paint cycles, and `track.requestFrame()` is called synchronously after every rendered frame to ensure zero dropped frames at 30 fps.


### 3.5 SVG System Slice Isolation & Ledger Line Preservation
- **Accurate Line Class Filtering**:
  - When isolating score systems in `extractScoreSystems`, line elements are filtered strictly by `/^abcjs-l\d+$/` patterns rather than broad substring matches (`[class*="abcjs-l"]`).
  - Musical notation elements whose class names happen to contain the `abcjs-l` prefix—specifically `.abcjs-ledger` (horizontal ledger lines for high and low register notes) and `.abcjs-legato` (slurs and ties)—are strictly protected from accidental deletion.
- **Explicit Theme & Stroke Styling**:
  - The isolated system SVG slices inject CSS rules for `.abcjs-ledger`:
    ```css
    .abcjs-ledger { fill: ${staffColor} !important; stroke: ${staffColor} !important; stroke-width: 0.8px !important; }
    .abcjs-beam-elem { fill: ${strokeColor} !important; stroke: ${strokeColor} !important; }
    ```
    This ensures that thin $0.70\text{ px}$ ledger lines never vanish under canvas image-scaling or anti-aliasing.
- **Generous Staff Headroom**:
  - Bounding box spans calculate `uniformHeight = Math.max(100, Math.round(maxSpan + 40))`, providing ample vertical clearance for notes in extreme high registers without vertical slice clipping.


## 4. Canvas Video Renderer (`src/music/scoreVideoRenderer.ts`)

Pure rendering module for HTML5 Canvas (`OffscreenCanvas` or `HTMLCanvasElement`):
- **Resolutions**:
  - `16:9 Landscape`: $1920 \times 1080$ (default for YouTube and desktop).
  - `9:16 Portrait`: $1080 \times 1920$ (default for Shorts, TikTok, mobile).
- **Themes**:
  - `Dark`: Dark slate background (`#161618`), white/silver staves, vibrant cyan/gold playhead.
  - `Warm Paper`: Cream/urtext parchment (`#f8f6f0`), dark charcoal staves (`#2a2825`), amber playhead.
- **Frame Composition & Responsive Layouts**:
  1. Background fill & ambient gradient.
  2. Header & Measure Indicator:
     - *Landscape (16:9)*: Single top row with Title (left), Measure indicator (center), and Composer (right).
     - *Portrait (9:16)*: Two-row collision-free hierarchy: Row 1 hosts Title (left) and Composer (right); Row 2 hosts a centered, dedicated `Measure X` pill badge with subtle card backing and accent text.
  3. Two-line staff rendering:
     - Slices SVG elements of System $k$ and System $k+1$.
     - Both staves share uniform scale, identical width, and identical horizontal offset.
     - **Global Invariant Scale & Clef Alignment**: All systems across the score are scaled uniformly using global dimensions (`globalMaxBboxHeight` and `globalSystemWidth`). The sheet clefs, staff lines, and bounding slots remain at the exact same height, width, and $(x, y)$ coordinates across every screen transition, guaranteeing seamless visual continuity.
     - *Landscape (16:9)*: Staves occupy proportional upper and lower halves of the wide score sheet.
     - *Portrait (9:16)*: Staves are spaced with a tight, natural musical gap (`staffGap` ~ 38% staff height), and the sheet card frames the staves with proportional vertical margins centered in the viewport, avoiding large empty voids.
  4. Playhead cursor: vertical glow line at $x(t)$ bounded between the top and bottom of the active staff.
  5. Measure highlight: rounded rectangle over active measure.

## 5. UI Integration

- Context menu entry in `FileRail.tsx` under `Export ▸`:
  - `MusicXML (.musicxml)`
  - `PDF (.pdf)`
  - `Sheet Video` (opens video export modal)
- Modal `ScoreVideoExportModal.tsx`:
  - Live preview canvas with Play / Pause / Seek / Time display.
  - Controls:
    - Format: `MP4 (.mp4)` (default, universal playback) vs `WebM (.webm)` (open web standard).
    - Quality & Compression: `Compressed` (~2 Mbps target bitrate for lightweight sharing via chat/email) vs `High Quality` (~6 Mbps target bitrate).
    - Aspect Ratio: 16:9 Landscape vs 9:16 Portrait.
    - Theme: Modern Dark vs Warm Paper.
    - Intro duration (0–4s) and Outro duration (0–3s).
  - "Export Sheet Video" action: runs through the timeline, captures stream at chosen bitrate and MIME format, and downloads file.

## 6. Testing Strategy

- `scoreVideoTimeline.test.ts`: Phase transitions, beat calculation, time-to-system mapping, cursor interpolation.
- `scoreVideoRenderer.test.ts`: Canvas dimensions, frame drawing without errors, theme palette tokens.
- `ScoreVideoExportModal.test.tsx`: Modal rendering, control changes, preview transport controls.
