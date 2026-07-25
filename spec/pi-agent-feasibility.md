# Pi Agent Feasibility Result

Date: 2026-07-23  
Prototype: `spike/pi-sheet-chat`

## Decision

Proceed with Pi as the current leading agent-runtime candidate, but keep it behind Chorale-owned context, transport, message, and persistence contracts.

The prototype proves the part needed for product discovery: Pi's low-level `Agent` can run in the Vite application, consume the current unsaved ABC context, stream a deterministic response, reconstruct prior conversation turns, and abort an active stream. It does not yet prove production provider credentials, ChatGPT subscription OAuth, or Electron main-process integration.

## What was tested

| Capability | Evidence | Result |
|---|---|---|
| Pi agent loop | `PiSheetAgent` constructs `@earendil-works/pi-agent-core` `Agent` | Pass |
| Credential-free mock | Pi AI `createFauxCore()` provides the stream function/model | Pass |
| Current ABC context | Per-turn `MusicContextSnapshot` is embedded in the Pi user message | Pass |
| Unsaved edits | Panel captures the current React `abcCode`, not the original file | Pass |
| Conversation history | Chorale messages are rebuilt as Pi user/assistant history | Pass |
| Reload persistence | Versioned transcript and per-turn snapshots use local storage | Pass |
| Streaming UI | Pi `text_delta` events update the assistant message | Pass |
| Cancellation | `AbortSignal` calls `Agent.abort()` and late deltas are ignored | Pass |
| Browser production bundle | `tsc -b && vite build` | Pass |
| Initial-load isolation | Pi adapter is dynamically imported when the first message sends | Pass |
| Electron host | Architecture specified, harness not built in this prototype | Not tested |
| API-key provider | Mock deliberately avoids credentials | Not tested |
| ChatGPT subscription OAuth | Optional future spike | Not tested |

## Package observations

- Tested `@earendil-works/pi-agent-core` `0.81.1` and `@earendil-works/pi-ai` `0.81.1`.
- Both packages declare Node `>=22.19.0`; the development runtime was Node `24.15.0`.
- Vite can bundle the low-level agent path for the browser.
- Pi is substantial enough to warrant lazy loading. The prototype keeps it out of Chorale's initial application chunk.
- Pi's faux provider is useful production-like test infrastructure: responses pass through the real agent lifecycle without a network request.

## Production gates

Before product adoption:

1. Run Pi in an Electron main-process harness with a narrow, validated preload API.
2. Add one real API-key provider behind a same-origin web service and test streaming/cancellation.
3. Measure and budget the lazy Pi chunk.
4. Validate provider/model configuration and stable error mapping.
5. Separately evaluate ChatGPT subscription OAuth, including PKCE/state, callback ownership, secure refresh-token storage, logout, and failure recovery.
6. Pin dependency versions and add browser/Electron build checks before upgrades.

If either the real web transport or Electron host requires exposing durable credentials in the renderer, switch the implementation behind `SheetAgentClient` rather than weakening the security boundary.
