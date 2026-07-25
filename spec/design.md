# Chorale Design Spec Index

Date: 2026-07-25  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

This directory now splits the design into category-specific specs instead of keeping the entire workspace design in one file.

## Core design specs

- [workspace-layout.md](./workspace-layout.md): top-level workspace structure, header, file rail, and central layout
- [score-surface.md](./score-surface.md): rendered score behavior, selection, annotation overlays, and score-specific UI
- [interaction-model.md](./interaction-model.md): shared `ScoreAnchor` model and cross-surface interaction flows
- [abc-editor.md](./abc-editor.md): split-pane editor behavior, validation state, and synchronization requirements
- [playback-dock.md](./playback-dock.md): playback UI, seek behavior, and score-cursor alignment
- [pi-agent-chat.md](./pi-agent-chat.md): chat panel, thread model, context envelope, and tool-facing product rules
- [file-workspace-architecture.md](./file-workspace-architecture.md): runtime architecture, persistence boundaries, contracts, and invariants

## Existing supporting specs

- [pi-agent-feasibility.md](./pi-agent-feasibility.md): prototype feasibility findings for the Pi adapter path

## Product summary

The design direction is a file-owned music workspace where score viewing, ABC editing, playback, annotations, and chat operate on the same active score state. The main product-level shifts from the current prototype are:

- file-scoped workspace state instead of a single in-memory score
- a shared `ScoreAnchor` used by score selection, playback, annotations, and chat
- a split score and ABC workspace
- durable file objects such as annotations, score info, and revisions
- chat that is attached to the active file rather than acting as a generic side panel

## Current implementation gaps

Compared with the current branch, the design still requires:

- file rail and file-owned state
- shared score-anchor infrastructure
- persistent annotations
- split score and ABC layout
- revision-gated rebuilds
- per-file chat threads
- explicit separation between ephemeral chat state and durable file mutations
