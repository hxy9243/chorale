---
name: chorale-install
description: Install, launch, upgrade, and connect the Chorale CLI and its local MCP daemon.
---

# Chorale installation and MCP setup

Chorale uses one local daemon at `http://127.0.0.1:1685`. It owns the browser workspace, persistent score store, and MCP tools.

## Install for development

```bash
npm install
npm run build
npm link
```

For a released package, install `@chorale/cli` globally instead. Both approaches expose the `chorale` command.

## Launch and inspect

```bash
chorale
chorale status
```

`chorale` is idempotent: it starts the daemon in the background only when its health endpoint is unavailable, then opens the browser workspace. Never start a second server or choose a fallback port.

`chorale status` does not launch a daemon. It reports the healthy process and its runtime metadata.

## Codex and other local MCP clients

Register the stdio adapter once:

```bash
codex mcp add chorale -- chorale mcp
```

The adapter ensures the daemon is alive and forwards all tool calls to it. UI state, selection reads, and score mutations must therefore be read from the daemon rather than a separate local store.

For a development checkout without `npm link`, configure the absolute command instead:

```bash
codex mcp add chorale -- node /absolute/path/to/chorale/bin/chorale.mjs mcp
```

## Upgrade

After a package-manager upgrade, run:

```bash
chorale upgrade
```

This stops only the daemon whose PID and port match Chorale's runtime record, starts the new executable, and preserves score data in `~/.chorale/`. A new Codex task is required when the tool catalog changes.
