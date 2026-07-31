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
    await new Promise((resolve) => setTimeout(resolve, 100));
    const saveDeadline = Date.now() + 5000;
    while (
      Date.now() < saveDeadline
      && document.querySelector('.score-status-item.save')?.textContent !== 'Auto-saved'
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const sheetZoomBefore = sheet?.querySelector('.scale-val')?.textContent;
    sheet?.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const sheetZoomAfter = sheet?.querySelector('.scale-val')?.textContent;
    const interfaceZoomAfterSheet = document.documentElement.style.getPropertyValue('--ui-zoom');

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
    const threadChevron = threadTrigger?.querySelector('.agent-history-chevron');
    const threadTriggerStyle = threadTrigger ? getComputedStyle(threadTrigger) : null;
    const threadChevronStyle = threadChevron ? getComputedStyle(threadChevron) : null;
    const threadBorderWidth = threadTriggerStyle?.borderTopWidth ?? null;
    const threadBorderRadius = threadTriggerStyle?.borderTopLeftRadius ?? null;
    const threadTriggerFontSize = threadTriggerStyle?.fontSize ?? null;
    const threadTriggerAppearance = threadTriggerStyle?.appearance ?? null;
    const threadChevronBackground = threadChevronStyle?.backgroundColor ?? null;
    const threadChevronShadow = threadChevronStyle?.boxShadow ?? null;
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
      const store = JSON.parse(localStorage.getItem('chorale.pi-agent-conversation.v2') ?? 'null');
      const activeFileId = localStorage.getItem('chorale.workspace.activeFileId');
      const fileConversation = activeFileId ? store?.files?.[activeFileId] : null;
      return {
        id: fileConversation?.activeThreadId ?? null,
        count: fileConversation?.threads?.length ?? 0,
      };
    };
    const threadBeforeDelete = readActiveThread();
    document.querySelector('[aria-label="Delete current thread"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const threadAfterDelete = readActiveThread();
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
      settingsFrames: [settingsRect, appearanceRect, aboutRect].map((rect) => rect && ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      })),
      providerCount: provider?.querySelectorAll('option').length ?? 0,
      sheetZoomBefore,
      sheetZoomAfter,
      interfaceZoomAfterSheet,
      fileRailWidthDefault,
      expectedFileRailWidth,
      fileRailWidth,
      chatWidth,
      chatWidthLimit,
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
      agentFontSize,
      threadBorderWidth,
      threadBorderRadius,
      threadTriggerFontSize,
      threadTriggerAppearance,
      threadChevronBackground,
      threadChevronShadow,
      threadChevronCount,
      hasThreadDelete,
      threadIdBeforeDelete: threadBeforeDelete.id,
      threadIdAfterDelete: threadAfterDelete.id,
      threadCountAfterDelete: threadAfterDelete.count,
      suggestionsWidth,
      transcriptWidth,
      tryAskingTopRatio,
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
    Math.abs(shellState.chatWidth - shellState.chatWidthLimit) <= 1,
    'Chat panel did not resize to one third of the viewport.',
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
    shellState.threadRowWidth >= shellState.chatWidth - 40
      && shellState.threadWidth >= shellState.threadRowWidth - 60,
    `Thread history row is still too narrow (${shellState.threadWidth}px selector, ${shellState.threadRowWidth}px row in ${shellState.chatWidth}px panel).`,
  );
  assert(
    shellState.agentFontSize === '16px' && shellState.threadTriggerFontSize === '16px',
    `Chat defaults are not approximately 12 pt (${shellState.agentFontSize}, trigger ${shellState.threadTriggerFontSize}).`,
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
      && shellState.threadTriggerAppearance === 'none'
      && shellState.threadChevronCount === 1,
    `Thread selector styling is incomplete (${shellState.threadBorderWidth}, radius ${shellState.threadBorderRadius}, chevron ${shellState.threadChevronBackground}/${shellState.threadChevronShadow}, appearance ${shellState.threadTriggerAppearance}, chevrons ${shellState.threadChevronCount}).`,
  );
  assert(shellState.hasThreadDelete, 'Thread history does not expose a delete action.');
  assert(
    shellState.threadIdBeforeDelete
      && shellState.threadIdAfterDelete
      && shellState.threadIdBeforeDelete !== shellState.threadIdAfterDelete
      && shellState.threadCountAfterDelete === 1,
    `Deleting the final thread did not create one fresh replacement (${shellState.threadIdBeforeDelete} -> ${shellState.threadIdAfterDelete}, count ${shellState.threadCountAfterDelete}).`,
  );
  assert(
    shellState.suggestionsWidth < shellState.transcriptWidth * 0.95,
    `Try Asking group is not narrower than the transcript (${shellState.suggestionsWidth}px).`,
  );
  assert(
    Number.isFinite(shellState.tryAskingTopRatio)
      && shellState.tryAskingTopRatio >= 0.18
      && shellState.tryAskingTopRatio <= 0.35,
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
  await closeCleanly(first, firstCDP);
  firstCDP.socket.close();
  assert(!first.output().includes('violates the following Content Security Policy'), (
    `Electron reported a CSP violation:\n${first.output()}`
  ));

  const second = await launch(profileDirectory);
  const secondCDP = await connectCDP(second.target.webSocketDebuggerUrl);
  const persisted = await secondCDP.evaluate(`(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        if (document.readyState !== 'loading') {
          const value = localStorage.getItem('chorale.electron-smoke');
          const showChat = document.querySelector('[title="Show score chat"]');
          if (value !== null && showChat) {
            const initiallyOpen = Boolean(document.querySelector('[aria-label="Current sheet assistant"]'));
            showChat.click();
            await new Promise((resolve) => setTimeout(resolve, 25));
            return {
              value,
              initiallyOpen,
              reopened: Boolean(document.querySelector('[aria-label="Current sheet assistant"]')),
              reopenedWidth: document.querySelector('.right-panel')?.getBoundingClientRect().width,
              storedWidth: Number(localStorage.getItem('chorale.workspace.chatWidth')),
              fileRailWidth: document.querySelector('.file-rail')?.getBoundingClientRect().width,
              storedFileRailWidth: Number(localStorage.getItem('chorale.workspace.fileRailWidth')),
              sheetZoom: document.querySelector('.scale-val')?.textContent,
              interfaceZoom: Number(getComputedStyle(document.body).zoom),
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
    Math.abs(persisted.reopenedWidth - persisted.storedWidth * persisted.interfaceZoom) <= 1,
    `Reopened chat did not restore its persisted width (${persisted.reopenedWidth} vs ${persisted.storedWidth}).`,
  );
  assert(
    Math.abs(persisted.fileRailWidth - persisted.storedFileRailWidth * persisted.interfaceZoom) <= 1,
    `File rail did not restore its persisted width (${persisted.fileRailWidth} vs ${persisted.storedFileRailWidth}).`,
  );
  assert(persisted.sheetZoom === '110%', `Sheet zoom did not survive restart (${persisted.sheetZoom}).`);
  await closeCleanly(second, secondCDP);
  secondCDP.socket.close();
  assert(!second.output().includes('violates the following Content Security Policy'), (
    `Electron reported a CSP violation after restart:\n${second.output()}`
  ));

  console.log('Electron smoke passed: app protocol, sandboxed bridge, centered score, settings UI, clean restart, and workspace persistence.');
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
