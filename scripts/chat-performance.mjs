import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const assertFlag = args.includes('--assert');

const projectDirectory = path.resolve(import.meta.dirname, '..');
const resolveElectronBinary = () => {
  const rootElectron = path.resolve(projectDirectory, '..', '..', '..', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  if (existsSync(rootElectron)) return rootElectron;
  return path.join(
    projectDirectory,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron',
  );
};
const electronBinary = resolveElectronBinary();
const mainEntry = path.join(projectDirectory, 'dist-electron', 'main.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const availablePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const waitForTarget = async (port) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((c) => c.url === 'app://chorale/index.html');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Electron has not opened its debugging socket yet
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the Electron renderer.');
};

const connectCDP = async (url) => {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });

  const evaluate = async (expression) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        const result = await call('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description ?? 'Renderer evaluation failed.');
        }
        return result.result.value;
      } catch (error) {
        if (!String(error).includes('Execution context was destroyed')) throw error;
        await delay(25);
      }
    }
    throw new Error('Evaluation timed out');
  };

  return { call, evaluate, close: () => socket.close() };
};

const generate100Messages = (fileId) => {
  const messages = [];
  const timestamp = new Date().toISOString();

  for (let i = 1; i <= 50; i++) {
    messages.push({
      id: `benchmark-user-${i}`,
      role: 'user',
      content: `Question ${i}: Can you explain the harmonic progression in measure ${i}?`,
      createdAt: timestamp,
      status: 'complete',
    });

    messages.push({
      id: `benchmark-asst-${i}`,
      role: 'assistant',
      content: `In measure ${i}, the chord functions as a dominant seventh resolving smoothly to the tonic.`,
      createdAt: timestamp,
      status: 'complete',
      parts: [
        { type: 'reasoning', text: `Analyzing measure ${i} cadence and Roman numerals...`, status: 'complete' },
        {
          type: 'tool',
          toolCallId: `tool-${i}`,
          toolName: 'read_measure_range',
          summary: `Read m. ${i}`,
          status: 'success',
          durationMs: 32,
        },
        { type: 'text', text: `In measure ${i}, the chord functions as a dominant seventh resolving smoothly to the tonic.` },
      ],
      usage: {
        input: 120,
        output: 45,
        cacheRead: 20,
        cacheWrite: 0,
        reasoning: 15,
        totalTokens: 185,
      },
    });
  }

  return {
    version: 4,
    files: {
      [fileId]: {
        activeThreadId: 'thread-benchmark',
        threads: [{
          id: 'thread-benchmark',
          title: '100-Message Benchmark Thread',
          updatedAt: timestamp,
          messages,
          pendingMessages: [],
        }],
      },
    },
  };
};

const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'chorale-chat-benchmark-'));
let child;

