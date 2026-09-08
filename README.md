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
- **Codex & Agent Skill + MCP**: Run Chorale as an MCP server with skills (`skills/chorale-score/SKILL.md`) for AI coding agents (Codex, Claude Code, Antigravity) to inspect scores, read measure ranges, propose edits, and queue annotations.
- **Score Workspace MCP Apps UI**: Optional interactive score view embedded directly inside compatible agent hosts.
- **Desktop Electron Archive**: The original standalone Electron desktop shell is preserved on branch `electron` (tag `v0.1-electron-archive`).

---

## 🛠 Tech Stack

- **MCP & Plugin**: `@modelcontextprotocol/sdk` + `zod`
- **Notation & Audio**: `abcjs` + `@educandu/abc-tools`
- **Framework**: React 19 + Vite + TypeScript
- **Archive Unzipping**: `jszip`
- **UI & Icons**: Custom CSS Paper/Glassmorphism + `lucide-react`
- **Testing**: Node Test Runner + Vitest + `@testing-library/react` + `jsdom`

---

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Run MCP Plugin Server
```bash
npm start
# Launches the stdio MCP server exposing Chorale score tools and UI resource
```

### Start Web Workspace (Dev)
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Run Verification & Tests
```bash
# Run both MCP tests and unit tests
npm test

# Run MCP server tests only
npm run test:mcp

# Run unit tests only
npm run test:unit
```

### Build for Production
```bash
npm run build
```

### Electron Desktop App
The standalone Electron desktop shell is preserved on the `electron` branch:
```bash
git checkout electron
npm install
npm run dev:electron
```

## Project Documentation

- [Design and specification index](./spec/design.md)
- [Engineering conventions](./AGENTS.md)

---

## 📜 License

[MIT License](./LICENSE) © 2026 Chorale
