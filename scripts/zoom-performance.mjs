import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const flagValue = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const projectDirectory = path.resolve(
  flagValue('--app-dir') ?? path.resolve(import.meta.dirname, '..'),
);
const electronBinary = path.join(
  projectDirectory,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
const mainEntry = path.join(projectDirectory, 'dist-electron', 'main.js');
const scoreFixture = path.join(projectDirectory, 'src/test/fixtures/abc/mozart_10.abc');
const interfaceZoom = Number(flagValue('--interface-zoom') ?? 100);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

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
      const target = targets.find((candidate) => candidate.url === 'app://chorale/index.html');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Electron has not opened its debugging socket yet.
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
    const deadline = Date.now() + 8_000;
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
    throw new Error('Electron renderer did not finish committing its navigation.');
  };
  return { socket, call, evaluate };
};

const waitForScore = (minimumMeasures, extraCondition = 'true') => `(async () => {
  const deadline = Date.now() + 15000;
  let lastState = null;
  while (Date.now() < deadline) {
    const measures = document.querySelectorAll('.abcjs-measure-hit-area').length;
    lastState = {
      measures,
      activeFile: document.querySelector('.file-item.active')?.textContent,
      error: document.querySelector('[role="alert"]')?.textContent,
    };
    if (measures >= ${minimumMeasures} && (${extraCondition})) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        measures,
        svgNodes: document.querySelectorAll('#paper svg *').length,
        zoom: Number(document.querySelector('.sheet-zoom-wrapper')?.dataset.scoreZoom),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the benchmark score: ' + JSON.stringify(lastState));
})()`;

const seedAnnotations = `(async () => {
  const activeFileId = localStorage.getItem('chorale.workspace.activeFileId');
  if (!activeFileId) throw new Error('No active benchmark document.');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('chorale_db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const documents = await new Promise((resolve, reject) => {
    const transaction = database.transaction('chorale_store', 'readonly');
    const request = transaction.objectStore('chorale_store').get('chorale.workspace.documents');
    request.onsuccess = () => resolve(request.result?.value ?? []);
    request.onerror = () => reject(request.error);
  });
  const documentIndex = documents.findIndex(({ id }) => id === activeFileId);
  if (documentIndex < 0) throw new Error('Active benchmark document was not persisted.');
  const timestamp = new Date().toISOString();
  documents[documentIndex] = {
    ...documents[documentIndex],
    annotations: [{
      id: 'zoom-benchmark-chord-1',
      kind: 'chord',
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'C',
      romanNumeral: 'I',
      label: 'Opening tonic',
      body: 'Benchmark chord annotation.',
      source: 'assistant',
      createdAt: timestamp,
      updatedAt: timestamp,
    }, {
      id: 'zoom-benchmark-chord-8',
      kind: 'chord',
      span: { startMeasure: 8, endMeasure: 8 },
      position: { measure: 8, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'G7',
      romanNumeral: 'V7',
      label: 'Dominant',
      body: 'Benchmark chord annotation.',
      source: 'assistant',
      createdAt: timestamp,
      updatedAt: timestamp,
    }, {
      id: 'zoom-benchmark-range',
      kind: 'explanation',
      span: { startMeasure: 1, endMeasure: 16 },
      label: 'Opening section',
      body: 'Benchmark range annotation.',
      source: 'assistant',
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  };
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('chorale_store', 'readwrite');
    transaction.objectStore('chorale_store').put({
      key: 'chorale.workspace.documents',
      value: documents,
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return true;
})()`;

