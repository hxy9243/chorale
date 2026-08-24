---
title: "Chorale Design Spec Index"
description: "Index and high-level architectural overview of Chorale specifications and implemented features"
category: "overview"
date: 2026-08-05
updated: 2026-08-23
status: "implemented"
source_files:
  - src/App.tsx
  - src/components/Header.tsx
  - src/components/FileRail.tsx
  - src/components/SheetMusicView.tsx
  - src/components/ScoreMetadataHeader.tsx
  - src/components/ScoreCardHeader.tsx
  - src/components/EditingHistoryModal.tsx
  - src/components/AbcEditor.tsx
  - src/components/AudioPlayer.tsx
  - src/components/AgentChatPanel.tsx
  - src/components/AISettingsModal.tsx
  - src/components/AnnotationOverlay.tsx
  - src/components/AnnotationRail.tsx
  - src/utils/abcMetadata.ts
  - src/utils/fileHistory.ts
  - src/hooks/useDocumentStore.ts
  - src/music/documentSchema.ts
  - src/music/scoreSnapshot.ts
  - src/agent/DesktopSheetAgent.ts
  - electron/ai/sheetAgentRuntime.ts
  - tokens.css
test_files:
  - src/App.test.tsx
  - src/components/__tests__/ScoreMetadataHeader.test.tsx
  - src/components/__tests__/EditingHistoryModal.test.tsx
  - src/utils/__tests__/abcMetadata.test.ts
  - src/utils/__tests__/fileHistory.test.ts
  - src/components/__tests__/passageAnalysisJourney.integration.test.tsx
related_specs:
  - spec/workspace-layout.md
  - spec/score-surface.md
  - spec/interaction-model.md
  - spec/abc-editor.md
  - spec/playback-dock.md
  - spec/pi-agent-chat.md
  - spec/settings-and-auth.md
  - spec/file-workspace-architecture.md
  - spec/agent-analysis-and-annotations.md
  - spec/agent-tools-and-profiles.md
  - spec/annotations-and-proposals.md
  - spec/score-drafting.md
---

# Chorale Design Spec Index

Date: 2026-08-05  
Updated: 2026-08-21  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

This directory splits the design into category-specific specs instead of keeping the entire workspace design in one file.

## Core design specs

- [workspace-layout.md](./workspace-layout.md): top-level workspace structure, 3-column header with undo/redo and status capsules, file rail, resizable sidebars, and central layout
- [score-surface.md](./score-surface.md): rendered score behavior, continuous range selection, chord overlays, the range annotation rail, auto-centering playback, line measure numbers, serif typography, and visual score metadata header with inline ABC editing
- [interaction-model.md](./interaction-model.md): shared `ScoreAnchor` model, repeat-pass resolution, user scroll-pause, inline metadata editing flows, undo/redo flows, and cross-surface interaction flows
- [abc-editor.md](./abc-editor.md): split-pane editor behavior, draggable divider, validation state, and bidirectional metadata synchronization requirements
- [playback-dock.md](./playback-dock.md): playback UI, WebAudio volume/mute controls, seek behavior, and score-cursor alignment
- [pi-agent-chat.md](./pi-agent-chat.md): resizable chat panel, per-file thread model, immutable context envelope, agent tool status, Markdown links, and proposal review
- [settings-and-auth.md](./settings-and-auth.md): settings modal, custom API endpoint configuration (OpenAI/Anthropic/Google Gemini/OpenRouter/Custom), ChatGPT OAuth authentication, safe credential storage, and agent trace export
- [file-workspace-architecture.md](./file-workspace-architecture.md): runtime architecture, debounced persistence boundaries, editing history timeline, shared music & ABC metadata libraries, contracts, and invariants
- [score-drafting.md](./score-drafting.md): blank piano-score creation, fail-closed measure mutations, and reviewable score-change proposals

## Supporting specs

- [pi-agent-feasibility.md](./pi-agent-feasibility.md): prototype feasibility findings and decisions for the Pi adapter path
- [agent-analysis-and-annotations.md](./agent-analysis-and-annotations.md): authoritative product scope, shared contracts, acceptance criteria, and verification strategy for the passage-aware Music Tutor
- [agent-tools-and-profiles.md](./agent-tools-and-profiles.md): internal profile registry, immutable `ScoreSnapshot`, score tools, and IPC events
- [annotations-and-proposals.md](./annotations-and-proposals.md): canonical annotation schema, atomic Apply All lifecycle, editing, persistence, and overlay ownership

