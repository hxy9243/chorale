# Pi Agent Feasibility Result

Date: 2026-07-29
Implementation branch: `feat/spec-annotations-agent`

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
| Model discovery | OpenAI, Anthropic, Gemini, OpenRouter, and custom adapters normalize live catalogs | Pass with stubbed upstreams |
| Codex model discovery | Pi bundled OpenAI Codex catalog | Pass |
| Real provider transport | Custom OpenAI-compatible endpoint receives authenticated Pi request | Pass with local HTTP upstream |
| Current ABC context | Unsaved ABC revision and file name reach the upstream request | Pass |
| Conversation history | Prior Chorale messages are rebuilt as Pi messages | Pass |
| Streaming | Provider SSE deltas become typed renderer IPC events | Pass |
| Cancellation | Renderer cancellation aborts Pi and closes the upstream request | Pass |
| Credential isolation | Integration response and events contain no credential | Pass |
| Conversation persistence | Per-file messages and snapshots remain in renderer local storage | Pass |
| Provider provenance | Assistant messages store connection, provider kind, and model ID | Pass |
| Browser fallback | Provider setup and sending disabled with desktop-required copy | Pass |
| Codex device OAuth adapter | Device URL/code/progress/cancel/persist/refresh path implemented | Automated live-login coverage pending |
| Credentialed external provider | Requires a user-supplied API key | Not run in repository tests |
| Live Codex subscription response | Requires an available ChatGPT subscription login | Not run in repository tests |

## Package observations

- `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` remain behind Chorale’s `SheetAgentRequest`, `AIEvent`, and persisted-chat types.
- Pi’s built-in providers drive all five built-in transports. Custom connections use Pi’s OpenAI-completions implementation.
- Pi’s `CredentialStore` contract is adapted to one encrypted Chorale connection at a time, preserving refresh locking.
- The faux provider remains only as explicit test infrastructure. Production chat has no silent faux fallback.

## Remaining production gates

1. Complete a credentialed OpenAI, Anthropic, Gemini, or OpenRouter model refresh and grounded response on a developer machine.
2. Complete OpenAI Codex device login, restart persistence, refresh, logout, and one response with a subscription-enabled account.
3. Add installer packaging, signing, publishing, and auto-update work before distributing the desktop app.
4. Keep annotation tools, mutation review cards, and score-edit tools as a separate scoped implementation.
