# Installing & Configuring Chorale

Chorale is a local music workspace and MCP server. One loopback daemon owns the browser UI, score store, and MCP tools at `http://127.0.0.1:1685`.

## Development installation

Chorale requires Node.js 20 or newer.

```bash
git clone https://github.com/hxy9243/chorale.git
cd chorale
npm install
npm run build
npm test
npm link
```

`npm link` exposes the development checkout as the `chorale` command. The release package will use the same command after `npm install --global @chorale/cli`.

## Start and manage the service

```bash
chorale
```

The default command is idempotent: it opens the browser workspace if a healthy daemon already owns port 1685; otherwise it starts that daemon in the background, waits for health, and opens the workspace.

```bash
chorale status
chorale stop
```

`status` never starts a service. `stop` only terminates a process when its PID and port match Chorale's recorded runtime metadata in `~/.chorale/runtime.json`.

For frontend development, run `npm run dev`; Vite serves the UI on port 5173 and communicates with the daemon on 1685.

## Codex setup

Register the local stdio adapter once:

```bash
codex mcp add chorale -- chorale mcp
```

`chorale mcp` ensures the daemon is available, then forwards every tool request to it. The browser UI and Codex share documents, revisions, and live selection state.

Before the CLI is published, use the checked-out executable instead:

```bash
codex mcp add chorale -- node /absolute/path/to/chorale/bin/chorale.mjs mcp
```

## Other MCP clients

Use the same stdio command in any local MCP client:

```json
{
  "mcpServers": {
    "chorale": {
      "command": "chorale",
      "args": ["mcp"]
    }
  }
}
```

Clients that independently manage the daemon can instead connect to MCP SSE at `http://127.0.0.1:1685/sse`.

## Upgrade

After installing a newer CLI package, restart only the verified daemon:

```bash
npm update --global @chorale/cli
chorale upgrade
```

The MCP registration remains unchanged. `chorale upgrade` preserves `~/.chorale/` score data; start a new Codex task to use a changed tool catalog.

## Verify

```bash
chorale status
curl -s http://127.0.0.1:1685/v1/health
```

The health response contains the service name, version, active port, PID, and `status: "ok"`.
