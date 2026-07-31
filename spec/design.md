# Chorale Design Spec Index

Date: 2026-07-28  
Source: Figma file `Chorale — Chat with Music Sheet · V1`

This directory splits the design into category-specific specs instead of keeping the entire workspace design in one file.

## Core design specs

- [workspace-layout.md](./workspace-layout.md): top-level workspace structure, header, file rail, resizable sidebars, and central layout
- [score-surface.md](./score-surface.md): rendered score behavior, multi-measure annotations, key modulation ribbons, Roman numeral analysis tracks, auto-centering playback, and score UI
- [interaction-model.md](./interaction-model.md): shared `ScoreAnchor` model, repeat-pass resolution, user scroll-pause, and cross-surface interaction flows
- [abc-editor.md](./abc-editor.md): split-pane editor behavior, draggable divider, validation state, and synchronization requirements
- [playback-dock.md](./playback-dock.md): playback UI, WebAudio volume/mute controls, seek behavior, and score-cursor alignment
- [pi-agent-chat.md](./pi-agent-chat.md): resizable chat panel, per-file thread model, context envelope, agent tool registry, and proposal review workflows
- [settings-and-auth.md](./settings-and-auth.md): settings modal, custom API endpoint configuration (OpenAI/Anthropic/Ollama/OpenRouter), ChatGPT OAuth authentication, and safe credential storage
- [file-workspace-architecture.md](./file-workspace-architecture.md): runtime architecture, debounced persistence boundaries, contracts, and invariants

## Supporting specs

- [pi-agent-feasibility.md](./pi-agent-feasibility.md): prototype feasibility findings for the Pi adapter path

## Product summary

The design direction is a file-owned music workspace where score viewing, ABC editing, playback, annotations, and chat operate on the same active score state. Key architectural elements:

- file-scoped workspace state with debounced local storage persistence and bounded revision history
- shared `ScoreAnchor` model linking score selection, playback seek, and chat prompt context
- split score and ABC workspace with drag-resizable panes
- auto-centering playback line with user scroll pause behavior
- repeat-aware measure selection avoiding unnecessary DOM re-renders
- structured multi-measure harmonic annotation layer (key modulations, Roman numeral analysis tracks, chord symbols)
- AI agent runtime equipped with reading, mutation, and annotation tool suites with user proposal review cards
- user-configurable AI authentication (custom API endpoints, API keys, ChatGPT subscription OAuth)

## Implemented workspace features

- [x] File rail with document list, file import, reordering, deletion, collapse toggle, and drag-resizing
- [x] Icon-tabbed Files, Tools, and Settings rail panels with drag-reordered files, ABC display, and settings ownership
- [x] Resizable right-side chat panel with toggle and per-file thread persistence
- [x] Floating score display controls plus title-local autosave, SVG, and audio status
- [x] Split ABC editor pane with draggable divider, status chrome (`Valid · r{revision}`, `Rebuilding`, `Invalid ABC`), and local storage persistence
- [x] Shared score anchor selection and repeat-pass resolution (`selectMeasureWithRepeats`)
- [x] WebAudio piano synth playback dock with GainNode volume slider, mute toggle, and max-width layout
- [x] Auto-centering score playback line with smooth scrolling and 2-second user scroll pause
- [x] Score zoom layout space reservation preventing SVG container clipping
- [x] Debounced document autosave (400ms) with bounded version history (max 10 revisions)

## Specified target features

- [ ] Inline document annotation overlay rendering on notation surface (key ribbons, Roman numeral track, multi-measure spans)
- [ ] Settings modal for API key & ChatGPT OAuth provider credentials
- [ ] Agent tool handler implementation (`annotate_harmonies`, `replace_abc_range`, `navigate_to_measure`)
- [ ] Explicit proposal-and-review UI card for AI-suggested ABC edits and annotations
