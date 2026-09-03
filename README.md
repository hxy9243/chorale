# Chorale 🎵

> A modern MusicXML to ABC sheet music renderer & WebAudio piano synthesizer player.

Chorale is a Proof of Concept (PoC) web application that imports MusicXML files (`.xml`, `.musicxml`, and compressed `.mxl`), parses them into ABC notation, renders interactive SVG vector sheet music, and plays back synthesized piano audio with synchronized note highlights.

---

## ✨ Key Features

- **MusicXML & MXL Import**: Drag and drop local `.xml`, `.musicxml`, or compressed `.mxl` files (unzipped in browser via `JSZip`), or pick built-in preset samples.
- **Xml2Abc Conversion Engine**: Converts MusicXML into ABC notation using `@educandu/abc-tools` (Wim Vree's `xml2abc` engine).
- **Interactive Sheet Music**: High-legibility SVG score rendered using `abcjs` with dynamic zoom (60% to 180%) and semitone key transposition (+1 / -1 / reset).
- **WebAudio Piano Synthesizer**: Audio player with Play/Pause/Stop, tempo percentage slider (50% to 180%), volume control, and active note cursor highlighting (`#e11d48`) on the SVG score during audio playback.
- **ABC Code Editor**: View & edit ABC notation in real-time with instant score re-rendering and copy to clipboard button.
- **Score Drafting**: Create a blank two-staff piano score, select measures, and make revision-tracked insert, replace, or delete edits.
- **Desktop Music Tutor**: Ask grounded questions, review annotations, and preview agent-proposed measure or whole-score changes before applying them.
- **Durable Tutor Conversations**: Inspect structured reasoning and tool progress, queue follow-up prompts while a run is busy, steer urgent corrections with `Ctrl/Cmd+Shift+Enter`, and review per-round token usage.

---

## 🛠 Tech Stack

- **Framework**: React 19 + Vite + TypeScript
- **Notation & Audio**: `abcjs` + `@educandu/abc-tools`
- **Archive Unzipping**: `jszip`
- **UI & Icons**: Custom CSS Glassmorphism + `lucide-react`
- **Testing**: Vitest + `@testing-library/react` + `jsdom`

---

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

The browser build supports score editing but intentionally disables AI provider setup.

### Start the Electron desktop app

```bash
npm run dev:electron
```

Electron is required for AI provider credentials, model discovery, OpenAI Codex login, and provider-backed chat.

### Debug agent conversations

Every desktop chat request writes one local `.jsonl` trace beneath Chorale's OS user-data directory. Open **Settings → Agent traces → Open agent trace folder** to locate the files. Each line is a timestamped event with a stable `schemaVersion`, `sequence`, and `requestId`.

The trace covers:

- `run-start`: the system prompt, Pi agent identity, selected provider/model, thinking level, profile modules, tool schemas, rebuilt history, current prompt, and immutable music context;
- `provider-request` / `provider-response`: the exact payload sent on every model turn and response status metadata;
- `agent-event`: complete messages plus tool arguments/results and profile-tool output (streaming text deltas are intentionally omitted because `message_end` and `run-end` contain the completed messages);
- `run-end`: completion/error state, selected profiles, and the full final agent transcript.

For example:

```bash
jq 'select(.event == "run-start") | .data | {agent, model, systemPrompt, currentPrompt}' <trace>.jsonl
jq 'select(.event == "provider-request") | .data.payload' <trace>.jsonl
jq 'select(.event == "run-end") | .data.messages' <trace>.jsonl
```

Trace files contain score and conversation content verbatim and are not encrypted. Stored provider credentials and sensitive response headers are redacted. Renderer conversation persistence remains separate from traces: IndexedDB stores the full conversation, while local storage provides a compact synchronous mirror. Neither store is a full model trace.

### Run Unit Test Suite
```bash
npm test
```

### Check chat performance

```bash
npm run benchmark:chat
```

This builds the app and checks composer responsiveness against a large conversation fixture.

### Build for Production
```bash
npm run build
```

Launch the production build locally with:

```bash
npm run start:electron
```

Installers, signing, publishing, and auto-update are not part of this development shell.

## Project Documentation

- [Design and specification index](./spec/design.md)
- [Engineering conventions](./AGENTS.md)

---

## 📜 License

[MIT License](./LICENSE) © 2026 Chorale
