<div align="center">

# 🎼 Chorale

Experimental desktop PDF/PNG recognition: see [the scan-import trial](docs/score-scan-import.md).

**A high-precision music notation workspace and MCP tool server for AI coding agents.**

[![Version](https://img.shields.io/badge/version-0.0.1-rose.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![Tests](https://github.com/hxy9243/chorale/actions/workflows/ci.yml/badge.svg)](https://github.com/hxy9243/chorale/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22.22.2%2B%20or%2024.15%2B%20or%2026%2B-blue.svg)](package.json)

[Overview](#-overview) •
[Quick Start](#-quick-start) •
[Contributing](#-contributing) •
[Agent Setup](#-ai-agent-setup-codex-claude-antigravity) •
[Features](#-features) •
[Tech Stack](#-tech-stack) •
[License](#-license)

</div>

---

## 🌟 Overview

**Chorale** is an AI agent companion for reading, analyzing, and composing music. Give your agent a score and it can explain what is happening, annotate chord progressions with chord symbols and Roman numerals, trace phrases and cadences, examine form and voice leading, or help turn a musical idea into a complete piece.

Work with your agent directly on the music: create a new score, import an existing one, focus on a passage, and ask for targeted revisions. Chorale pairs interactive sheet music with hands-on ABC source editing, so you can review every suggestion, refine the notation yourself, transpose or play back the result, and keep composing together.

<div align="center">
<img src="./chorale.png" width="50%">
</div>

## 🚀 Quick Start

### Let your agent set it up

Ask your coding agent to install Chorale's MCP/plugin integration. It can follow the complete, agent-specific instructions in [INSTALL.md](./INSTALL.md) and then use Chorale tools to create, inspect, and edit scores.

Copy and paste this into your agent:

```text
Set up Chorale for me using its MCP server or plugin. Follow the installation instructions at https://github.com/hxy9243/chorale/blob/main/INSTALL.md, then confirm that Chorale is connected and ready to use.
```

### Example: Compose a Piano Piece

Once Chorale is connected, ask your agent to create and open a score:

```text
Use Chorale to compose an original 16-measure piano piece inspired by Mozart's Classical-era style. Write it in C major, 4/4, at a moderate tempo, with a singable right-hand melody and an Alberti-bass accompaniment in the left hand. Use clear phrase structure, then open the finished score in Chorale so I can review and play it.
```

### Install and launch

Use Node.js 22.22.2+ on the 22.x line, 24.15+ on the 24.x line, or 26+. Install the GitHub package globally:

```bash
npm install -g github:hxy9243/chorale
chorale
```

`chorale` starts the local HTTP/MCP service and opens the desktop app. Closing
its window leaves the service available for connected agents. On npm 12, Git
fetching is disabled by default; opt into this install with
`npm install -g github:hxy9243/chorale --allow-git=root`. Respect any additional
lifecycle-script policy set by your npm administrator. A local installation can
be launched with `npx chorale`.

For a source checkout, run `npm ci` and `npm link`. Installation prepares both
the browser and desktop builds. `chorale --browser` opens the browser workspace;
`chorale serve` runs the HTTP service in the foreground. `chorale mcp` remains a
headless stdio adapter. The service stays on `http://127.0.0.1:1685`, with
Streamable HTTP MCP at `/mcp` and legacy SSE at `/sse`.

The first desktop launch offers optional AI-app connections. Each change is
previewed and requires confirmation. Reopen setup from **Chorale → Connect AI
apps…** or run `chorale setup mcp`. Claude Desktop, Claude Code, Antigravity and
Codex can be registered locally; ChatGPT receives HTTPS connector guidance.
Nothing is registered during npm installation.

To start it from an agent, register its MCP command. The MCP adapter starts the same background service automatically:

```bash
codex mcp add chorale -- chorale mcp
```

For Codex plugin setup, Claude, Antigravity, and other MCP-client examples, see [INSTALL.md](./INSTALL.md).

---

## 🤝 Contributing

Pull the source and run the development workspace locally:

```bash
git clone https://github.com/hxy9243/chorale.git
cd chorale
npm install
npm run dev
```

`npm run dev` starts the Vite development server at `http://localhost:5173/`.

For the desktop app with passage-aware chat, AI provider settings, annotations, and reviewable score edits:

```bash
npm run dev:electron
```

`npm run run:electron` is an alias. The desktop launcher starts or reuses the shared Chorale daemon, so desktop, browser, and MCP clients use the same score database. The current ABC editor, waterfall, split layouts, and video exports remain available. Provider credentials stay in the Electron main process; chat history stays in the desktop profile. Background agents are not started automatically.

Electron 45 downloads its binary on the first launch, so that launch may take
longer. Later launches reuse the downloaded binary.

To run a built desktop app, first run `npm run build` and `npm run build:electron`, then `npm run start:electron`. On Linux, if Electron reports an incorrectly configured SUID sandbox helper, configure the installed helper once:

```bash
sudo chown root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

`npm run smoke:electron` checks desktop launch, chat and proposal review with simulated provider responses and an isolated score database. It makes no provider requests. In a restricted test container that cannot use Chromium sandboxing, the smoke test alone accepts `CHORALE_SMOKE_NO_SANDBOX=1`.

Before opening a pull request, run:

```bash
npm test
npx tsc -b
npm run lint
```

---

## 🤖 AI Agent Setup (Codex, Claude, Antigravity)

Chorale is equipped with skills and MCP definitions ready for pair programming with autonomous agents:

- **Google Antigravity**: Packaged via `npm run package:antigravity` (auto-copies skills into `plugins/antigravity/skills/`) and installed via `agy plugin install plugins/antigravity`, or detected directly in `.agents/skills/chorale-score/SKILL.md`.
- **OpenAI Codex**: Manifest in [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) and installable via local marketplace or `codex mcp add`.

  Before a local marketplace installation, run `npm run package:codex` to generate the self-contained plugin in `plugins/chorale-codex-plugin` (auto-copying skills and bundled runtime). Rebuild and reinstall after source updates; start a new Codex task to load the updated tools.
- **Claude Code & Claude Desktop**: Configurable via stdio (`chorale mcp`) or SSE (`http://127.0.0.1:1685/sse`).

For complete, step-by-step agent installation guides and MCP configurations, see:  
👉 **[INSTALL.md](./INSTALL.md)**

---


## ✨ Features

- **CLI-First Architecture**: Run `chorale` to open the desktop app with its shared HTTP/MCP service, or `chorale --browser` for the browser workspace.
- **Model Context Protocol (MCP)**: Full stdio and SSE MCP server on port 1685 exposing 18 registered musical score tool names to Codex, Claude Code, and Antigravity (`edit_measure` remains an alias of `edit_measures`).
- **Durable Local Storage (`~/.chorale/`)**: Scores and revisions persist directly in `~/.chorale/chorale.db` (SQLite via `node:sqlite`) and `~/.chorale/scores/`.
- **Bounded Measure Operations**: Fast, deterministic measure reading (`read_measure`), insertion (`insert_measure`), replacement (`edit_measures` / `edit_measure`), and deletion (`delete_measures`) with optimistic revision guards.
- **Harmonic Annotations**: Add, edit, delete, and list annotations with Roman numeral analysis and chord symbols directly on the score.
- **music21 Harmony Evidence**: Install the pinned optional analyzer with `chorale setup music21`, then use `analyze_harmony` for bounded, read-only chord and key candidates that agents verify before annotation. See the [benchmark summary](./docs/harmony-analysis-benchmark.md).
- **MusicXML & MXL Import**: Drag-and-drop or programmatic import of `.xml`, `.musicxml`, and compressed `.mxl` files converted via `@educandu/abc-tools`.
- **Interactive Sheet Music**: High-legibility SVG score rendered via `abcjs` with dynamic zoom (60% to 180%) and key transposition.
- **WebAudio Piano Synthesizer**: Audio player with tempo scaling (50% to 180%), volume control, and active note cursor highlighting (`#e11d48`) on the SVG score during audio playback.
- **Score Video Export**: Export sheet music or piano waterfall videos in landscape or portrait, with synchronized audio and MP4/WebM output.
- **Split Stack Workspace**: Stack two panes beside a full-height third pane, with corner dragging and independently resizable rows and columns.
- **Desktop Chat**: Optional Electron app with passage-aware conversations, provider settings, queued follow-ups and steering, annotation proposals, and score preview/apply. Run `npm run dev:electron`. The original desktop snapshot remains on branch `electron` (tag `v0.1-electron-archive`).

---

## 🛠 Tech Stack

- **CLI & MCP Server**: Node.js + `@modelcontextprotocol/sdk` + `zod`
- **Notation & Audio**: `abcjs` + `@educandu/abc-tools` + `abc-utils`
- **Harmony Evidence**: optional managed Python environment with `music21==9.9.1`
- **Video Export**: `@mediabunny/aac-encoder` + `mediabunny`
- **Frontend Framework**: React 19 + Vite + TypeScript
- **Archive Extraction**: `jszip`
- **Design Tokens**: Custom CSS Paper/Glassmorphism + `lucide-react`
- **Testing**: Node Test Runner + Vitest + `@testing-library/react` + `jsdom`

---

## 📜 License

[MIT License](./LICENSE) © 2026 Chorale
