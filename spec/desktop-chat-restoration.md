---
title: Desktop chat restoration
status: implementing
date: 2026-10-22
source_files:
  - electron/main.ts
  - electron/preload.ts
  - electron/ai/controller.ts
  - src/App.tsx
  - src/components/AgentChatPanel.tsx
  - src/components/AISettingsModal.tsx
  - scripts/dev-electron.mjs
  - scripts/electron-lifecycle.mjs
  - electron/daemon.ts
  - server/cli.mjs
test_files:
  - scripts/electron-smoke.mjs
  - test/electron-launcher.node.mjs
  - src/agent/__tests__/sheetAgentRuntime.integration.test.ts
  - src/components/__tests__/AgentChatPanel.test.tsx
  - src/hooks/usePluginMcpBridge.test.ts
  - src/utils/__tests__/storageAdapter.test.ts
  - src/hooks/__tests__/useWorkspaceLayout.test.tsx
related_specs:
  - spec/pi-agent-chat.md
  - spec/settings-and-auth.md
  - spec/annotations-and-proposals.md
  - spec/workspace-layout.md
---

# Desktop chat restoration

Restore the archived passage-aware desktop tutor and annotation/score proposals on the current workspace. Preserve the current ABC editor, waterfall, exports, pane layouts, browser workspace and MCP integrations.

## Runtime

`npm run dev:electron` starts the renderer, builds/watches the desktop main process and preload, and launches Electron. `npm run run:electron` aliases it. `npm run build:electron` builds desktop artifacts; the existing browser build remains usable independently. Desktop uses the same local Chorale daemon and score database as the CLI/browser rather than restoring an obsolete document store. Runtime startup must fail visibly if shared storage cannot be reached. An Electron signal abort must return a nonzero launcher status. If stderr identifies an incorrectly configured Linux SUID helper, print the exact one-time ownership/mode setup commands. Keep sandboxing enabled by default; never silently retry without it.

## Chat and review

Restore file-specific conversations, captured passage/revision context, cancellation, queued follow-ups, steering, provider settings, annotation proposals and score previews. Accepted annotations persist in the document and remain editable on the score. Background annotation reads must not overwrite unsaved local edits or apply a response captured before a local change. Score edits are reviewed before application and stale proposals cannot overwrite a newer revision. Keep AI credentials exclusively in the main process using the archived encrypted connection store. Browser/plugin usage stays functional without the desktop bridge.

## Desktop dependencies

The desktop uses matched Pi agent-core/AI 1.4.0 packages, Electron 45.0.0,
assistant-ui 0.15.31, Streamdown 2.7.1 and Playwright Core 1.64.1. Pi requires
Node.js 22.19+ on the 22.x line or 24+ for source installs and the local daemon.
Keep exact desktop runtime pins and the lockfile synchronized. Electron 45
downloads its binary on first use instead of using an npm postinstall script;
the previous version-specific install-script permission is no longer needed.
Updates must pass the real
desktop smoke flow as well as agent/provider and browser regressions.

## Scope

This change restores the interactive agent foundation. Autonomous scheduled/background agents are a follow-up, not enabled by default.

## Verification

Run restored agent and chat tests, current workspace regression tests, the complete unit/integration suite, TypeScript checks, lint, browser and desktop builds, and a desktop launch smoke test. Exercise annotations, proposals and current pane layouts in the smoke test without making paid provider requests.
