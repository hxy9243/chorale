import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectDirectory = path.resolve(import.meta.dirname, '..');
const electronBinary = path.join(
  projectDirectory,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);
const mainEntry = path.join(projectDirectory, 'dist-electron', 'main.js');
const launchedChildren = new Set();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((candidate) => candidate.url === 'app://chorale/index.html');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Electron has not opened its debugging socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
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
    const deadline = Date.now() + 5_000;
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
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error('Electron renderer did not finish committing its navigation.');
  };
  return { socket, call, evaluate };
};

const launch = async (profileDirectory) => {
  const port = await availablePort();
  const environment = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const args = [
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
  ];
  if (process.platform === 'linux') args.push('--ozone-platform=x11');
  args.push(mainEntry);
  const child = spawn(electronBinary, args, {
    cwd: projectDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  launchedChildren.add(child);
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => {
    launchedChildren.delete(child);
    resolve({ code, signal });
  }));
  const target = await waitForTarget(port);
  return { child, output: () => output, exited, target };
};

const closeCleanly = async (runtime, cdp) => {
  try {
    await cdp.evaluate('window.close(); true');
  } catch (error) {
    if (!String(error).includes('Execution context was destroyed')) throw error;
  }
  const result = await Promise.race([
    runtime.exited,
    new Promise((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
  if (result === null) {
    runtime.child.kill('SIGTERM');
    throw new Error('Electron did not exit after its renderer window closed.');
  }
};

const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'chorale-electron-smoke-'));
try {
  const first = await launch(profileDirectory);
  const firstCDP = await connectCDP(first.target.webSocketDebuggerUrl);
  await firstCDP.evaluate(`(async () => {
    const deadline = Date.now() + 12000;
    let lastState = null;
    while (Date.now() < deadline) {
      try {
        const activeFileId = localStorage.getItem('chorale.workspace.activeFileId');
        lastState = {
          activeFileId,
          measureHitAreas: document.querySelectorAll('.abcjs-measure-hit-area').length,
          title: document.querySelector('.score-sheet-heading h1')?.textContent,
          status: document.querySelector('.score-build-status')?.textContent,
        };
        if (activeFileId && document.querySelector('.abcjs-measure-hit-area[data-measure="3"]')) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const persistedFileId = localStorage.getItem('chorale.workspace.activeFileId');
          if (persistedFileId !== activeFileId) continue;
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('chorale_db', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const storedDocuments = await new Promise((resolve, reject) => {
            const transaction = database.transaction('chorale_store', 'readonly');
            const request = transaction.objectStore('chorale_store').get('chorale.workspace.documents');
            request.onsuccess = () => resolve(request.result?.value ?? []);
            request.onerror = () => reject(request.error);
          });
          database.close();
          const sourceRevision = storedDocuments.find(({ id }) => id === activeFileId)?.revision;
          if (!Number.isInteger(sourceRevision)) continue;
          const timestamp = new Date().toISOString();
          localStorage.setItem('chorale.pi-agent-conversation.v3', JSON.stringify({
            version: 3,
            files: {
              [activeFileId]: {
                activeThreadId: 'thread-passage-smoke',
                threads: [{
                id: 'thread-passage-smoke',
                title: 'Passage link smoke',
                updatedAt: timestamp,
                messages: [{
                  id: 'question-single',
                  role: 'user',
                  content: 'What happens in the second measure?',
                  createdAt: timestamp,
                  status: 'complete',
                }, {
                  id: 'answer-single',
                  role: 'assistant',
                  content: 'The answer is grounded in [m. 2](#measure-2).',
                  createdAt: timestamp,
                  status: 'complete',
                  profileRoutes: ['harmony'],
                  toolDisplays: [{
                    toolCallId: 'smoke-single-read',
                    toolName: 'read_measure_range',
                    status: 'success',
                    summary: 'Read 1 measure',
                  }],
                }, {
                  id: 'question-range',
                  role: 'user',
                  content: 'How does this longer passage develop across the wrapped score systems, and where does its harmonic direction change?',
                  createdAt: timestamp,
                  status: 'complete',
                }, {
                  id: 'answer-range',
                  role: 'assistant',
                  content: 'Compare the complete passage in [mm. 1–3](#measure-1-3).',
                  createdAt: timestamp,
                  status: 'complete',
                  profileRoutes: ['form-phrase'],
                  toolDisplays: [{
                    toolCallId: 'smoke-range-read',
                    toolName: 'read_measure_range',
                    status: 'success',
                    summary: 'Read 3 measures',
                  }],
                  proposals: [{
                    id: 'smoke-proposal-accept',
                    runId: 'smoke-analysis-run',
                    documentId: activeFileId,
                    sourceRevision,
                    state: 'proposed',
                    annotation: {
                      id: 'smoke-accepted-annotation',
                      kind: 'explanation',
                      span: { startMeasure: 1, endMeasure: 3 },
                      label: 'Smoke phrase',
                      body: 'The passage develops across three measures.',
                      source: 'assistant',
                      agentProfiles: ['form-phrase'],
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    },
                  }, {
                    id: 'smoke-proposal-reject',
                    runId: 'smoke-analysis-run',
                    documentId: activeFileId,
                    sourceRevision,
                    state: 'proposed',
                    annotation: {
                      id: 'smoke-rejected-annotation',
                      kind: 'voice-leading',
                      span: { startMeasure: 2, endMeasure: 3 },
                      label: 'Reject this line',
                      body: 'This staged callout will be rejected.',
                      source: 'assistant',
                      agentProfiles: ['voice-leading'],
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    },
                  }],
                }],
                }],
              },
            },
          }));
          return true;
        }
      } catch {
        // The app:// navigation can be visible to CDP before its origin is committed.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Score was not ready for passage-link smoke setup: ' + JSON.stringify(lastState));
  })()`);
  await firstCDP.call('Page.enable');
  await firstCDP.call('Page.reload', { ignoreCache: true });
  await firstCDP.evaluate(`(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const activeFileId = localStorage.getItem('chorale.workspace.activeFileId');
      const saveReady = document.querySelector('.score-status-item.save')?.textContent === 'Auto-saved';
      if (activeFileId && saveReady) {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open('chorale_db', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const storedDocuments = await new Promise((resolve, reject) => {
          const transaction = database.transaction('chorale_store', 'readonly');
          const request = transaction.objectStore('chorale_store').get('chorale.workspace.documents');
          request.onsuccess = () => resolve(request.result?.value ?? []);
          request.onerror = () => reject(request.error);
        });
        database.close();
        const sourceRevision = storedDocuments.find(({ id }) => id === activeFileId)?.revision;
        const store = JSON.parse(localStorage.getItem('chorale.pi-agent-conversation.v3') ?? 'null');
        if (Number.isInteger(sourceRevision) && store?.files?.[activeFileId]) {
          for (const thread of store.files[activeFileId].threads) {
            for (const message of thread.messages) {
              for (const proposal of message.proposals ?? []) {
                proposal.documentId = activeFileId;
                proposal.sourceRevision = sourceRevision;
                proposal.state = 'proposed';
              }
            }
          }
          localStorage.setItem('chorale.pi-agent-conversation.v3', JSON.stringify(store));
          return true;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Could not synchronize smoke proposals with the active saved revision.');
  })()`);
  await firstCDP.call('Page.reload', { ignoreCache: true });
  const passageLinkState = await firstCDP.evaluate(`(async () => {
    const waitFor = async (predicate, message) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(message);
    };
    const setFormValue = (element, value) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    try {
      await waitFor(
        () => document.querySelectorAll('.score-reference-link').length === 2
          ? [...document.querySelectorAll('.score-reference-link')]
          : null,
        'Seeded Markdown score links did not render.',
      );
    } catch (error) {
      throw new Error(error.message + ' ' + JSON.stringify({
        activeFileId: localStorage.getItem('chorale.workspace.activeFileId'),
        chatOpen: localStorage.getItem('chorale.workspace.chatOpen'),
        store: localStorage.getItem('chorale.pi-agent-conversation.v3'),
        assistantMessages: document.querySelectorAll('.agent-message.assistant').length,
        panel: Boolean(document.querySelector('.agent-panel')),
      }));
    }
    await waitFor(
      () => document.body.textContent.includes('Synth Ready'),
      'Audio synth was not ready for paused-seek smoke.',
    );
    const playbackStates = [];
    window.addEventListener('chorale-playback-state', (event) => {
      playbackStates.push(Boolean(event.detail?.isPlaying));
    });
    document.querySelectorAll('.score-reference-link')[0].click();
    try {
      await waitFor(
        () => document.querySelector('.active-anchor-badge')?.textContent?.includes('m. 2'),
        'Single-measure link did not select measure 2.',
      );
    } catch (error) {
      throw new Error(error.message + ' ' + JSON.stringify({
        links: [...document.querySelectorAll('.score-reference-link')].map((link) => link.textContent),
        badge: document.querySelector('.active-anchor-badge')?.textContent,
        pressed: [...document.querySelectorAll('.abcjs-measure-hit-area[aria-pressed="true"]')]
          .map((element) => element.getAttribute('data-measure')),
        focused: document.activeElement?.getAttribute('data-measure'),
      }));
    }
    const singleState = {
      selected: document.querySelector('.active-anchor-badge')?.textContent,
      focusedMeasure: document.activeElement?.getAttribute('data-measure'),
      pressed: [...document.querySelectorAll('.abcjs-measure-hit-area[aria-pressed="true"]')]
        .map((element) => element.getAttribute('data-measure')),
      elapsed: document.querySelector('.playback-progress strong')?.textContent,
      progressWidth: document.querySelector('.playback-progress-track span')?.style.width,
      playTitle: document.querySelector('.main-play-buttons button')?.getAttribute('title'),
    };

    document.querySelectorAll('.score-reference-link')[1].click();
    try {
      await waitFor(
        () => document.querySelectorAll('.abcjs-measure-hit-area[aria-pressed="true"]').length === 3,
        'Wrapped range link did not select three measures.',
      );
    } catch (error) {
      throw new Error(error.message + ' ' + JSON.stringify({
        badge: document.querySelector('.active-anchor-badge')?.textContent,
        hitAreas: [...document.querySelectorAll('.abcjs-measure-hit-area')]
          .map((element) => ({
            measure: element.getAttribute('data-measure'),
            pressed: element.getAttribute('aria-pressed'),
          })),
        highlights: [...document.querySelectorAll('.abcjs-measure-highlight')]
          .map((element) => element.getAttribute('data-measure')),
        focused: document.activeElement?.getAttribute('data-measure'),
      }));
    }
    const rangeQuestion = [...document.querySelectorAll('.agent-message.user')].at(-1);
    const lineHeight = Number.parseFloat(getComputedStyle(rangeQuestion).lineHeight);
    const rangeState = {
      selected: document.querySelector('.active-anchor-badge')?.textContent,
      focusedMeasure: document.activeElement?.getAttribute('data-measure'),
      pressed: [...document.querySelectorAll('.abcjs-measure-hit-area[aria-pressed="true"]')]
        .map((element) => element.getAttribute('data-measure')),
      questionWrapped: rangeQuestion.getBoundingClientRect().height > lineHeight * 1.5,
      playTitle: document.querySelector('.main-play-buttons button')?.getAttribute('title'),
    };
    const proposalCards = await waitFor(
      () => document.querySelectorAll('.annotation-proposal-card').length === 2
        ? [...document.querySelectorAll('.annotation-proposal-card')]
        : null,
      'Seeded annotation proposals did not render.',
    );
    const proposalEdit = proposalCards[0].querySelector('button[data-proposal-edit]');
    if (!proposalEdit) {
      throw new Error('First proposal has no Edit action: ' + JSON.stringify(proposalCards.map((card) => ({
        label: card.getAttribute('aria-label'),
        state: card.dataset.state,
        buttons: [...card.querySelectorAll('button')].map((button) => ({
          text: button.textContent,
          disabled: button.disabled,
        })),
      }))));
    }
    proposalEdit.click();
    const proposalEditor = await waitFor(
      () => document.querySelector('.annotation-editor'),
      'Proposal editor did not open.',
    );
    const proposalBody = proposalEditor.querySelector('textarea');
    setFormValue(proposalBody, 'Edited before the atomic smoke apply.');
    proposalEditor.querySelector('button[type="submit"]')?.click();
    await waitFor(
      () => !document.querySelector('.annotation-editor'),
      'Edited proposal did not return to its card.',
    );
    document.querySelector('[aria-label="Reject this line annotation proposal"] button:last-child')?.click();
    await waitFor(
      () => document.querySelector('[aria-label="Reject this line annotation proposal"]')?.dataset.state === 'rejected',
      'Reject did not stage before Apply All.',
    );
    document.querySelector('.annotation-apply-all')?.click();
    await waitFor(
      () => document.querySelector('[aria-label="Smoke phrase annotation proposal"]')?.dataset.state === 'accepted',
      'Apply All did not accept the edited eligible proposal.',
    );
    const acceptedEdit = await waitFor(
      () => document.querySelector('[data-edit-annotation="smoke-accepted-annotation"]'),
      'Accepted range annotation did not render in the annotation rail.',
    );
    acceptedEdit.click();
    const acceptedEditor = await waitFor(
      () => document.querySelector('.annotation-card-editor .annotation-editor'),
      'Clicking the accepted range card did not open its in-place editor.',
    );
    setFormValue(acceptedEditor.querySelector('textarea'), 'Edited and persisted in the rail.');
    acceptedEditor.querySelector('button[type="submit"]')?.click();
    await waitFor(
      () => !document.querySelector('.annotation-card-editor .annotation-editor'),
      'Saving the accepted range annotation did not restore its card.',
    );
    const addManual = await waitFor(
      () => document.querySelector('[data-create-annotation]'),
      'Selected passage did not expose manual annotation creation.',
    );
    const scoreGeometryBeforeChords = [...document.querySelectorAll('#paper > svg')]
      .map((svg) => {
        const rect = svg.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      });
    const createChord = async (label, symbol, roman) => {
      addManual.click();
      const manualEditor = await waitFor(
        () => document.querySelector('.annotation-rail-transient-editor .annotation-editor'),
        'Manual annotation editor did not open in the rail.',
      );
      setFormValue(manualEditor.querySelector('select'), 'chord');
      const fieldFor = (labelText, selector) => [...manualEditor.querySelectorAll('label')]
        .find((labelElement) => labelElement.textContent.trim().startsWith(labelText))
        ?.querySelector(selector);
      const chordFields = await waitFor(
        () => fieldFor('Chord symbol', 'input')
          ? {
              symbol: fieldFor('Chord symbol', 'input'),
              roman: fieldFor('Roman numeral (optional)', 'input'),
              label: fieldFor('Label', 'input'),
              body: fieldFor('Explanation', 'textarea'),
            }
          : null,
        'Chord fields did not appear in the manual rail editor.',
      );
      setFormValue(chordFields.symbol, symbol);
      setFormValue(chordFields.roman, roman);
      setFormValue(chordFields.label, label);
      setFormValue(chordFields.body, 'A directly authored chord annotation.');
      manualEditor.querySelector('button[type="submit"]')?.click();
      await waitFor(
        () => document.querySelector('[aria-label="Edit ' + label + ' annotation"]'),
        'Manual chord annotation did not render above the score.',
      );
      await waitFor(
        () => !document.querySelector('.annotation-rail-transient-editor .annotation-editor'),
        'Manual chord editor did not close after Save.',
      );
    };
    await createChord('Smoke manual', 'Cmaj7', 'I7');
    await createChord('Smoke manual two', 'G7', 'V7');
    await waitFor(
      () => document.querySelector('[aria-label="Edit Smoke manual annotation"]'),
      'Manual chord annotation did not remain in the score overlay.',
    );
    await new Promise((resolve) => setTimeout(resolve, 650));
    const chordBadges = [...document.querySelectorAll('.annotation-overlay-node.chord')];
    const chordBounds = chordBadges.map((badge) => (
      badge.querySelector('.annotation-chord-background')?.getBoundingClientRect()
    ));
    const intersections = chordBounds.flatMap((left, leftIndex) => (
      chordBounds.slice(leftIndex + 1).filter((right) => (
        left && right
        && left.left < right.right
        && left.right > right.left
        && left.top < right.bottom
        && left.bottom > right.top
      )).map(() => leftIndex)
    ));
    const chordBaselinesBySystem = new Map();
    chordBadges.forEach((badge) => {
      const system = badge.closest('.annotation-overlay-system')?.getAttribute('aria-label');
      const baselines = chordBaselinesBySystem.get(system) || new Set();
      baselines.add(badge.dataset.chordBaseline);
      chordBaselinesBySystem.set(system, baselines);
    });
    const scoreGeometryAfterChords = [...document.querySelectorAll('#paper > svg')]
      .map((svg) => {
        const rect = svg.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      });
    const annotationJourney = {
      routes: [...document.querySelectorAll('.agent-profile-route span')].map((node) => node.textContent),
      tools: [...document.querySelectorAll('.agent-tool-row')].map((node) => node.textContent),
      acceptedState: document.querySelector('[aria-label="Smoke phrase annotation proposal"]')?.dataset.state,
      rejectedState: document.querySelector('[aria-label="Reject this line annotation proposal"]')?.dataset.state,
      acceptedRail: Boolean(document.querySelector('[data-edit-annotation="smoke-accepted-annotation"]')),
      acceptedBody: document.querySelector('[data-annotation-kind="explanation"] .annotation-card-body')?.textContent,
      manualOverlay: Boolean(document.querySelector('[aria-label="Edit Smoke manual annotation"]')),
      chordBadgeCount: chordBadges.length,
      chordLaneCount: new Set(chordBadges.map((badge) => badge.dataset.chordLane)).size,
      chordBaselinesAligned: [...chordBaselinesBySystem.values()]
        .every((baselines) => baselines.size === 1),
      chordIntersections: intersections.length,
      scoreGeometryStable: JSON.stringify(scoreGeometryBeforeChords)
        === JSON.stringify(scoreGeometryAfterChords),
    };
    const result = { singleState, rangeState, playbackStates, annotationJourney };
    return result;
  })()`);
  assert(
    passageLinkState.singleState.selected.includes('m. 2')
      && passageLinkState.singleState.focusedMeasure === '2'
      && passageLinkState.singleState.pressed.join(',') === '2',
    `Single-measure Markdown link did not select and focus its target (${JSON.stringify(passageLinkState.singleState)}).`,
  );
  assert(
    passageLinkState.singleState.playTitle === 'Play Piano Synthesizer'
      && passageLinkState.singleState.progressWidth !== '0%'
      && !passageLinkState.playbackStates.includes(true),
    `Single-measure Markdown link did not seek while paused (${JSON.stringify(passageLinkState)}).`,
  );
  assert(
    passageLinkState.rangeState.selected.includes('mm. 1–3')
      && passageLinkState.rangeState.focusedMeasure === '1'
      && passageLinkState.rangeState.pressed.join(',') === '1,2,3'
      && passageLinkState.rangeState.questionWrapped,
    `Wrapped multi-measure Markdown link did not select and focus its range (${JSON.stringify(passageLinkState.rangeState)}).`,
  );
  assert(
    passageLinkState.rangeState.playTitle === 'Play Piano Synthesizer'
      && !passageLinkState.playbackStates.includes(true),
    `Multi-measure Markdown link started playback (${JSON.stringify(passageLinkState)}).`,
  );
  assert(
    passageLinkState.annotationJourney.routes.includes('Form and phrase analysis')
      && passageLinkState.annotationJourney.tools.includes('Read 3 measures')
      && passageLinkState.annotationJourney.acceptedState === 'accepted'
      && passageLinkState.annotationJourney.rejectedState === 'rejected'
      && passageLinkState.annotationJourney.acceptedRail
      && passageLinkState.annotationJourney.acceptedBody === 'Edited and persisted in the rail.'
      && passageLinkState.annotationJourney.manualOverlay
      && passageLinkState.annotationJourney.chordBadgeCount >= 2
      && passageLinkState.annotationJourney.chordLaneCount === 1
      && passageLinkState.annotationJourney.chordBaselinesAligned
      && passageLinkState.annotationJourney.chordIntersections === 0
      && passageLinkState.annotationJourney.scoreGeometryStable,
    `Annotation proposal workflow did not complete (${JSON.stringify(passageLinkState.annotationJourney)}).`,
  );
  await firstCDP.call('Page.reload', { ignoreCache: true });
  const shellState = await firstCDP.evaluate(`(async () => {
    const waitForElement = async (selector) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const element = document.querySelector(selector);
        if (element) return element;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return null;
    };
    const bridge = window.choraleAI;
    const sheet = await waitForElement('.sheet-music-card');
    const acceptedRailAfterReload = await waitForElement(
      '[data-edit-annotation="smoke-accepted-annotation"]',
    );
    const manualOverlayAfterReload = await waitForElement(
      '[aria-label="Edit Smoke manual annotation"]',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const saveDeadline = Date.now() + 5000;
    while (
      Date.now() < saveDeadline
      && document.querySelector('.score-status-item.save')?.textContent !== 'Auto-saved'
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const sheetZoomBefore = sheet?.querySelector('.scale-val')?.textContent;
    const scoreScene = sheet?.querySelector('.sheet-zoom-wrapper');
    const annotationRailZoomBefore = scoreScene?.getAttribute('data-score-zoom');
    sheet?.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const sheetZoomAfter = sheet?.querySelector('.scale-val')?.textContent;
    const annotationRailZoomAfter = scoreScene?.getAttribute('data-score-zoom');
    const interfaceZoomAfterSheet = document.documentElement.style.getPropertyValue('--ui-zoom');
    const annotationLayoutBounds = sheet?.querySelector('.sheet-annotation-layout')
      ?.getBoundingClientRect();
    const notationBounds = sheet?.querySelector('.sheet-notation-column')?.getBoundingClientRect();
    const annotationNotationCenterDelta = annotationLayoutBounds && notationBounds
      ? Math.abs(
        (annotationLayoutBounds.left + annotationLayoutBounds.width / 2)
        - (notationBounds.left + notationBounds.width / 2)
      )
      : null;
    const sheetViewport = sheet?.querySelector('.sheet-viewport');
    const sheetZoomContent = sheetViewport?.firstElementChild;
    const sheetViewportBounds = sheetViewport?.getBoundingClientRect();
    const sheetZoomContentBounds = sheetZoomContent?.getBoundingClientRect();
    const sheetZoomCenterDelta = sheetViewportBounds && sheetZoomContentBounds
      ? Math.abs(
        (sheetViewportBounds.left + sheetViewportBounds.width / 2)
        - (sheetZoomContentBounds.left + sheetZoomContentBounds.width / 2)
      )
      : null;
    const annotationRailBounds = sheet?.querySelector('.annotation-rail')?.getBoundingClientRect();
    const annotationRailProximity = notationBounds && annotationRailBounds
      ? {
          horizontalGap: annotationRailBounds.left - notationBounds.right,
          topDelta: Math.abs(annotationRailBounds.top - notationBounds.top),
        }
      : null;
    const annotationSceneShared = Boolean(
      scoreScene
      && scoreScene.contains(sheet?.querySelector('.sheet-notation-column'))
      && scoreScene.contains(sheet?.querySelector('.annotation-rail')),
    );
    const annotationSceneOverflow = sheetViewport
      ? sheetViewport.scrollWidth > sheetViewport.clientWidth
      : null;
    const annotationRailBackground = annotationRailBounds
      ? getComputedStyle(sheet.querySelector('.annotation-rail')).backgroundColor
      : null;
    const annotationRailHasTransparentBackground = annotationRailBackground === 'transparent'
      || annotationRailBackground === 'rgba(0, 0, 0, 0)'
      || annotationRailBackground?.endsWith('/ 0)');
    const alignedAnnotationList = sheet?.querySelector('.annotation-rail-list');
    const alignedAnnotationCard = sheet
      ?.querySelector('[data-annotation-id="smoke-accepted-annotation"]');
    const alignedAnnotationCardBounds = alignedAnnotationCard?.getBoundingClientRect();
    const annotationAnchorY = Number(alignedAnnotationCard?.getAttribute('data-annotation-anchor-y'));
    const scoreSceneBounds = scoreScene?.getBoundingClientRect();
    const scoreSceneScale = Number(annotationRailZoomAfter) / 100;
    const annotationMeasureAlignment = {
      aligned: alignedAnnotationList?.getAttribute('data-score-aligned'),
      anchorY: annotationAnchorY,
      centerDelta: alignedAnnotationCardBounds && scoreSceneBounds
        ? Math.abs(
          alignedAnnotationCardBounds.top + alignedAnnotationCardBounds.height / 2
          - (scoreSceneBounds.top + annotationAnchorY * scoreSceneScale)
        )
        : null,
    };

    const fileRailWidthDefault = document.querySelector('.file-rail')?.getBoundingClientRect().width;
    const expectedFileRailWidth = Math.max(240, Math.min(560, Math.round(window.innerWidth / 4)));
    const fileResize = document.querySelector('.file-rail-resize-handle');
    if (fileResize) {
      const startX = fileResize.getBoundingClientRect().x;
      fileResize.setPointerCapture = () => undefined;
      fileResize.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: startX,
        pointerId: 2,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: startX + 64,
        pointerId: 2,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const fileRailWidth = document.querySelector('.file-rail')?.getBoundingClientRect().width;
    const filePanelStack = document.querySelector('.file-rail-panel-stack');
    const importButton = document.querySelector('.file-rail-section:not([hidden]) .import-btn');
    const importBounds = importButton?.getBoundingClientRect();
    const filePanelBounds = filePanelStack?.getBoundingClientRect();
    const importCenterDelta = importBounds && filePanelBounds
      ? Math.abs(
        (importBounds.left + importBounds.width / 2)
        - (filePanelBounds.left + filePanelBounds.width / 2)
      )
      : null;
    const railTabs = [...document.querySelectorAll('.file-rail-tab')].map((tab) => ({
      label: tab.getAttribute('aria-label'),
      title: tab.getAttribute('title'),
      text: tab.textContent.trim(),
    }));
    const visibleRailPanelCount = [...document.querySelectorAll('.file-rail-section')]
      .filter((panel) => !panel.hidden).length;
    const fileRailHorizontalOverflow = filePanelStack
      ? filePanelStack.scrollWidth - filePanelStack.clientWidth
      : null;
    const hasFileMoveButtons = Boolean(
      document.querySelector('[aria-label^="Move "][aria-label$=" up"], [aria-label^="Move "][aria-label$=" down"]'),
    );

    const chatResize = document.querySelector('.chat-rail-resize-handle');
    if (chatResize) {
      chatResize.setPointerCapture = () => undefined;
      chatResize.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: chatResize.getBoundingClientRect().x,
        pointerId: 1,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: -2000,
        pointerId: 1,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const chatWidth = document.querySelector('.right-panel')?.getBoundingClientRect().width;
    const chatWidthLimit = Math.floor(window.innerWidth / 3);
    const chatPreferenceAfterResize = Number(localStorage.getItem('chorale.workspace.chatWidth'));
    window.dispatchEvent(new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const rightEdgeIsChat = document.elementsFromPoint(window.innerWidth - 1, 100)
      .some((element) => Boolean(element.closest('.right-panel')));
    const zoomGeometry = {
      bodyRight: document.body.getBoundingClientRect().right,
      shellRight: document.querySelector('.chorale-app-shell')?.getBoundingClientRect().right,
      bodyWidth: getComputedStyle(document.body).width,
      viewportWidth: window.innerWidth,
      bodyBottom: document.body.getBoundingClientRect().bottom,
      bodyHeight: getComputedStyle(document.body).height,
      viewportHeight: window.innerHeight,
    };

    document.querySelector('[role="tab"][aria-label="Tools"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const abcDisplay = await waitForElement('#tools-panel:not([hidden]) [aria-pressed="false"]');
    abcDisplay?.click();
    const abcClose = await waitForElement('[aria-label="Close ABC editor"]');
    const abcEditorBounds = document.querySelector('.abc-editor-card')?.getBoundingClientRect();
    const abcCloseBounds = abcClose?.getBoundingClientRect();
    const abcCloseVisible = abcClose
      ? getComputedStyle(abcClose).display !== 'none'
        && abcCloseBounds.width > 0
        && abcCloseBounds.height > 0
      : false;
    const abcCloseRightDelta = abcEditorBounds && abcCloseBounds
      ? Math.abs(abcEditorBounds.right - abcCloseBounds.right)
      : null;
    const abcCloseTopDelta = abcEditorBounds && abcCloseBounds
      ? Math.abs(abcCloseBounds.top - abcEditorBounds.top)
      : null;
    const editorOpened = Boolean(document.querySelector('.editor-workspace-card'));
    abcClose?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const editorClosed = !document.querySelector('.editor-workspace-card');

    document.querySelector('.file-rail-tab[aria-label="Settings"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const settingsTitle = await waitForElement('#ai-settings-title');
    const settingsPreservedToolsPanel = Boolean(document.querySelector('#tools-panel:not([hidden])'));
    const provider = document.querySelector('.ai-add-connection select');
    const settingsRect = document.querySelector('.ai-settings-modal')?.getBoundingClientRect();
    const settingsTabs = document.querySelector('.ai-settings-tabs');
    const settingsTabsDirection = settingsTabs ? getComputedStyle(settingsTabs).flexDirection : null;
    const settingsHasSubtitle = Boolean(document.querySelector('.ai-settings-header p'));
    document.querySelector('#settings-tab-appearance')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const appearanceRect = document.querySelector('.ai-settings-modal')?.getBoundingClientRect();
    document.querySelector('#settings-tab-diagnostics')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const diagnosticsRect = document.querySelector('.ai-settings-modal')?.getBoundingClientRect();
    const diagnosticsTitle = document.querySelector('#settings-panel-diagnostics h3')?.textContent;
    const diagnosticsOpenButton = document.querySelector('#settings-panel-diagnostics button')?.textContent?.trim();
    document.querySelector('#settings-tab-about')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const aboutRect = document.querySelector('.ai-settings-modal')?.getBoundingClientRect();
    const composerBottom = document.querySelector('.agent-composer')?.getBoundingClientRect().bottom;
    const panelBottom = document.querySelector('.right-panel')?.getBoundingClientRect().bottom;
    const playbackBottom = document.querySelector('.playback-dock-container')?.getBoundingClientRect().bottom;
    const workspaceBottom = document.querySelector('.central-workspace')?.getBoundingClientRect().bottom;
    const centralBounds = document.querySelector('.central-workspace')?.getBoundingClientRect();
    const scoreBounds = document.querySelector('.score-sheet')?.getBoundingClientRect();
    const scoreCenterDelta = centralBounds && scoreBounds
      ? Math.abs(
        (centralBounds.left + centralBounds.width / 2)
        - (scoreBounds.left + scoreBounds.width / 2)
      )
      : null;
    const threadWidth = document.querySelector('.agent-history-control')?.getBoundingClientRect().width;
    const threadRowWidth = document.querySelector('.agent-history-row')?.getBoundingClientRect().width;
    const threadHeaderWidth = document.querySelector('.agent-panel-header')?.getBoundingClientRect().width;
    const suggestionsWidth = document.querySelector('.agent-suggestions')?.getBoundingClientRect().width;
    const transcriptWidth = document.querySelector('.agent-transcript')?.getBoundingClientRect().width;
    const transcriptBounds = document.querySelector('.agent-transcript')?.getBoundingClientRect();
    const suggestionsBounds = document.querySelector('.agent-suggestions')?.getBoundingClientRect();
    const tryAskingTopRatio = transcriptBounds && suggestionsBounds
      ? (suggestionsBounds.top - transcriptBounds.top) / transcriptBounds.height
      : null;
    const agentFontSize = getComputedStyle(document.querySelector('.agent-panel')).fontSize;
    const threadControl = document.querySelector('.agent-history-control');
    const threadTrigger = threadControl?.querySelector('.agent-history-trigger');
    const threadLabel = threadTrigger?.querySelector('span');
    const threadChevron = threadTrigger?.querySelector('.agent-history-chevron');
    const threadTriggerStyle = threadTrigger ? getComputedStyle(threadTrigger) : null;
    const threadChevronStyle = threadChevron ? getComputedStyle(threadChevron) : null;
    const threadBorderWidth = threadTriggerStyle?.borderTopWidth ?? null;
    const threadBorderRadius = threadTriggerStyle?.borderTopLeftRadius ?? null;
    const threadTriggerFontSize = threadTriggerStyle?.fontSize ?? null;
    const threadTriggerAppearance = threadTriggerStyle?.appearance ?? null;
    const threadChevronBackground = threadChevronStyle?.backgroundColor ?? null;
    const threadChevronShadow = threadChevronStyle?.boxShadow ?? null;
    const threadLegacyArrowStyle = threadControl
      ? getComputedStyle(threadControl, '::after')
      : null;
    const threadLegacyArrowContent = threadLegacyArrowStyle?.content ?? null;
    const threadLegacyArrowBorderWidth = threadLegacyArrowStyle?.borderTopWidth ?? null;
    const threadTriggerWidth = threadTrigger?.getBoundingClientRect().width ?? null;
    const threadLabelWidth = threadLabel?.getBoundingClientRect().width ?? null;
    const threadChevronCount = document.querySelectorAll('.agent-history-chevron').length;
    const hasThreadDelete = Boolean(document.querySelector('[aria-label="Delete current thread"]'));
    await new Promise((resolve) => setTimeout(resolve, 750));
    const displayOptions = document.querySelector('.score-display-options');
    const displayOptionsBounds = displayOptions?.getBoundingClientRect();
    const scoreWorkspaceBounds = document.querySelector('.score-workspace-card')?.getBoundingClientRect();
    const displayOptionsCenterDelta = displayOptionsBounds && scoreWorkspaceBounds
      ? Math.abs(
        (displayOptionsBounds.left + displayOptionsBounds.width / 2)
        - (scoreWorkspaceBounds.left + scoreWorkspaceBounds.width / 2)
      )
      : null;
    const displayOptionsRestOpacity = displayOptions ? getComputedStyle(displayOptions).opacity : null;
    document.querySelector('.score-workspace-card')?.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      deltaY: 12,
    }));
    await new Promise((resolve) => setTimeout(resolve, 260));
    const displayOptionsScrollOpacity = displayOptions ? getComputedStyle(displayOptions).opacity : null;
    const elapsedTime = document.querySelector('.playback-progress strong');
    const volumeValue = document.querySelector('.slider-value');
    localStorage.setItem('chorale.electron-smoke', 'persisted');
    document.querySelector('[aria-label="Close settings"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const readActiveThread = () => {
      const store = JSON.parse(localStorage.getItem('chorale.pi-agent-conversation.v3') ?? 'null');
      const activeFileId = localStorage.getItem('chorale.workspace.activeFileId');
      const fileConversation = activeFileId ? store?.files?.[activeFileId] : null;
      return {
        id: fileConversation?.activeThreadId ?? null,
        count: fileConversation?.threads?.length ?? 0,
      };
    };
    const threadBeforeDelete = readActiveThread();
    document.querySelector('[aria-label="Delete current thread"]')?.click();
    const emptyThreadDeadline = Date.now() + 2000;
    while (
      Date.now() < emptyThreadDeadline
      && (document.querySelector('.agent-suggestions')?.getBoundingClientRect().width ?? 0) <= 0
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const threadAfterDelete = readActiveThread();
    const acceptedRailAfterThreadDelete = Boolean(
      document.querySelector('[data-edit-annotation="smoke-accepted-annotation"]'),
    );
    const manualOverlayAfterThreadDelete = Boolean(
      document.querySelector('[aria-label="Edit Smoke manual annotation"]'),
    );
    const freshSuggestions = document.querySelector('.agent-suggestions');
    const freshTranscript = document.querySelector('.agent-transcript');
    const freshTranscriptBounds = freshTranscript?.getBoundingClientRect();
    const freshSuggestionsBounds = freshSuggestions?.getBoundingClientRect();
    const freshTryAskingTopRatio = freshTranscriptBounds?.height > 0 && freshSuggestionsBounds?.width > 0
      ? (freshSuggestionsBounds.top - freshTranscriptBounds.top) / freshTranscriptBounds.height
      : null;
    document.querySelector('[aria-label="Close assistant"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const closedPanel = document.querySelector('.right-panel');
    const closedPanelStyle = closedPanel && {
      display: getComputedStyle(closedPanel).display,
      width: closedPanel.getBoundingClientRect().width,
    };
    return {
      url: location.href,
      title: document.title,
      hasHeaderBrandMark: Boolean(document.querySelector('.header-brand .brand-mark')),
      hasHeaderSettings: Boolean(document.querySelector('.app-header [aria-label="Open settings"]')),
      railSectionNames: [...document.querySelectorAll('.rail-section-title')].map((element) => element.textContent),
      railTabs,
      visibleRailPanelCount,
      importWidth: importBounds?.width ?? null,
      importCenterDelta,
      fileRailHorizontalOverflow,
      hasFileMoveButtons,
      hasScoreViewSwitch: Boolean(document.querySelector('.score-view-switch')),
      hasScoreFooter: Boolean(document.querySelector('.score-canvas-footer')),
      scoreStatusText: document.querySelector('.score-build-status')?.textContent,
      displayOptionsRestOpacity,
      displayOptionsScrollOpacity,
      displayOptionsCenterDelta,
      headerRuleContent: getComputedStyle(document.querySelector('.app-header'), '::after').content,
      fileRuleContent: getComputedStyle(document.querySelector('.file-rail'), '::before').content,
      editorOpened,
      editorClosed,
      abcCloseVisible,
      abcCloseRightDelta,
      abcCloseTopDelta,
      hasNodeRequire: typeof window.require !== 'undefined',
      hasNodeProcess: typeof window.process !== 'undefined',
      bridgeMethods: bridge ? Object.keys(bridge).sort() : [],
      connections: bridge ? await bridge.listConnections() : null,
      settingsTitle: settingsTitle?.textContent,
      settingsPreservedToolsPanel,
      settingsTabsDirection,
      settingsHasSubtitle,
      settingsFrames: [settingsRect, appearanceRect, diagnosticsRect, aboutRect].map((rect) => rect && ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      })),
      diagnosticsTitle,
      diagnosticsOpenButton,
      providerCount: provider?.querySelectorAll('option').length ?? 0,
      sheetZoomBefore,
      sheetZoomAfter,
      annotationRailZoomBefore,
      annotationRailZoomAfter,
      annotationNotationCenterDelta,
      sheetZoomCenterDelta,
      annotationRailProximity,
      annotationSceneShared,
      annotationSceneOverflow,
      annotationRailBackground,
      annotationRailHasTransparentBackground,
      annotationMeasureAlignment,
      interfaceZoomAfterSheet,
      fileRailWidthDefault,
      expectedFileRailWidth,
      fileRailWidth,
      chatWidth,
      chatWidthLimit,
      chatPreferenceAfterResize,
      rightEdgeIsChat,
      zoomGeometry,
      interfaceZoom: document.documentElement.style.getPropertyValue('--ui-zoom'),
      computedInterfaceZoom: getComputedStyle(document.body).zoom,
      composerBottom,
      panelBottom,
      playbackBottom,
      workspaceBottom,
      viewportBottom: window.innerHeight,
      scoreCenterDelta,
      threadWidth,
      threadRowWidth,
      threadHeaderWidth,
      agentFontSize,
      threadBorderWidth,
      threadBorderRadius,
      threadTriggerFontSize,
      threadTriggerAppearance,
      threadChevronBackground,
      threadChevronShadow,
      threadLegacyArrowContent,
      threadLegacyArrowBorderWidth,
      threadTriggerWidth,
      threadLabelWidth,
      threadChevronCount,
      hasThreadDelete,
      acceptedRailAfterReload: Boolean(acceptedRailAfterReload),
      manualOverlayAfterReload: Boolean(manualOverlayAfterReload),
      acceptedRailAfterThreadDelete,
      manualOverlayAfterThreadDelete,
      threadIdBeforeDelete: threadBeforeDelete.id,
      threadIdAfterDelete: threadAfterDelete.id,
      threadCountAfterDelete: threadAfterDelete.count,
      suggestionsWidth: freshSuggestions?.getBoundingClientRect().width ?? suggestionsWidth,
      transcriptWidth: freshTranscript?.getBoundingClientRect().width ?? transcriptWidth,
      tryAskingTopRatio: freshTryAskingTopRatio ?? tryAskingTopRatio,
      hasSuggestions: Boolean(freshSuggestions?.querySelector('.agent-suggestion')),
      hasAnalysisLabel: document.body.textContent.includes('Analysis'),
      hasSelectionDisplay: document.body.textContent.includes('Attached anchor:')
        || document.body.textContent.includes('Selection:'),
      elapsedTimeColor: elapsedTime ? getComputedStyle(elapsedTime).color : null,
      elapsedTimeWeight: elapsedTime ? getComputedStyle(elapsedTime).fontWeight : null,
      volumeValueColor: volumeValue ? getComputedStyle(volumeValue).color : null,
      volumeValueWeight: volumeValue ? getComputedStyle(volumeValue).fontWeight : null,
      closedPanelStyle,
      storedChatOpen: localStorage.getItem('chorale.workspace.chatOpen'),
      storedChatWidth: Number(localStorage.getItem('chorale.workspace.chatWidth')),
      storedFileRailWidth: Number(localStorage.getItem('chorale.workspace.fileRailWidth')),
      storedSheetZoom: Number(localStorage.getItem('chorale.workspace.sheetZoom')),
    };
  })()`);
  assert(shellState.url === 'app://chorale/index.html', 'Production renderer did not use app://chorale.');
  assert(shellState.title === 'Chorale', `Production renderer title is not exact (${shellState.title}).`);
  assert(shellState.hasHeaderBrandMark === false, 'Header still contains the removed brand icon.');
  assert(shellState.hasHeaderSettings === false, 'Settings entry point is still in the header.');
  assert(
    shellState.railSectionNames.join(',') === 'Files,Tools',
    `Left rail sections are incomplete (${shellState.railSectionNames.join(',')}).`,
  );
  assert(
    shellState.railTabs.length === 3
      && shellState.railTabs.every((tab) => tab.label === tab.title && tab.text === ''),
    `Left rail tabs are not icon-only selections with tooltips (${JSON.stringify(shellState.railTabs)}).`,
  );
  assert(
    shellState.visibleRailPanelCount === 1,
    `Left rail displays more than one panel (${shellState.visibleRailPanelCount}).`,
  );
  assert(
    Number.isFinite(shellState.importWidth)
      && shellState.importWidth <= 145
      && Number.isFinite(shellState.importCenterDelta)
      && shellState.importCenterDelta <= 1,
    `Import action is not compact and centered (${shellState.importWidth}px, delta ${shellState.importCenterDelta}px).`,
  );
  assert(
    Number.isFinite(shellState.fileRailHorizontalOverflow)
      && shellState.fileRailHorizontalOverflow <= 1,
    `Left rail still scrolls horizontally (${shellState.fileRailHorizontalOverflow}px overflow).`,
  );
  assert(shellState.hasFileMoveButtons === false, 'File rail still contains arrow reorder buttons.');
  assert(shellState.hasScoreViewSwitch === false, 'Score/ABC view switch is still in the score header.');
  assert(shellState.hasScoreFooter === false, 'Render status still occupies the score footer.');
  assert(
    shellState.scoreStatusText.includes('Auto-saved')
      && shellState.scoreStatusText.includes('SVG ready')
      && shellState.scoreStatusText.includes('Audio ready'),
    `Score status is not grouped under the title (${shellState.scoreStatusText}).`,
  );
  assert(
    Number.isFinite(shellState.displayOptionsCenterDelta)
      && shellState.displayOptionsCenterDelta <= 1,
    `Score display controls are not centered (${shellState.displayOptionsCenterDelta}px).`,
  );
  assert(
    shellState.displayOptionsRestOpacity === '0.32'
      && shellState.displayOptionsScrollOpacity === '0.68',
    `Score display controls do not surface on scroll (${shellState.displayOptionsRestOpacity} -> ${shellState.displayOptionsScrollOpacity}).`,
  );
  assert(
    ['none', 'normal'].includes(shellState.headerRuleContent)
      && ['none', 'normal'].includes(shellState.fileRuleContent),
    `Empty decorative rules remain (${shellState.headerRuleContent}, ${shellState.fileRuleContent}).`,
  );
  assert(shellState.editorOpened && shellState.editorClosed, 'ABC display did not open and close from its owning panels.');
  assert(
    shellState.abcCloseVisible
      && shellState.abcCloseRightDelta <= 20
      && shellState.abcCloseTopDelta <= 20,
    `ABC close action is not visible in the pane upper-right (${shellState.abcCloseVisible}, right ${shellState.abcCloseRightDelta}, top ${shellState.abcCloseTopDelta}).`,
  );
  assert(shellState.hasNodeRequire === false, 'Renderer unexpectedly exposes Node require.');
  assert(shellState.hasNodeProcess === false, 'Renderer unexpectedly exposes Node process.');
  assert(shellState.bridgeMethods.includes('sendChat'), 'Typed preload bridge is unavailable.');
  assert(shellState.bridgeMethods.includes('startCodexLogin'), 'Codex bridge method is unavailable.');
  assert(shellState.bridgeMethods.includes('openTraceDirectory'), 'Agent trace bridge method is unavailable.');
  assert(Array.isArray(shellState.connections), 'Connection listing did not cross the preload bridge.');
  assert(shellState.connections.length === 0, 'Electron smoke profile was not isolated.');
  assert(shellState.settingsTitle === 'Settings', 'Settings modal did not open.');
  assert(
    shellState.settingsPreservedToolsPanel,
    'Direct settings action replaced the selected left work panel.',
  );
  assert(
    shellState.settingsTabsDirection === 'column',
    `Settings tabs are not vertical (${shellState.settingsTabsDirection}).`,
  );
  assert(shellState.settingsHasSubtitle === false, 'Settings header still contains a subtitle.');
  assert(
    shellState.diagnosticsTitle === 'Agent conversation traces'
      && shellState.diagnosticsOpenButton === 'Open agent trace folder',
    `Agent trace settings are incomplete (${shellState.diagnosticsTitle}/${shellState.diagnosticsOpenButton}).`,
  );
  assert(
    shellState.settingsFrames.every((frame) => (
      frame
      && frame.x === shellState.settingsFrames[0].x
      && frame.y === shellState.settingsFrames[0].y
      && frame.width === shellState.settingsFrames[0].width
      && frame.height === shellState.settingsFrames[0].height
    )),
    `Settings tabs changed the dialog frame (${JSON.stringify(shellState.settingsFrames)}).`,
  );
  assert(shellState.providerCount === 6, 'Settings modal does not list all six provider types.');
  assert(shellState.sheetZoomBefore === '100%', `Sheet zoom did not start at 100% (${shellState.sheetZoomBefore}).`);
  assert(
    shellState.sheetZoomAfter === '110%',
    `Ctrl+wheel over the sheet did not zoom only the sheet (${shellState.sheetZoomAfter}).`,
  );
  assert(
    shellState.annotationRailZoomBefore === '100'
      && shellState.annotationRailZoomAfter === '110',
    `Annotation rail did not follow sheet zoom (${shellState.annotationRailZoomBefore} -> ${shellState.annotationRailZoomAfter}).`,
  );
  assert(
    shellState.annotationNotationCenterDelta !== null
      && shellState.annotationNotationCenterDelta <= 1,
    `Notation did not remain on the sheet centerline (${shellState.annotationNotationCenterDelta}).`,
  );
  assert(
    shellState.sheetZoomCenterDelta !== null && shellState.sheetZoomCenterDelta <= 1,
    `Zoomed notation did not remain centered in its viewport (${shellState.sheetZoomCenterDelta}).`,
  );
  assert(shellState.annotationSceneShared, 'Notation and annotations do not share one zoom scene.');
  assert(
    shellState.annotationSceneOverflow,
    'The score scene did not preserve side overflow when its viewport was too narrow.',
  );
  assert(
    shellState.annotationRailHasTransparentBackground,
    `The annotation rail retained a panel background (${shellState.annotationRailBackground}).`,
  );
  assert(
    shellState.annotationRailProximity
      && shellState.annotationRailProximity.horizontalGap >= 0
      && shellState.annotationRailProximity.horizontalGap <= 16
      && shellState.annotationRailProximity.topDelta <= 1,
    `The annotation rail is not close beside the rendered sheet (${JSON.stringify(shellState.annotationRailProximity)}).`,
  );
  assert(
    shellState.annotationMeasureAlignment.aligned === 'true'
      && Number.isFinite(shellState.annotationMeasureAlignment.anchorY)
      && shellState.annotationMeasureAlignment.centerDelta !== null
      && shellState.annotationMeasureAlignment.centerDelta <= 2,
    `Annotation rail did not align cards to rendered measure geometry (${JSON.stringify(shellState.annotationMeasureAlignment)}).`,
  );
  assert(shellState.interfaceZoomAfterSheet === '1', 'Sheet zoom unexpectedly changed interface zoom.');
  assert(
    Math.abs(shellState.fileRailWidthDefault - shellState.expectedFileRailWidth) <= 1,
    `File rail did not start at 25% (${shellState.fileRailWidthDefault} vs ${shellState.expectedFileRailWidth}).`,
  );
  assert(
    Math.abs(shellState.fileRailWidth - (shellState.fileRailWidthDefault + 64)) <= 1,
    `File rail did not resize (${shellState.fileRailWidth} vs ${shellState.fileRailWidthDefault}).`,
  );
  assert(
    shellState.chatWidth <= shellState.chatWidthLimit
      && Math.abs(shellState.chatPreferenceAfterResize - shellState.chatWidthLimit) <= 1,
    `Chat panel did not persist a one-third preference and fit it to the score (${shellState.chatWidth}, stored ${shellState.chatPreferenceAfterResize}, limit ${shellState.chatWidthLimit}).`,
  );
  assert(shellState.interfaceZoom === '1.1', 'Ctrl+wheel did not increase interface zoom.');
  assert(shellState.computedInterfaceZoom === '1.1', 'Interface zoom was not applied to the renderer.');
  assert(
    shellState.rightEdgeIsChat,
    `Interface zoom detached the chat panel from the visual right edge (${JSON.stringify(shellState.zoomGeometry)}).`,
  );
  assert(
    Math.abs(shellState.panelBottom - shellState.viewportBottom) <= 1
      && shellState.panelBottom - shellState.composerBottom <= 20,
    `Chat composer is not anchored to the visible window bottom (${shellState.composerBottom}, panel ${shellState.panelBottom}, viewport ${shellState.viewportBottom}, geometry ${JSON.stringify(shellState.zoomGeometry)}).`,
  );
  assert(
    Math.abs(shellState.workspaceBottom - shellState.playbackBottom) <= 1
      && Math.abs(shellState.playbackBottom - shellState.viewportBottom) <= 1,
    `Playback dock is not anchored to the visible window bottom (${shellState.playbackBottom}, workspace ${shellState.workspaceBottom}, viewport ${shellState.viewportBottom}).`,
  );
  assert(
    shellState.scoreCenterDelta !== null && shellState.scoreCenterDelta <= 1,
    `Score sheet is not centered in the middle panel (${shellState.scoreCenterDelta}px).`,
  );
  assert(
    shellState.threadRowWidth >= shellState.threadHeaderWidth - 40
      && shellState.threadWidth >= shellState.threadRowWidth - 60,
    `Thread history row is still too narrow (${shellState.threadWidth}px selector, ${shellState.threadRowWidth}px row in ${shellState.threadHeaderWidth}px header).`,
  );
  assert(
    shellState.agentFontSize === '16px' && shellState.threadTriggerFontSize === '14px',
    `Chat body and compact thread-title sizes are incorrect (${shellState.agentFontSize}, trigger ${shellState.threadTriggerFontSize}).`,
  );
  assert(
    Number.parseFloat(shellState.threadBorderWidth) >= 0.8
      && Number.parseFloat(shellState.threadBorderWidth) <= 1.1
      && shellState.threadBorderRadius === '8px'
      && [
        'rgba(0, 0, 0, 0)',
        'transparent',
        'oklab(0 0 0 / 0)',
        'oklch(0 0 0 / 0)',
      ].includes(shellState.threadChevronBackground)
      && shellState.threadChevronShadow === 'none'
      && ['none', 'normal', '""'].includes(shellState.threadLegacyArrowContent)
      && Number.parseFloat(shellState.threadLegacyArrowBorderWidth) === 0
      && shellState.threadTriggerAppearance === 'none'
      && shellState.threadChevronCount === 1,
    `Thread selector styling is incomplete (${shellState.threadBorderWidth}, radius ${shellState.threadBorderRadius}, chevron ${shellState.threadChevronBackground}/${shellState.threadChevronShadow}, legacy ${shellState.threadLegacyArrowContent}/${shellState.threadLegacyArrowBorderWidth}, appearance ${shellState.threadTriggerAppearance}, chevrons ${shellState.threadChevronCount}).`,
  );
  assert(
    shellState.threadLabelWidth / shellState.threadTriggerWidth >= 0.9,
    `Thread title does not use the available trigger width (${shellState.threadLabelWidth}px of ${shellState.threadTriggerWidth}px).`,
  );
  assert(shellState.hasThreadDelete, 'Thread history does not expose a delete action.');
  assert(
    shellState.acceptedRailAfterReload
      && shellState.manualOverlayAfterReload
      && shellState.acceptedRailAfterThreadDelete
      && shellState.manualOverlayAfterThreadDelete,
    `Reload or chat deletion removed document annotations (${JSON.stringify({
      acceptedAfterReload: shellState.acceptedRailAfterReload,
      manualAfterReload: shellState.manualOverlayAfterReload,
      acceptedAfterDelete: shellState.acceptedRailAfterThreadDelete,
      manualAfterDelete: shellState.manualOverlayAfterThreadDelete,
    })}).`,
  );
  assert(
    shellState.threadIdBeforeDelete
      && shellState.threadIdAfterDelete
      && shellState.threadIdBeforeDelete !== shellState.threadIdAfterDelete
      && shellState.threadCountAfterDelete === 1,
    `Deleting the final thread did not create one fresh replacement (${shellState.threadIdBeforeDelete} -> ${shellState.threadIdAfterDelete}, count ${shellState.threadCountAfterDelete}).`,
  );
  assert(
    shellState.hasSuggestions
      && (
        shellState.suggestionsWidth === 0
        || shellState.suggestionsWidth < shellState.transcriptWidth * 0.95
      ),
    `Try Asking group is not narrower than the transcript (${shellState.suggestionsWidth}px).`,
  );
  assert(
    shellState.tryAskingTopRatio === null
      || (
        Number.isFinite(shellState.tryAskingTopRatio)
        && shellState.tryAskingTopRatio >= 0.18
        && shellState.tryAskingTopRatio <= 0.35
      ),
    `Try Asking group is not positioned near 20% from the top (${shellState.tryAskingTopRatio}).`,
  );
  assert(shellState.hasAnalysisLabel === false, 'Empty chat still contains the removed Chorale Analysis label.');
  assert(shellState.hasSelectionDisplay === false, 'Chat still contains the removed selection display.');
  assert(
    shellState.elapsedTimeColor && Number(shellState.elapsedTimeWeight) >= 600,
    `Playback time is not high-contrast (${shellState.elapsedTimeColor}, ${shellState.elapsedTimeWeight}).`,
  );
  assert(
    shellState.volumeValueColor && Number(shellState.volumeValueWeight) >= 600,
    `Playback volume is not high-contrast (${shellState.volumeValueColor}, ${shellState.volumeValueWeight}).`,
  );
  assert(
    shellState.closedPanelStyle.display === 'none' && shellState.closedPanelStyle.width === 0,
    `Closed chat left visible panel chrome (${JSON.stringify(shellState.closedPanelStyle)}).`,
  );
  assert(shellState.storedChatOpen === 'false', 'Closed chat state was not persisted.');
  assert(Number.isFinite(shellState.storedChatWidth), 'Resized chat width was not persisted.');
  assert(
    shellState.storedFileRailWidth === Math.round(shellState.fileRailWidth),
    'Resized file rail width was not persisted.',
  );
  assert(shellState.storedSheetZoom === 110, 'Sheet zoom was not persisted.');

  await firstCDP.evaluate(`(() => {
    document.querySelector('[role="tab"][aria-label="Files"]')?.click();
    return true;
  })()`);
  await firstCDP.call('DOM.enable');
  const documentNode = await firstCDP.call('DOM.getDocument');
  const fileInput = await firstCDP.call('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: 'input[type="file"]',
  });
  await firstCDP.call('DOM.setFileInputFiles', {
    nodeId: fileInput.nodeId,
    files: [path.join(projectDirectory, 'src/test/fixtures/abc/moonlight.abc')],
  });
  const dragGeometry = await firstCDP.evaluate(`(async () => {
    const readStoredDocuments = async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('chorale_db', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction('chorale_store', 'readonly');
          const request = transaction.objectStore('chorale_store').get('chorale.workspace.documents');
          request.onsuccess = () => resolve(request.result?.value ?? []);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    };
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = [...document.querySelectorAll('.file-list .file-item')];
      const storedDocuments = await readStoredDocuments();
      if (rows.length === 2 && storedDocuments.length === 2) {
        const source = rows[0].getBoundingClientRect();
        const target = rows[1].getBoundingClientRect();
        return {
          source: { x: source.left + 20, y: source.top + source.height * 0.1 },
          target: { x: target.left + 20, y: target.top + target.height * 0.25 },
          names: rows.map((row) => row.querySelector('.file-item-name')?.textContent),
          ids: storedDocuments.map((document) => document.id),
          rowsAreNativeDraggables: rows.every((row) => row.draggable),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Two-file rail did not render for native drag smoke.');
  })()`);
  assert(
    dragGeometry.names.length === 2 && dragGeometry.rowsAreNativeDraggables,
    `File rows did not start as native draggables (${JSON.stringify(dragGeometry)}).`,
  );
  const expectedFileNames = [...dragGeometry.names].reverse();
  const expectedFileIds = [...dragGeometry.ids].reverse();

  await firstCDP.call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: dragGeometry.source.x,
    y: dragGeometry.source.y,
    pointerType: 'mouse',
  });
  await firstCDP.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: dragGeometry.source.x,
    y: dragGeometry.source.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
  });
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12;
    await firstCDP.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: dragGeometry.source.x + (dragGeometry.target.x - dragGeometry.source.x) * progress,
      y: dragGeometry.source.y + (dragGeometry.target.y - dragGeometry.source.y) * progress,
      button: 'left',
      buttons: 1,
      pointerType: 'mouse',
    });
    await delay(10);
  }
  await delay(50);
  const activeDragState = await firstCDP.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.file-list .file-item')];
    const placeholder = document.querySelector('.file-list .drag-source-placeholder');
    return {
      names: rows.map((row) => row.querySelector('.file-item-name')?.textContent),
      placeholderCount: document.querySelectorAll('.file-list .drag-source-placeholder').length,
      placeholderOpacity: placeholder ? getComputedStyle(placeholder).opacity : null,
      nativeDragImageCount: document.querySelectorAll('.file-item-drag-image').length,
    };
  })()`);
  assert(
    activeDragState.names.join(',') === expectedFileNames.join(',')
      && activeDragState.placeholderCount === 1
      && activeDragState.placeholderOpacity === '0'
      && activeDragState.nativeDragImageCount === 1,
    `File rows did not shift live around one hidden source slot (${JSON.stringify(activeDragState)}).`,
  );

  await firstCDP.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: dragGeometry.target.x,
    y: dragGeometry.target.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  });
  const droppedDragState = await firstCDP.evaluate(`(async () => {
    const expectedNames = ${JSON.stringify(expectedFileNames)};
    const expectedIds = ${JSON.stringify(expectedFileIds)};
    const readStoredDocuments = async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('chorale_db', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction('chorale_store', 'readonly');
          const request = transaction.objectStore('chorale_store').get('chorale.workspace.documents');
          request.onsuccess = () => resolve(request.result?.value ?? []);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    };
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const names = [...document.querySelectorAll('.file-list .file-item-name')]
        .map((element) => element.textContent);
      const stored = (await readStoredDocuments()).map((document) => document.id);
      if (names.join(',') === expectedNames.join(',') && stored.join(',') === expectedIds.join(',')) {
        return {
          names,
          stored,
          placeholderCount: document.querySelectorAll('.file-list .drag-source-placeholder').length,
          nativeDragImageCount: document.querySelectorAll('.file-item-drag-image').length,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Native file drop did not commit its visible order.');
  })()`);
  assert(
    droppedDragState.placeholderCount === 0 && droppedDragState.nativeDragImageCount === 0,
    `Native drag artifacts remained after drop (${JSON.stringify(droppedDragState)}).`,
  );

  await closeCleanly(first, firstCDP);
  firstCDP.socket.close();
  assert(!first.output().includes('violates the following Content Security Policy'), (
    `Electron reported a CSP violation:\n${first.output()}`
  ));

  const second = await launch(profileDirectory);
  const secondCDP = await connectCDP(second.target.webSocketDebuggerUrl);
  const persisted = await secondCDP.evaluate(`(async () => {
    const expectedFileNames = ${JSON.stringify(expectedFileNames)};
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        if (document.readyState !== 'loading') {
          const value = localStorage.getItem('chorale.electron-smoke');
          const showChat = document.querySelector('[title="Show score chat"]');
          const fileOrder = [...document.querySelectorAll('.file-list .file-item-name')]
            .map((element) => element.textContent);
          if (value !== null && showChat && fileOrder.length === expectedFileNames.length) {
            const initiallyOpen = Boolean(document.querySelector('[aria-label="Current sheet assistant"]'));
            showChat.click();
            await new Promise((resolve) => setTimeout(resolve, 25));
            const database = await new Promise((resolve, reject) => {
              const request = indexedDB.open('chorale_db', 1);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const storedDocuments = await new Promise((resolve, reject) => {
              const transaction = database.transaction('chorale_store', 'readonly');
              const request = transaction.objectStore('chorale_store').get('chorale.workspace.documents');
              request.onsuccess = () => resolve(request.result?.value ?? []);
              request.onerror = () => reject(request.error);
            });
            database.close();
            return {
              value,
              initiallyOpen,
              reopened: Boolean(document.querySelector('[aria-label="Current sheet assistant"]')),
              reopenedWidth: document.querySelector('.right-panel')?.getBoundingClientRect().width,
              storedWidth: Number(localStorage.getItem('chorale.workspace.chatWidth')),
              fileRailWidth: document.querySelector('.file-rail')?.getBoundingClientRect().width,
              storedFileRailWidth: Number(localStorage.getItem('chorale.workspace.fileRailWidth')),
              fileOrder,
              sheetZoom: document.querySelector('.scale-val')?.textContent,
              interfaceZoom: Number(getComputedStyle(document.body).zoom),
              annotationLabels: storedDocuments.flatMap((document) => (
                (document.annotations ?? []).map((annotation) => annotation.label)
              )),
              annotations: storedDocuments.flatMap((document) => document.annotations ?? [])
                .map((annotation) => ({ label: annotation.label, body: annotation.body })),
            };
          }
        }
      } catch {
        // The app:// navigation can be visible to CDP before its origin is committed.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Renderer storage origin was not ready after restart.');
  })()`);
  assert(persisted.value === 'persisted', 'Renderer localStorage did not survive an Electron restart.');
  assert(persisted.initiallyOpen === false, 'Chat open state did not survive restart.');
  assert(persisted.reopened === true, 'Chat could not be reopened after restoring its closed state.');
  assert(
    persisted.reopenedWidth <= persisted.storedWidth * persisted.interfaceZoom + 1
      && persisted.reopenedWidth >= 280 * persisted.interfaceZoom - 1,
    `Reopened chat did not restore its persisted width (${persisted.reopenedWidth} vs ${persisted.storedWidth}).`,
  );
  assert(
    persisted.fileRailWidth <= persisted.storedFileRailWidth * persisted.interfaceZoom + 1
      && persisted.fileRailWidth >= 240 * persisted.interfaceZoom - 1,
    `File rail did not restore its persisted width (${persisted.fileRailWidth} vs ${persisted.storedFileRailWidth}).`,
  );
  assert(
    persisted.fileOrder.join(',') === expectedFileNames.join(','),
    `Native file order jumped back after restart (${persisted.fileOrder.join(',')}).`,
  );
  assert(persisted.sheetZoom === '110%', `Sheet zoom did not survive restart (${persisted.sheetZoom}).`);
  assert(
    persisted.annotationLabels.includes('Smoke phrase')
      && persisted.annotationLabels.includes('Smoke manual')
      && persisted.annotationLabels.includes('Smoke manual two')
      && persisted.annotations.some((annotation) => (
        annotation.label === 'Smoke phrase'
        && annotation.body === 'Edited and persisted in the rail.'
      )),
    `Accepted and manual annotations did not survive restart (${persisted.annotationLabels.join(',')}).`,
  );
  await closeCleanly(second, secondCDP);
  secondCDP.socket.close();
  assert(!second.output().includes('violates the following Content Security Policy'), (
    `Electron reported a CSP violation after restart:\n${second.output()}`
  ));

  console.log('Electron smoke passed: proposal lifecycle, in-place annotation rail editing, collision-free chord badges, paused seeking, chat-deletion isolation, clean restart, and workspace persistence.');
} finally {
  for (const child of launchedChildren) child.kill('SIGTERM');
  // Chromium helper processes can finish a final profile write just after the
  // browser process exits, so let recursive removal retry that short race.
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 100,
  });
}
