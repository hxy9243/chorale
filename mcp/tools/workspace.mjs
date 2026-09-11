import { spawn } from 'node:child_process';
import { z } from 'zod';
import { scoreSummary } from '../store.mjs';

const WORKSPACE_URI = 'ui://chorale/workspace-v1.html';

const result = (structuredContent, text) => ({
  structuredContent,
  content: [{ type: 'text', text }],
});

const failure = (error) => ({
  isError: true,
  structuredContent: { errorCode: error?.code || 'WORKSPACE_ERROR' },
  content: [{ type: 'text', text: error instanceof Error ? error.message : 'Workspace operation failed.' }],
});

export const launchBrowserCommand = (command, args) => new Promise((resolveOpen) => {
  let child;
  try {
    child = spawn(command, args, { detached: true, stdio: 'ignore' });
  } catch {
    resolveOpen(false);
    return;
  }
  child.once('error', () => resolveOpen(false));
  child.once('spawn', () => {
    child.unref();
    resolveOpen(true);
  });
});

/**
 * Opens URL in the user's browser, preferring agent harness built-in browser if available.
 */
export const openBrowser = async (url) => {
  // If running inside Codex harness with explicit browser candidate
  if (process.env.CODEX_BROWSER_COMMAND) {
    if (await launchBrowserCommand(process.env.CODEX_BROWSER_COMMAND, [url])) return true;
  }

  const platformCandidates = process.platform === 'darwin'
    ? [['open', [url]]]
    : process.platform === 'win32'
      ? [['cmd', ['/c', 'start', '', url]]]
      : [
          ['xdg-open', [url]],
          ['google-chrome', [url]],
          ['chromium', [url]],
          ['chromium-browser', [url]],
          ['firefox', [url]],
        ];

  for (const [cmd, args] of platformCandidates) {
    if (await launchBrowserCommand(cmd, args)) return true;
  }
  return false;
};

export const createWorkspaceTools = (store, views, port = 1685) => {
  const resolvedPort = () => typeof port === 'function' ? port() : port;
  const handlers = {
    open_ui: async ({ documentId } = {}) => {
      try {
        const query = documentId ? `?file=${encodeURIComponent(documentId)}` : '';
        const url = `http://127.0.0.1:${resolvedPort()}/${query}`;
        const opened = await openBrowser(url);

        return result({
          url,
          opened,
          documentId: documentId || null,
        }, opened ? `Opened Chorale workspace at ${url}.` : `Chorale workspace is ready at ${url}.`);
      } catch (error) {
        return failure(error);
      }
    },

    get_workspace_state: async () => {
      try {
        const workspace = await store.getWorkspace();
        const connected = views.listConnected();
        let activeView = null;
        try {
          activeView = views.resolve();
        } catch {
          // No view connected
        }

        return result({
          documentCount: workspace.documents.length,
          connectedViewsCount: connected.length,
          activeView,
        }, `Workspace has ${workspace.documents.length} score(s)${activeView ? `, focused view: "${activeView.title}"` : ''}.`);
      } catch (error) {
        return failure(error);
      }
    },

    render_score_workspace: async ({ documentId }) => {
      try {
        const doc = await store.require(documentId);
        const summary = scoreSummary(doc);
        return {
          ...result(summary, `Opened score "${doc.title}".`),
          _meta: {
            ui: { resourceUri: WORKSPACE_URI },
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
  };

  const schemas = {
    open_ui: {
      title: 'Open Chorale UI',
      description: 'Launch the Chorale interactive score workspace on port 1685 in the user’s browser (preferring agent harness browser), optionally activating a score.',
      inputSchema: {
        documentId: z.string().optional().describe('Optional score document ID to open and activate in the workspace'),
      },
    },

    get_workspace_state: {
      title: 'Get workspace state',
      description: 'Query overall workspace state: score count, connected views count, and focused view summary.',
    },

    render_score_workspace: {
      title: 'Open Chorale workspace',
      description: 'Render the selected score in an interactive MCP Apps workspace view.',
      inputSchema: {
        documentId: z.string().min(1).describe('The unique score document ID to render'),
      },
      _meta: {
        ui: { resourceUri: WORKSPACE_URI },
        'openai/toolInvocation/invoking': 'Opening score…',
        'openai/toolInvocation/invoked': 'Score opened.',
      },
    },
  };

  return { handlers, schemas };
};
