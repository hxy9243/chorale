---
title: "Pi Agent Feasibility Result"
description: "Prototype feasibility evaluation, architectural decisions, and package observations for the Pi agent runtime integration"
category: "architecture"
date: 2026-07-29
updated: 2026-08-30
status: "completed"
source_files:
  - electron/ai/sheetAgentRuntime.ts
  - electron/ai/sheetTools.ts
  - electron/ai/agentProfiles.ts
  - electron/ai/connectionStore.ts
  - electron/ai/codexOAuth.ts
  - src/agent/DesktopSheetAgent.ts
  - electron/preload.ts
  - electron/main.ts
test_files:
  - src/agent/__tests__/sheetAgentRuntime.integration.test.ts
  - src/agent/__tests__/DesktopSheetAgent.test.ts
  - src/agent/__tests__/sheetTools.test.ts
  - src/agent/__tests__/providers.test.ts
related_specs:
  - spec/design.md
  - spec/pi-agent-chat.md
  - spec/agent-tools-and-profiles.md
  - spec/settings-and-auth.md
---

# Pi Agent Feasibility Result

Date: 2026-07-29  
Updated: 2026-08-30
Status: Feasibility confirmed; integrated into production codebase

## Decision

Proceed with Pi behind Chorale-owned context, transport, message, and persistence contracts.

The Electron implementation moves Pi, credentials, model discovery, OAuth, and provider traffic into the main process. React receives a narrow preload bridge and typed streaming events. No loopback service and no browser-direct provider request are required.

## Evidence

| Capability | Evidence | Result |
|---|---|---|
| Electron host | Vite-built main and sandboxed preload entry points | Pass |
| Hardened window | Node integration off, context isolation and sandbox on, permissions/popups/navigation denied | Pass |
| Production origin | Renderer served through the privileged `app://chorale` protocol | Pass |
| Narrow IPC | Named bridge methods, sender/origin/argument validation, no raw Electron primitives | Pass |
| Encrypted store | Async `safeStorage`, base64 encrypted payloads, atomic serialized writes | Pass |
| Unavailable encryption | Credential remains memory-only and reports `session-only` | Pass |
| Public redaction | Renderer-facing connection and OAuth completion objects omit secrets | Pass |
| Model discovery | OpenAI, Anthropic, Google Gemini, OpenRouter, and custom adapters normalize live catalogs | Pass with stubbed upstreams |
| Codex model discovery | Pi bundled OpenAI Codex catalog | Pass |
| Real provider transport | Custom OpenAI-compatible endpoint receives authenticated Pi request | Pass with local HTTP upstream |
| Current ABC context | Unsaved ABC revision and file name reach the upstream request | Pass |
| Conversation history | Prior Chorale messages are rebuilt as Pi messages | Pass |
| Streaming | Provider SSE deltas become typed renderer IPC events | Pass |
| Cancellation | Renderer cancellation aborts Pi and closes the upstream request | Pass |
| Credential isolation | Integration response and events contain no credential | Pass |
| Conversation persistence | Per-file messages and snapshots use full-fidelity IndexedDB plus a compact local-storage mirror | Pass |
| Provider provenance | Assistant messages store connection, provider kind, and model ID | Pass |
| Browser fallback | Provider setup and sending disabled with desktop-required copy | Pass |
| Codex device OAuth adapter | Device URL/code/progress/cancel/persist/refresh path implemented | Automated live-login coverage pending |
| Passage analysis, annotation, and drafting tools | Immutable score reads plus reviewable annotation and score-change proposals | Pass |
| Credentialed external provider | Requires a user-supplied API key | Not run in repository tests |
| Live Codex subscription response | Requires an available ChatGPT subscription login | Not run in repository tests |

## Package observations

- `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` remain behind Chorale’s `SheetAgentRequest`, `AIEvent`, and persisted-chat types.
- Pi’s built-in providers drive all built-in transports. Custom connections use Pi’s OpenAI-completions implementation.
- Pi’s `CredentialStore` contract is adapted to one encrypted Chorale connection at a time, preserving refresh locking.
- The faux provider remains only as explicit test infrastructure. Production chat has no silent faux fallback.

## Completed and remaining production gates

1. Passage analysis loop (Milestone 1) and annotation proposal loop (Milestone 2) delivered to `main`.
2. Complete a credentialed OpenAI, Anthropic, Gemini, or OpenRouter model refresh and grounded response on a developer machine.
3. Complete OpenAI Codex device login, restart persistence, refresh, logout, and one response with a subscription-enabled account.
4. Add installer packaging, signing, publishing, and auto-update work before distributing the desktop app.
