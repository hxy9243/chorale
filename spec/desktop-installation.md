---
title: Desktop installation and client connections
status: implemented
date: 2026-10-23
source_files:
  - package.json
  - server/cli.mjs
  - server/desktop.mjs
  - server/desktop-lifecycle.mjs
  - server/electron-sandbox.mjs
  - server/client-setup.mjs
  - server/api_server.mjs
  - electron/clientSetup.ts
  - electron/main.ts
test_files:
  - test/cli-runtime.node.mjs
  - test/client-setup.node.mjs
  - test/http-mcp.node.mjs
  - test/install.smoke.mjs
  - test/install-git.smoke.mjs
  - test/electron-sandbox.node.mjs
  - test/desktop-launch.node.mjs
  - test/desktop-detach.smoke.mjs
  - src/agent/__tests__/clientSetup.test.ts
related_specs:
  - spec/desktop-chat-restoration.md
  - spec/codex-plugin.md
---

# Desktop installation and client connections

## Install and launch

An npm global install from the Git repository prepares both the browser and
Electron main/preload bundles. The installed production package includes those
bundles and Electron as a runtime dependency. No Vite server or development
dependencies are needed at launch. A local npm install exposes the command via
`npx chorale`; use `npm install -g github:hxy9243/chorale` for a bare `chorale`
command. Respect npm's Git/lifecycle policy and document explicit package-scoped
opt-ins where required, rather than changing global npm configuration.

`chorale` and `chorale start` start/reuse the authoritative loopback daemon,
then launch/focus the Electron workspace. By default Electron runs detached from
the terminal, with no inherited terminal streams. The CLI waits for the desktop's
window-load readiness message, then disconnects its startup IPC channel, releases
the child process and returns. Closing the terminal must leave the app running.
Desktop output is appended to `desktop.log` in `CHORALE_HOME` (default
`~/.chorale`). Early process failures retain actionable diagnostics and a nonzero
CLI status; startup without a readiness message times out after 30 seconds.
`chorale --debug` and `chorale start --debug` keep Electron attached, stream its
logs to the terminal, forward termination signals, and return its exit status.
The CLI consumes `--debug` before the `--` separator; arguments after `--` are
passed unchanged to Electron. The development launcher remains attached.
Keep the existing single-instance behavior: a repeat launch focuses the existing
window and returns successfully. Closing the app leaves the daemon available for other MCP clients.
`chorale --browser` opens the browser workspace; `chorale serve` and the existing
`--serve` run the daemon in the foreground. Keep status, stop, upgrade, music21
setup, `chorale mcp`, and `--stdio` available. Stdio startup must never launch a
GUI, prompt, or emit ordinary application messages on stdout. Missing desktop
assets and Linux sandbox failures must produce actionable errors and nonzero
exit status. Production sandboxing stays enabled by default.

On Linux, installation and Electron builds check the installed Electron
`chrome-sandbox` helper and configure root ownership and mode `4755` when needed.
This step is idempotent and runs `chown` before `chmod` because changing ownership
can clear the setuid bit. It uses sudo when not already root, with a password
prompt only when a terminal is available. Unattended installs use noninteractive
sudo; if elevation is unavailable, installation/build still succeeds and prints
actionable setup instructions. `npm run setup:electron-sandbox` retries explicitly
and fails if the helper cannot be configured. Other platforms skip this step.
The installed package includes the setup script; no dev dependencies are needed.

## HTTP MCP

Expose the existing tools and shared score/view state through Streamable HTTP
at `http://127.0.0.1:1685/mcp`, alongside the existing REST, SSE `/sse` and stdio
interfaces. HTTP sessions must not create independent score libraries. Retain
origin restrictions, bounded request bodies and revision guards. Requests use a
stateless transport per POST; GET and DELETE can return 405.

Desktop document saves include the revisions of the documents the client read.
The daemon rejects stale existing-document saves and preserves scores created by
other clients that the saving desktop has not seen. Omitting an unseen score
from an autosave must never delete it. Explicit whole-workspace replacement and
legacy clients retain their existing APIs.

## Optional client setup

The first desktop launch offers optional client setup; it can be reopened from
the application menu. `chorale setup mcp [client]` offers the same capability in
the terminal. Installation itself never modifies another application's config.
Always show the target application, destination and proposed Chorale connection
before asking for explicit confirmation. Declining, noninteractive input and
invalid/existing malformed config must never write anything. Preserve other
servers/settings, back up changed JSON files with private permissions, reject
concurrent changes, and make repeated setup idempotent.

Support Claude Desktop and Antigravity JSON configuration, and the documented
Claude Code/Codex registration commands when those CLIs are available. Register
an absolute Node/Chorale stdio command so clients can start the same shared
daemon even when the GUI is closed, without relying on a GUI application's PATH.

ChatGPT's documented connector flow needs a reachable HTTPS MCP URL and account
confirmation. Provide clear manual guidance and the local endpoint; do not
pretend a local config file connects ChatGPT, or expose the user's score service
to the internet automatically.

## Acceptance

- Install a clean Git-source snapshot into a temporary global prefix, run its
  real `chorale` command and connect an SDK client to its HTTP MCP endpoint.
- The installed artifact contains the desktop bundles and runtime dependencies.
- Installed stdio remains headless and reads/writes the same score store.
- Existing browser/SSE consumers and the Electron proposal smoke still pass.
- Client setup tests use temporary homes and fake CLIs; actual user client
  configuration is untouched during implementation/verification.
