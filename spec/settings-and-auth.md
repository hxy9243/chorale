---
title: "Settings & Application Configuration Spec"
description: "Specification for application settings modal presentation, interface scaling, and system info"
category: "configuration"
date: 2026-07-29
updated: 2026-09-14
status: "implemented"
source_files:
  - src/components/SettingsModal.tsx
  - src/hooks/useInterfaceZoom.ts
test_files:
  - src/components/__tests__/SettingsModal.test.tsx
  - src/hooks/__tests__/useInterfaceZoom.test.ts
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
---

# Settings & Application Configuration Spec

Date: 2026-07-29  
Updated: 2026-09-14  
Status: Web & MCP App implementation (Desktop AI providers archived on `electron` branch)

## 1. Goal

Provide an accessible, streamlined Settings modal for application-level preferences in the web/plugin workspace, specifically interface scaling and application/runtime information.

*Note on AI Providers:* In the plugin and skill-first architecture, AI agent credentials and model interactions are managed externally via MCP servers (e.g., Antigravity, Claude Code, Codex). Embedded in-app AI provider configuration and agent traces from the legacy desktop app are preserved on the `electron` branch.

## 2. Access and presentation

- A gear button in the bottom-aligned **Settings** action of the left rail opens the accessible **Settings** modal.
- Settings uses a compact **Settings** header and vertical tabs: **Appearance** and **About**.
- The dialog retains the same centered position, width, and height while switching tabs; sparse tabs do not shrink or move the frame.
- **Appearance** controls a persistent 80%–160% interface scale. Ctrl/Cmd + wheel changes the same setting outside the score; over the score it changes score zoom only.
- Interface scaling preserves the visible viewport bounds.
- **About** displays the Chorale name, release (`__APP_VERSION__`), and current runtime environment (Browser or Desktop).
- The modal traps focus, closes with Escape or its close button, and restores focus to its trigger.

## 3. Settings Tabs

### Appearance
- Controls persistent interface scale between `80%` and `160%` in increments of 10%.
- Includes a live percentage indicator and a "Reset to 100%" button.
- Updates the `--interface-zoom` variable and viewport-dependent sizing in real time.

### About
- Displays the Chorale brand logo mark and product vision ("Music score workspace and agent skill").
- Reports the application version (`__APP_VERSION__`).
- Reports the runtime environment (Browser or Desktop).
