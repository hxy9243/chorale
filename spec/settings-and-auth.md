---
title: "Settings & Application Configuration Spec"
description: "Specification for application settings modal presentation, interface scaling, and system info"
category: "configuration"
date: 2026-07-29
updated: 2026-10-26
status: "implemented"
source_files:
  - src/components/SettingsModal.tsx
  - src/components/AISettingsModal.tsx
  - src/agent/useAIProviders.ts
  - electron/ai/connectionStore.ts
  - electron/ai/electronCipher.ts
  - src/hooks/useInterfaceZoom.ts
  - src/utils/appearance.ts
  - src/hooks/useAppearance.ts
  - src/assets/chorale-logo.svg
test_files:
  - src/components/__tests__/SettingsModal.test.tsx
  - src/components/__tests__/SettingsAppearance.test.tsx
  - src/utils/__tests__/appearance.test.ts
  - src/components/__tests__/AISettingsModal.test.tsx
  - src/agent/__tests__/connectionStore.test.ts
  - src/hooks/__tests__/useInterfaceZoom.test.ts
related_specs:
  - spec/design.md
  - spec/workspace-layout.md
---

# Settings & Application Configuration Spec

Date: 2026-07-29  
Updated: 2026-10-26
Status: Browser settings and optional desktop provider settings implemented

## 1. Goal

Provide an accessible, streamlined Settings modal for application-level preferences in the web/plugin workspace, specifically interface scaling and application/runtime information.

*AI providers:* Browser/plugin clients keep provider configuration in the external agent. The optional Electron workspace restores API providers, Appearance, Agent traces, and About tabs through `AISettingsModal`. Credentials remain in the main process, encrypted with Electron safeStorage when available; otherwise the connection store keeps secrets only in memory and labels them session-only. Provider requests use immutable score snapshots and return proposals for review. See `spec/desktop-chat-restoration.md`.

## 2. Access and presentation

- A gear button in the bottom-aligned **Settings** action of the left rail opens the accessible **Settings** modal.
- Settings uses a compact **Settings** header and vertical tabs: **Appearance**, **Integration** and **About**.
- The dialog retains the same centered position, width, and height while switching tabs; sparse tabs do not shrink or move the frame.
- **Appearance** controls a persistent 80%–160% interface scale. Ctrl/Cmd + wheel changes the same setting outside the score; over the score it changes score zoom only.
- Interface scaling preserves the visible viewport bounds.
- **About** displays the Chorale name, release (`__APP_VERSION__`), and current runtime environment (Browser or Desktop).
- The modal traps focus, closes with Escape or its close button, and restores focus to its trigger.

## 3. Settings Tabs

### Appearance
- Provides Recital, Studio and Match system themes. Recital offers four hall colors; Studio offers Linen, Sage, Clay and Lavender accents. Each palette is validated and persisted independently, and synchronized across open clients. See [Recital visual foundation](recital-visual-language.md).
- Controls persistent interface scale between `80%` and `160%` in increments of 10%.
- Includes a live percentage indicator and a "Reset to 100%" button.
- Updates the `--interface-zoom` variable and viewport-dependent sizing in real time.

### About
- Bundles the Chorale SVG logo into the application, so opening About does not depend on a later public-path image fetch.
- Displays the Chorale brand logo mark and product vision ("Music score workspace and agent skill").
- Reports the application version (`__APP_VERSION__`).
- Reports the runtime environment (Browser or Desktop).
