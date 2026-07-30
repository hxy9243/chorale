# Settings & AI Provider Authentication Spec

Date: 2026-07-29
Status: Electron desktop implementation

## 1. Goal

Configure named AI provider connections without exposing durable credentials to React. Electron desktop is the authoritative host for AI authentication, model discovery, and provider requests.

The ordinary browser build remains a score editor. It displays “AI providers require the Chorale desktop app,” disables provider setup, and disables chat sending.

## 2. Access and presentation

- A gear button in the top-right workspace header opens the accessible **Settings** modal.
- Settings uses **API providers**, **Appearance**, and **About** tabs.
- Appearance controls a persistent 80%–160% interface scale. Ctrl/Cmd + wheel changes the same setting.
- About displays the Chorale name, release, and current desktop/browser runtime.
- The modal traps focus, closes with Escape or its close button, and restores focus to its trigger.
- Existing connections show provider kind, validation status, persistence mode, model count, and the age of the cached model list.
- Users can edit, refresh, delete, or log out connections.
- API-key edits use masked replacement: leaving the secret blank keeps the existing encrypted value.

Score/audio and workspace-storage settings remain future additions.

## 3. Supported connections

Multiple named connections are allowed, including multiple connections for the same provider.

| Kind | Authentication | Model source |
|---|---|---|
| OpenAI Codex | ChatGPT subscription device-code OAuth | Pi bundled Codex catalog |
| OpenAI API | API key | `GET https://api.openai.com/v1/models` |
| Claude API | API key | `GET https://api.anthropic.com/v1/models` |
| Gemini API | API key | `GET https://generativelanguage.googleapis.com/v1beta/models` |
| OpenRouter | API key | `GET https://openrouter.ai/api/v1/models` |
| Custom | API key and optional secret headers | OpenAI-compatible `GET {baseUrl}/models` |

Custom base URLs must use HTTPS. HTTP is accepted only for loopback hosts. URLs containing embedded credentials and the `file:` scheme are rejected. Chorale also rejects custom attempts to override authorization, host, content-length, connection, proxy authorization, transfer encoding, and other managed authentication headers.

The last successful normalized model list remains cached if a later refresh fails. The UI reports its age. Deleting the connection used by the global selection clears that selection.

## 4. Credential persistence and security boundary

Provider state is stored under:

```text
app.getPath('userData')/chorale-data/ai-connections.v1.json
```

- API keys, custom secret headers, OAuth access tokens, and refresh tokens are serialized only inside an encrypted base64 payload.
- Encryption uses Electron asynchronous `safeStorage`.
- Writes are serialized and use temporary-file replacement. The data directory and file use owner-only permissions where supported.
- Public connection objects are redacted and contain no credential fields.
- If encryption is unavailable, or Linux selects the `basic_text` backend, new credentials stay in memory for the current process and the public connection reports `persistence: 'session-only'`.
- Chorale never falls back to renderer `localStorage` for a secret.
- Existing encrypted metadata may remain on disk while its credential is unavailable; the connection reports `status: 'unavailable'`.

Score documents, conversations, editor state, and workspace layout remain non-secret renderer `localStorage` data. Electron’s persistent default session stores that profile data, and the main process flushes DOM storage during clean shutdown. Browser profile data is not imported automatically.

## 5. OpenAI Codex OAuth

OpenAI Codex is distinct from the OpenAI API-key provider.

- The Electron main process runs Pi’s OpenAI Codex device-code flow.
- Only the device-code method is accepted.
- Verification URL, user code, progress, completion, cancellation, and errors are relayed as request-scoped OAuth events.
- The main process opens only validated HTTPS OpenAI authentication hosts.
- OAuth tokens never enter the renderer event payload. On completion the renderer receives only the redacted connection.
- Pi’s credential-store adapter serializes refresh operations and persists rotated OAuth credentials through the encrypted connection store.
- Logout deletes that Codex connection and invalidates the global selection when applicable.

## 6. Renderer contract

The preload exposes the typed `ChoraleAIBridge` defined in `src/agent/aiTypes.ts`. It provides only connection, model, selection, OAuth, and chat operations.

It does not expose:

- `ipcRenderer`
- filesystem or shell primitives
- arbitrary channel names
- decrypted credentials

The main process validates sender window, sender origin, argument count, IDs, provider kinds, headers, selection values, chat history shape, and payload size before handling an IPC request.
