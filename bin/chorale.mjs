#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp/index.mjs';
import { startServer } from '../mcp/server.mjs';
import { LocalDocumentStore } from '../mcp/store.mjs';
import { openBrowser } from '../mcp/tools/workspace.mjs';
import { ViewSnapshotStore } from '../mcp/views.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 1685;
const HEALTH_URL = `http://127.0.0.1:${PORT}/v1/health`;

const isServerRunning = async () => {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.service === 'chorale-service';
  } catch {
    return false;
  }
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const spawnBackgroundServer = async () => {
  const child = spawn(process.execPath, [__filename, '--serve'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Wait for health endpoint
  for (let i = 0; i < 40; i += 1) {
    if (await isServerRunning()) return true;
    await delay(50);
  }
  return false;
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  // 1. MCP stdio mode (for CLI MCP clients like Claude, Codex, Antigravity)
  if (command === 'mcp' || args.includes('--stdio')) {
    const alreadyUp = await isServerRunning();
    if (!alreadyUp) {
      await spawnBackgroundServer();
    }
    const store = new LocalDocumentStore();
    const views = new ViewSnapshotStore();
    const { server } = createMcpServer(store, views, PORT);
    await server.connect(new StdioServerTransport());
    return;
  }

  // 2. Internal flag for detached server background execution
  if (args.includes('--serve')) {
    const running = await isServerRunning();
    if (running) process.exit(0);
    await startServer({ port: PORT });
    return;
  }

  // 3. Status check
  if (command === 'status') {
    const running = await isServerRunning();
    if (running) {
      console.log(`Chorale service is active on http://127.0.0.1:${PORT}`);
      process.exit(0);
    } else {
      console.log(`Chorale service is not running.`);
      process.exit(1);
    }
  }

  // 4. Default: 'start' or running `chorale`
  const running = await isServerRunning();
  if (running) {
    console.log(`Chorale server is already running on http://127.0.0.1:${PORT} (no-op).`);
    console.log(`Opening workspace in browser...`);
    await openBrowser(`http://127.0.0.1:${PORT}`);
    process.exit(0);
  }

  if (args.includes('--daemon') || args.includes('-d')) {
    console.log(`Starting Chorale service on http://127.0.0.1:${PORT} in background...`);
    const started = await spawnBackgroundServer();
    if (started) {
      console.log(`Chorale service started successfully.`);
      await openBrowser(`http://127.0.0.1:${PORT}`);
      process.exit(0);
    } else {
      console.error(`Failed to start Chorale background service.`);
      process.exit(1);
    }
  }

  // Foreground start
  console.log(`🎼 Starting Chorale Music Workspace on http://127.0.0.1:${PORT}...`);
  await startServer({ port: PORT });
  console.log(`\n✅ Chorale is live!`);
  console.log(`🌐 Web UI & MCP SSE: http://127.0.0.1:${PORT}`);
  console.log(`📁 Filesystem Storage: ~/.chorale/`);
  console.log(`⚡ Press Ctrl+C to stop the server.\n`);

  await openBrowser(`http://127.0.0.1:${PORT}`);
};

main().catch((err) => {
  console.error('Chorale CLI error:', err);
  process.exit(1);
});
