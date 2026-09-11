import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './index.mjs';
import { LocalDocumentStore, PluginError, scoreSummary } from './store.mjs';
import { ViewSnapshotStore } from './views.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = resolve(__dirname, '../dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const MAX_PAYLOAD_BYTES = 2_000_000;

const requestBody = async (request, limit = MAX_PAYLOAD_BYTES) => {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new PluginError('PAYLOAD_TOO_LARGE', 'Request exceeds payload limit.');
    chunks.push(chunk);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    throw new PluginError('INVALID_JSON', 'Request body must be valid JSON.');
  }
};

export const startServer = async (options = {}) => {
  const port = typeof options.port === 'number' ? options.port : (Number(process.env.CHORALE_PORT) || 1685);
  const store = options.store || new LocalDocumentStore();
  const views = options.views || new ViewSnapshotStore();
  const { server: mcpServer, handlers } = createMcpServer(store, views, port);

  const sseTransports = new Map();

  const httpServer = createHttpServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('access-control-allow-origin', origin || '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // Health check
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      res.setHeader('content-type', 'application/json');
      res.writeHead(200).end(JSON.stringify({
        service: 'chorale-service',
        version: '1.0.0',
        port,
        status: 'ok',
      }));
      return;
    }

    // MCP SSE Stream
    if (req.method === 'GET' && url.pathname === '/sse') {
      const transport = new SSEServerTransport('/messages', res);
      sseTransports.set(transport.sessionId, transport);
      transport.onclose = () => {
        sseTransports.delete(transport.sessionId);
      };
      await mcpServer.connect(transport);
      return;
    }

    // MCP SSE Messages receiver
    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      const transport = sseTransports.get(sessionId) || sseTransports.values().next().value;
      if (!transport) {
        res.setHeader('content-type', 'application/json');
        res.writeHead(404).end(JSON.stringify({ error: 'SSE session not found' }));
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    // Direct tool execution via REST
    const toolMatch = url.pathname.match(/^\/v1\/tools\/([A-Za-z0-9_-]{1,80})$/);
    if (req.method === 'POST' && toolMatch) {
      const [, toolName] = toolMatch;
      const handler = handlers[toolName];
      if (!handler) {
        res.setHeader('content-type', 'application/json');
        res.writeHead(404).end(JSON.stringify({ isError: true, errorCode: 'TOOL_NOT_FOUND' }));
        return;
      }
      try {
        const body = await requestBody(req);
        const result = await handler(body);
        res.setHeader('content-type', 'application/json');
        res.writeHead(result.isError ? 400 : 200).end(JSON.stringify(result));
      } catch (err) {
        res.setHeader('content-type', 'application/json');
        res.writeHead(500).end(JSON.stringify({ isError: true, content: [{ type: 'text', text: err.message }] }));
      }
      return;
    }

    // Workspace state
    if (req.method === 'GET' && url.pathname === '/v1/workspace') {
      try {
        res.setHeader('content-type', 'application/json');
        res.writeHead(200).end(JSON.stringify(await store.getWorkspace()));
      } catch (error) {
        res.writeHead(500).end(JSON.stringify({ errorCode: error.code || 'PERSISTENCE_FAILED' }));
      }
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/v1/workspace') {
      try {
        const ws = await requestBody(req);
        const saved = await store.putWorkspace(ws);
        res.setHeader('content-type', 'application/json');
        res.writeHead(200).end(JSON.stringify(saved));
      } catch (error) {
        res.setHeader('content-type', 'application/json');
        res.writeHead(error instanceof PluginError && error.code === 'REVISION_CONFLICT' ? 409 : 400)
          .end(JSON.stringify({ errorCode: error.code || 'INVALID_WORKSPACE', message: error.message }));
      }
      return;
    }

    // Workspace patches
    const prefMatch = url.pathname.match(/^\/v1\/workspace\/preferences\/([A-Za-z0-9._-]{1,160})$/);
    if (req.method === 'PUT' && (url.pathname === '/v1/workspace/documents' || url.pathname === '/v1/workspace/active-document' || prefMatch)) {
      try {
        const patch = await requestBody(req);
        const kind = url.pathname === '/v1/workspace/documents' ? 'documents' : url.pathname === '/v1/workspace/active-document' ? 'active' : 'preference';
        const next = await store.patchWorkspace({
          kind,
          key: prefMatch && decodeURIComponent(prefMatch[1]),
          value: kind === 'documents' ? patch.documents : kind === 'active' ? patch.activeFileId : patch.value,
          expectedRevision: patch.expectedRevision,
        });
        res.setHeader('content-type', 'application/json');
        res.writeHead(200).end(JSON.stringify(next));
      } catch (error) {
        res.setHeader('content-type', 'application/json');
        res.writeHead(error instanceof PluginError && error.code === 'REVISION_CONFLICT' ? 409 : 400)
          .end(JSON.stringify({ errorCode: error.code || 'INVALID_WORKSPACE' }));
      }
      return;
    }

    // Scores & files listing
    if (req.method === 'GET' && (url.pathname === '/v1/scores' || url.pathname === '/v1/files')) {
      try {
        const documents = await store.list();
        res.setHeader('content-type', 'application/json');
        res.writeHead(200).end(JSON.stringify({ scores: documents.map(scoreSummary), files: documents.map(scoreSummary) }));
      } catch (error) {
        res.writeHead(500).end(JSON.stringify({ errorCode: 'PERSISTENCE_FAILED' }));
      }
      return;
    }

    const scoreMatch = url.pathname.match(/^\/v1\/scores\/([A-Za-z0-9._-]{1,120})$/);
    if (req.method === 'GET' && scoreMatch) {
      try {
        const doc = await store.require(scoreMatch[1]);
        res.setHeader('content-type', 'application/json');
        res.writeHead(200).end(JSON.stringify(doc));
      } catch (error) {
        res.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'DOCUMENT_NOT_FOUND' }));
      }
      return;
    }

    // View bridge
    const viewMatch = url.pathname.match(/^\/v1\/views\/([A-Za-z0-9._-]{1,120})(?:\/commands(?:\/(cmd-[A-Za-z0-9-]+)\/ack)?)?$/);
    if (viewMatch) {
      const [, viewId, commandId] = viewMatch;
      if (req.method === 'GET' && !url.pathname.includes('/commands')) {
        try {
          const snapshot = views.require(viewId);
          res.setHeader('content-type', 'application/json');
          res.writeHead(200).end(JSON.stringify(snapshot));
        } catch (error) {
          res.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'VIEW_NOT_CONNECTED' }));
        }
        return;
      }
      if (req.method === 'GET' && url.pathname.endsWith('/commands')) {
        try {
          res.setHeader('content-type', 'application/json');
          res.writeHead(200).end(JSON.stringify({ commands: views.pending(viewId) }));
        } catch (error) {
          res.writeHead(404).end(JSON.stringify({ errorCode: error.code || 'VIEW_NOT_CONNECTED' }));
        }
        return;
      }
      if (req.method === 'POST' && !commandId && url.pathname.endsWith('/commands')) {
        try {
          const body = await requestBody(req);
          const cmd = views.queueCommand(viewId, body);
          res.setHeader('content-type', 'application/json');
          res.writeHead(200).end(JSON.stringify(cmd));
        } catch (error) {
          res.setHeader('content-type', 'application/json');
          res.writeHead(400).end(JSON.stringify({ errorCode: error.code || 'INVALID_COMMAND' }));
        }
        return;
      }
      if (req.method === 'POST' && commandId) {
        views.acknowledge(viewId, commandId);
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'PUT') {
        try {
          const body = await requestBody(req);
          const snapshot = views.update(viewId, body);
          res.setHeader('content-type', 'application/json');
          res.writeHead(200).end(JSON.stringify({ viewId, revision: snapshot.revision }));
        } catch (error) {
          res.setHeader('content-type', 'application/json');
          res.writeHead(400).end(JSON.stringify({ errorCode: error.code || 'INVALID_VIEW' }));
        }
        return;
      }
    }

    // Static Web UI serving
    if (req.method === 'GET') {
      const parsedPath = url.pathname === '/' ? '/index.html' : url.pathname;
      const candidatePath = join(DIST_DIR, parsedPath.replace(/^\//, ''));
      const indexPath = join(DIST_DIR, 'index.html');

      if (existsSync(candidatePath)) {
        try {
          const fileStat = await stat(candidatePath);
          if (fileStat.isFile()) {
            const content = await readFile(candidatePath);
            const ext = extname(candidatePath);
            res.setHeader('content-type', MIME_TYPES[ext] || 'application/octet-stream');
            res.writeHead(200).end(content);
            return;
          }
        } catch {
          // Fall through
        }
      }

      // SPA fallback to dist/index.html
      if (existsSync(indexPath)) {
        try {
          const content = await readFile(indexPath);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.writeHead(200).end(content);
          return;
        } catch {
          // Fall through
        }
      }

      // If dist/ has not been built yet, show welcome/status page
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.writeHead(200).end(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Chorale Music Workspace</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f141c; color: #f0f4fc; padding: 40px 20px; text-align: center; }
    .card { max-width: 560px; margin: 40px auto; background: #18202c; border: 1px solid #2b3648; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); text-align: left; }
    h1 { margin-top: 0; color: #8cb4ff; }
    code { background: #0d1117; padding: 2px 6px; border-radius: 4px; color: #7ee787; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Chorale Service is Running</h1>
    <p>Port: <strong>${port}</strong></p>
    <p>Local Storage: <code>~/.chorale/</code></p>
    <p>MCP SSE Endpoint: <code>/sse</code></p>
    <p>REST API: <code>/v1/workspace</code>, <code>/v1/scores</code>, <code>/v1/health</code></p>
    <hr style="border: 0; border-top: 1px solid #2b3648; margin: 20px 0;">
    <p>To view the full interactive workspace, build the frontend:</p>
    <pre style="background:#0d1117;padding:12px;border-radius:6px;overflow-x:auto;"><code>npm run build</code></pre>
  </div>
</body>
</html>`);
      return;
    }

    res.writeHead(404).end('Not found');
  });

  return new Promise((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, '127.0.0.1', () => {
      httpServer.off('error', rejectListen);
      const boundPort = httpServer.address().port;
      resolveListen({
        httpServer,
        port: boundPort,
        store,
        views,
        mcpServer,
        handlers,
      });
    });
  });
};
