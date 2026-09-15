<div align="center">

# 🎼 Chorale

**A high-precision music notation workspace and MCP tool server for AI coding agents.**

[![Version](https://img.shields.io/badge/version-0.0.0-rose.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-emerald.svg)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-blue.svg)](package.json)

[Overview](#-overview) •
[Features](#-features) •
[Quick Start](#-quick-start) •
[Agent Setup](#-ai-agent-setup-codex-claude-antigravity) •
[Documentation](#-documentation-index)

</div>

---

## 🌟 Overview

**Chorale** is a music workspace, autonomous agent skill, and local Model Context Protocol (MCP) server engineered specifically for AI coding agents (**OpenAI Codex**, **Claude Code**, **Google Antigravity**). It provides deterministic score inspection, bounded measure reads, safe musical mutations, harmonic annotations, and an interactive browser workspace.

Chorale unifies the score workspace and AI tools into a single local background daemon running on port **1685**, backed by durable local storage in `~/.chorale/`.

---

## ✨ Features

- **CLI-First Architecture**: Run `chorale` as an independent CLI tool that manages the server in the background and opens the interactive workspace in your browser on demand.
- **Model Context Protocol (MCP)**: Full stdio and SSE MCP server on port 1685 exposing 16 modular musical score tools to Codex, Claude Code, and Antigravity.
- **Durable Local Storage (`~/.chorale/`)**: Scores and revisions persist directly to the filesystem in `~/.chorale/store.json` and `~/.chorale/scores/`.
- **Bounded Measure Operations**: Fast, deterministic measure reading (`read_measure`), insertion (`insert_measure`), replacement (`edit_measures` / `edit_measure`), and deletion (`delete_measures`) with optimistic revision guards.
- **Harmonic Annotations**: Add, edit, delete, and list annotations with Roman numeral analysis and chord symbols directly on the score.
- **MusicXML & MXL Import**: Drag-and-drop or programmatic import of `.xml`, `.musicxml`, and compressed `.mxl` files converted via `@educandu/abc-tools`.
- **Interactive Sheet Music**: High-legibility SVG score rendered via `abcjs` with dynamic zoom (60% to 180%) and key transposition.
- **WebAudio Piano Synthesizer**: Audio player with tempo scaling (50% to 180%), volume control, and active note cursor highlighting (`#e11d48`) on the SVG score during audio playback.
- **Score Video Export**: Export sheet music video animations with WebCodecs AAC/MP4 rendering.
- **Desktop Electron Archive**: The original standalone Electron desktop shell is preserved intact on branch `electron` (tag `v0.1-electron-archive`).

---

## 🛠 Tech Stack

- **CLI & MCP Server**: Node.js + `@modelcontextprotocol/sdk` + `zod`
- **Notation & Audio**: `abcjs` + `@educandu/abc-tools` + `abc-utils`
- **Video Export**: `@mediabunny/aac-encoder` + `mediabunny`
- **Frontend Framework**: React 19 + Vite + TypeScript
- **Archive Extraction**: `jszip`
- **Design Tokens**: Custom CSS Paper/Glassmorphism + `lucide-react`
- **Testing**: Node Test Runner + Vitest + `@testing-library/react` + `jsdom`

---

## 🚀 Quick Start

### Install Dependencies & Build
```bash
# 1. Install dependencies
npm install

# 2. Build the production workspace
npm run build

# 3. (Optional) Link CLI globally so `chorale` is available in PATH
npm link
```

### Launch Chorale & Web Workspace
```bash
# Launch server on port 1685 and open interactive workspace in default browser
chorale
# Or via npm
npm start

# Check server status
chorale status

# Show command line help
chorale help

# Connect via MCP stdio transport (for AI agents)
chorale mcp
# Or via npm
npm run mcp

# Gracefully stop the background daemon
chorale stop
```

The local service owns both the UI and MCP state at `http://127.0.0.1:1685`.

### Start Development Server
```bash
npm run dev
# Opens Vite dev server on http://localhost:5173/
```

### Run Verification & Tests
```bash
# Run both MCP server tests and unit tests
npm test

# Run MCP server tests only
npm run test:mcp

# Run unit tests only
npm run test:unit
```

---

## 🤖 AI Agent Setup (Codex, Claude, Antigravity)

Chorale is equipped with skills and MCP definitions ready for pair programming with autonomous agents:

- **Google Antigravity**: Configured in `.agents/mcp_config.json` and detected via [`.agents/skills/chorale-score/SKILL.md`](./.agents/skills/chorale-score/SKILL.md).
- **OpenAI Codex**: Manifest in [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) and installable via local marketplace or `codex mcp add`.

  Before a local marketplace installation, run `npm run package:codex` to generate the current self-contained plugin in `plugins/chorale-codex-plugin`. Rebuild and reinstall after source updates; start a new Codex task to load the updated tools.
- **Claude Code & Claude Desktop**: Configurable via stdio (`chorale mcp`) or SSE (`http://127.0.0.1:1685/sse`).

For complete, step-by-step agent installation guides and MCP configurations, see:  
👉 **[INSTALL.md](./INSTALL.md)**

---

## 📚 Documentation Index

- **[Installation & Configuration Guide](./INSTALL.md)**: Full agent setup, CLI details, and MCP tool reference.
- **[Musical Workflow Skill (`skills/chorale-score/SKILL.md`)](./skills/chorale-score/SKILL.md)**: Musical composition, bounded reads, and analysis reference for AI agents.
- **[Engineering Conventions (`AGENTS.md`)](./AGENTS.md)**: Spec-first workflow, invariants, and quality gates.
- **[Design Language (`DESIGN.md`)](./DESIGN.md)**: Workspace paper surfaces, typography, and component specifications.
- **[Design & Architecture Specifications (`spec/`)](./spec/design.md)**: Comprehensive architectural specifications.

---

## 📜 License

[MIT License](./LICENSE) © 2026 Chorale