const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'chorale-zoom-benchmark-'));
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
  let electronOutput = '';
  child.stdout.on('data', (chunk) => { electronOutput += String(chunk); });
  child.stderr.on('data', (chunk) => { electronOutput += String(chunk); });

  const target = await waitForTarget(port);
  const cdp = await connectCDP(target.webSocketDebuggerUrl);
  try {
    await cdp.evaluate(waitForScore(3));
    await cdp.call('DOM.enable');
    const documentNode = await cdp.call('DOM.getDocument');
    const fileInput = await cdp.call('DOM.querySelector', {
      nodeId: documentNode.root.nodeId,
      selector: 'input[type="file"]',
    });
    if (!fileInput.nodeId) throw new Error('Could not find the score import input.');
    await cdp.call('DOM.setFileInputFiles', {
      nodeId: fileInput.nodeId,
      files: [scoreFixture],
    });
    const scoreState = await cdp.evaluate(waitForScore(100));
    await cdp.evaluate(`(async () => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (document.querySelector('.score-status-item.save')?.textContent === 'Auto-saved') return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('Benchmark score was not auto-saved.');
    })()`);
    await cdp.evaluate(seedAnnotations);
    await cdp.evaluate(`(() => {
      localStorage.setItem('chorale.workspace.interfaceZoom', ${JSON.stringify(String(interfaceZoom))});
      return true;
    })()`);
    await cdp.call('Page.enable');
    await cdp.call('Page.reload', { ignoreCache: true });
    await cdp.evaluate(waitForScore(
      100,
      `document.querySelectorAll('.annotation-overlay-node').length >= 2`,
    ));
    await cdp.call('Performance.enable');

    const readMetrics = async () => Object.fromEntries(
      (await cdp.call('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
    );
    const sampleZoom = async (direction) => {
      const before = await readMetrics();
      const sample = await cdp.evaluate(`(async () => {
        const direction = ${JSON.stringify(direction)};
        const button = document.querySelector('button[title="Zoom ' + direction + '"]');
        const scene = document.querySelector('.sheet-zoom-wrapper');
        if (!button || !scene) throw new Error('Zoom controls are unavailable.');
        const startingZoom = Number(scene.dataset.scoreZoom);
        const targetZoom = startingZoom + (direction === 'in' ? 10 : -10);
        const longTasks = [];
        const observer = new PerformanceObserver((list) => {
          longTasks.push(...list.getEntries().map(({ duration }) => duration));
        });
        try { observer.observe({ type: 'longtask' }); } catch {}
        let frameCount = 0;
        let maxFrameGap = 0;
        let previousFrame = performance.now();
        let stopped = false;
        const watchFrame = () => {
          const now = performance.now();
          maxFrameGap = Math.max(maxFrameGap, now - previousFrame);
          previousFrame = now;
          frameCount += 1;
          if (!stopped) requestAnimationFrame(watchFrame);
        };
        requestAnimationFrame(watchFrame);
        const startedAt = performance.now();
        button.click();
        while (Number(scene.dataset.scoreZoom) !== targetZoom) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => setTimeout(resolve, 80));
        stopped = true;
        observer.disconnect();
        return {
          direction,
          startingZoom,
          targetZoom,
          elapsedMs: performance.now() - startedAt,
          frameCount,
          maxFrameGapMs: maxFrameGap,
          longTasksMs: longTasks,
          sameSvg: window.__benchmarkSvg
            ? window.__benchmarkSvg === document.querySelector('#paper svg')
            : (window.__benchmarkSvg = document.querySelector('#paper svg'), true),
        };
      })()`);
      const after = await readMetrics();
      for (const name of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']) {
        sample[`${name}Ms`] = Math.max(0, (after[name] - before[name]) * 1000);
      }
      return sample;
    };

    await sampleZoom('in');
    await sampleZoom('out');
    const samples = [];
    for (let index = 0; index < 10; index += 1) samples.push(await sampleZoom('in'));
    for (let index = 0; index < 10; index += 1) samples.push(await sampleZoom('out'));
    const combinedRendering = samples.map(
      (sample) => sample.LayoutDurationMs + sample.RecalcStyleDurationMs,
    );
    const summary = {
      medianFrameGapMs: median(samples.map(({ maxFrameGapMs }) => maxFrameGapMs)),
      maxFrameGapMs: Math.max(...samples.map(({ maxFrameGapMs }) => maxFrameGapMs)),
      medianRenderingMs: median(combinedRendering),
      meanRenderingMs: combinedRendering.reduce((sum, value) => sum + value, 0) / combinedRendering.length,
      longTasksAtLeast50Ms: samples.flatMap(({ longTasksMs }) => longTasksMs)
        .filter((duration) => duration >= 50).length,
      stableSvg: samples.every(({ sameSvg }) => sameSvg),
    };
    const report = {
      timestamp: new Date().toISOString(),
      appDirectory: projectDirectory,
      zoomStyle: await cdp.evaluate(`({
        transform: document.querySelector('.sheet-zoom-wrapper')?.style.transform || '',
        zoom: document.querySelector('.sheet-zoom-wrapper')?.style.zoom || '',
      })`),
      fixture: path.relative(projectDirectory, scoreFixture),
      interfaceZoom,
      score: scoreState,
      summary,
      samples,
    };

    const baselinePath = flagValue('--baseline');
    if (baselinePath) {
      const baseline = JSON.parse(await readFile(path.resolve(baselinePath), 'utf8'));
      report.comparison = {
        renderingReduction: baseline.summary.meanRenderingMs > 0
          ? 1 - summary.meanRenderingMs / baseline.summary.meanRenderingMs
          : null,
        baseline: baseline.summary,
      };
    }
    const failures = [];
    if (summary.medianFrameGapMs > 34) {
      failures.push(`median frame gap ${summary.medianFrameGapMs.toFixed(1)}ms exceeds 34ms`);
    }
    if (summary.longTasksAtLeast50Ms > 0) {
      failures.push(`${summary.longTasksAtLeast50Ms} zoom-attributable long task(s) reached 50ms`);
    }
    if (!summary.stableSvg) failures.push('abcjs replaced the score SVG during zoom');
    if (report.comparison?.renderingReduction !== null
      && report.comparison?.renderingReduction < 0.6) {
      failures.push(
        `rendering-time reduction ${(report.comparison.renderingReduction * 100).toFixed(1)}% is below 60%`,
      );
    }
    report.failures = failures;

    const outputPath = flagValue('--output');
    if (outputPath) {
      const resolvedOutput = path.resolve(outputPath);
      await mkdir(path.dirname(resolvedOutput), { recursive: true });
      await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify(report, null, 2));
    if (hasFlag('--assert') && failures.length > 0) process.exitCode = 1;
  } finally {
    cdp.socket.close();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  child?.kill('SIGTERM');
  await delay(300);
  if (child && child.exitCode === null) child.kill('SIGKILL');
  await rm(profileDirectory, { recursive: true, force: true });
}
