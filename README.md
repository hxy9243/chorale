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

---

## 🛠 Tech Stack

- **Framework**: React 18 + Vite + TypeScript
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

### Run Unit Test Suite
```bash
npm test
```

### Build for Production
```bash
npm run build
```

Launch the production build locally with:

```bash
npm run start:electron
```

Installers, signing, publishing, and auto-update are not part of this development shell.

---

## 📜 License

[MIT License](./LICENSE) © 2026 Chorale