## Product summary

The design direction is a file-owned music workspace where score viewing, ABC editing, playback, annotations, and chat operate on the same active score state. Key architectural elements:

- file-scoped workspace state with debounced local storage persistence and bounded revision history
- score editing history timeline (up to 100 entries) with categories (`origin`, `metadata`, `body`, `annotation`), header undo/redo actions, and tools history revert
- shared `ScoreAnchor` model linking score selection, playback seek, and chat prompt context
- split score and ABC workspace with drag-resizable panes
- auto-centering playback line with user scroll pause behavior
- repeat-aware measure selection avoiding unnecessary DOM re-renders
- line-start measure numbers and smooth score transition rendering
- visual score metadata header (`ScoreMetadataHeader`) with classical serif typography (`--font-serif`), right-aligned score taglines, and validated interactive Key/Meter/Tempo chips with inline ABC editing
- persistent 3-column top header with consolidated score title, header undo/redo actions, and save/SVG/audio status indicators
- floating score display options (`ScoreCardHeader`) with scroll-reactive translucency and synchronized zoom controls
- a React-owned chord overlay plus a score-aligned rail for modulation, voice leading, and explanations
- one visible Music Tutor with internal profiles, immutable score reads, and reviewable annotation and score-change proposals
- user-configurable AI authentication (custom API endpoints, API keys, ChatGPT subscription OAuth) and local JSONL trace logging

## Implemented workspace features

- [x] File rail with document list, file import, reordering, deletion down to empty state, collapse toggle, and drag-resizing
- [x] Icon-tabbed Files and Tools rail panels, direct bottom settings action, handled drag-reordered files, and ABC display ownership
- [x] Score editing history modal (`EditingHistoryModal.tsx`) accessible via Tools panel with categorized snapshot timeline and one-click revert
- [x] Header Undo/Redo action buttons with keyboard shortcuts (Ctrl+Z / ⌘Z and Ctrl+Shift+Z / ⌘Shift+Z)
- [x] Resizable right-side chat panel with toggle, per-file thread persistence, and configurable thinking level
- [x] Persistent top header with consolidated score title, undo/redo buttons, and status pills (`Auto-saved`, `SVG ready`, `Music ready`)
- [x] Floating score display options with scroll-reactive translucency and synchronized sheet zoom controls
- [x] Visual score metadata header (`ScoreMetadataHeader`) with serif typography (`--font-serif`), right-aligned attribution, Add Field (`+`) menu, and interactive Key/Meter/Tempo metadata chips with inline ABC editing and validation
- [x] Split ABC editor pane with draggable divider, status chrome (`Valid · r{revision}`, `Rebuilding`, `Invalid ABC`), and local storage persistence
- [x] Continuous written-measure range selection and chat context chip (`m. N` or `mm. N–M`)
- [x] Shared score anchor selection and repeat-pass resolution (`selectMeasureWithRepeats`)
- [x] WebAudio piano synth playback dock with GainNode volume slider, mute toggle, and max-width layout
- [x] Auto-centering score playback line with smooth scrolling and 2-second user scroll pause
- [x] Score zoom layout space reservation preventing SVG container clipping
- [x] Line-start measure numbers and collision-free chord overlay with shared-zoom, measure-aligned range annotation rail
- [x] Debounced document autosave (400ms) with bounded version history (max 10 revisions)
- [x] Internal analysis profiles (`general`, `harmony`, `voice-leading`, `form-phrase`) plus score tools (`get_score_summary`, `read_measure_range`, `get_annotations`, `propose_annotations`, `propose_measure_replacement`)
- [x] Blank two-staff piano score creation, fail-closed range editing, and previewable score-change proposals
- [x] Sanitized Markdown responses with interactive measure links, collapsible thinking traces, and non-navigating highlighted external links
- [x] Proposal review with individual Edit/Reject and one atomic turn-level Apply All
- [x] Settings modal for API key & ChatGPT OAuth provider credentials (`AISettingsModal.tsx`, `useAIProviders.ts`, `electron/ai/*`)