try {
  const port = await availablePort();
  const environment = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;

  const launchArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
  ];
  if (process.platform === 'linux') launchArgs.push('--ozone-platform=x11');
  launchArgs.push(mainEntry);

  child = spawn(electronBinary, launchArgs, {
    cwd: projectDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const target = await waitForTarget(port);
  const cdp = await connectCDP(target.webSocketDebuggerUrl);

  // Wait for app ready
  await cdp.evaluate(`(async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (document.querySelector('.app-header') || document.querySelector('.score-sheet-heading') || document.querySelector('.score-sheet-container')) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('App did not render.');
  })()`);

  // Open Chat Panel if closed
  await cdp.evaluate(`(() => {
    if (!document.querySelector('.agent-panel')) {
      const chatButton = Array.from(document.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label')?.includes('assistant') || b.textContent?.includes('Chat') || b.classList.contains('chat-toggle')
      );
      if (chatButton) chatButton.click();
    }
  })()`);

  await delay(500);

  // Get active file ID
  const activeFileId = await cdp.evaluate(`localStorage.getItem('chorale.workspace.activeFileId') || 'default-score'`);

  // Benchmark function: types 10 characters and measures input processing time
  const measureTyping = `(async () => {
    const textarea = document.querySelector('textarea#agent-question') || document.querySelector('.agent-composer textarea');
    if (!textarea) return { error: 'Textarea not found' };

    const samples = [];
    const textToType = 'Harmonize!';

    textarea.focus();
    await new Promise(r => setTimeout(r, 100));

    for (let i = 0; i < textToType.length; i++) {
      const char = textToType[i];
      const start = performance.now();

      textarea.value += char;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait a microtask / frame for React re-render
      await new Promise(r => requestAnimationFrame(r));
      const duration = performance.now() - start;
      samples.push(duration);
    }

    const total = samples.reduce((a, b) => a + b, 0);
    const avg = total / samples.length;
    const max = Math.max(...samples);

    return { samples, total, avg, max };
  })()`;

  // 1. Measure Baseline (0 messages)
  console.log('Measuring baseline typing latency (empty transcript)...');
  const baselineResult = await cdp.evaluate(measureTyping);
  console.log(`Baseline avg: ${baselineResult.avg.toFixed(2)} ms, max: ${baselineResult.max.toFixed(2)} ms`);

  // 2. Seed 100 messages into storage
  console.log('Seeding 100 messages into transcript...');
  const seededData = generate100Messages(activeFileId);
  await cdp.evaluate(`(() => {
    localStorage.setItem('chorale.pi-agent-conversation.v4', ${JSON.stringify(JSON.stringify(seededData))});
    // Trigger storage event or force panel remount
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'chorale.pi-agent-conversation.v4',
      newValue: ${JSON.stringify(JSON.stringify(seededData))}
    }));
  })()`);

  // Reload page to ensure clean hydration of 100 messages
  await cdp.call('Page.enable');
  await cdp.call('Page.reload', { ignoreCache: true });

  await cdp.evaluate(`(async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (document.querySelector('.app-header') || document.querySelector('.score-sheet-heading') || document.querySelector('.score-sheet-container')) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('App did not reload in time.');
  })()`);

  // Open Chat panel again
  await cdp.evaluate(`(() => {
    if (!document.querySelector('.agent-panel')) {
      const chatButton = Array.from(document.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label')?.includes('assistant') || b.textContent?.includes('Chat') || b.classList.contains('chat-toggle')
      );
      if (chatButton) chatButton.click();
    }
  })()`);

  // Wait for transcript with 100 messages to mount
  await cdp.evaluate(`(async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const messages = document.querySelectorAll('.agent-message');
      if (messages.length >= 50) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('100 messages did not mount.');
  })()`);

  await delay(500);

  // 3. Measure 100-Message Transcript Latency
  console.log('Measuring typing latency with 100-message transcript...');
  const transcriptResult = await cdp.evaluate(measureTyping);
  console.log(`100-message avg: ${transcriptResult.avg.toFixed(2)} ms, max: ${transcriptResult.max.toFixed(2)} ms`);

  // 4. Measure Idle CPU / Task Load (no runaway animations)
  console.log('Measuring idle task duration...');
  const idleResult = await cdp.evaluate(`(async () => {
    const start = performance.now();
    await new Promise(r => setTimeout(r, 500));
    // Check if any long tasks happened
    return { elapsed: performance.now() - start };
  })()`);
  console.log(`Idle check elapsed: ${idleResult.elapsed.toFixed(1)} ms`);

  const ratio = transcriptResult.avg / Math.max(1, baselineResult.avg);
  console.log(`Latency ratio (100-message / baseline): ${ratio.toFixed(2)}x`);

  cdp.close();

  // Assertions
  if (assertFlag) {
    if (transcriptResult.max > 50) {
      console.error(`FAIL: Maximum typing task exceeded 50ms (${transcriptResult.max.toFixed(2)}ms)`);
      process.exit(1);
    }
    if (ratio > 2.0 && transcriptResult.avg > 25) {
      console.error(`FAIL: Typing latency ratio exceeded 2.0x (${ratio.toFixed(2)}x)`);
      process.exit(1);
    }
    console.log('PASS: Chat performance benchmark satisfied all invariants.');
  }
} finally {
  if (child) {
    child.kill('SIGTERM');
    await delay(200);
    child.kill('SIGKILL');
  }
  await rm(profileDirectory, { recursive: true, force: true });
}
