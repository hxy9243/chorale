import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LocalDocumentStore } from './store.mjs';
import { ViewSnapshotStore } from './views.mjs';
import { createFileManagementTools } from './tools/file-management.mjs';
import { createSheetManagementTools } from './tools/sheet-management.mjs';
import { createWorkspaceTools } from './tools/workspace.mjs';

const WORKSPACE_URI = 'ui://chorale/workspace-v1.html';

const workspaceHtml = `<!doctype html><html><body style="margin:0;background:#f6f0e6;color:#2e2925;font:14px system-ui"><main style="padding:16px"><h1 style="font-family:Georgia,serif;margin-top:0">Chorale</h1><div id="score">Loading score…</div></main><script>window.addEventListener('message',(event)=>{if(event.source!==parent)return;const data=event.data;if(data?.method!=='ui/notifications/tool-result')return;const score=data.params?.structuredContent;document.querySelector('#score').textContent=score?score.title+' · '+score.measureCount+' measures · revision '+score.revision:'No score selected.'},{passive:true});</script></body></html>`;

export const createMcpServer = (
  store = new LocalDocumentStore(),
  views = new ViewSnapshotStore(),
  port = 1685,
  handlersOverride = null,
) => {
  store.setViews(views);
  const server = new McpServer({ name: 'Chorale', version: '1.0.0' });

  // Workspace UI Resource
  server.registerResource('chorale-workspace', WORKSPACE_URI, {}, async () => ({
    contents: [{
      uri: WORKSPACE_URI,
      mimeType: 'text/html;profile=mcp-app',
      text: workspaceHtml,
      _meta: { ui: { prefersBorder: false } },
    }],
  }));

  const fileTools = createFileManagementTools(store);
  const sheetTools = createSheetManagementTools(store, views);
  const workspaceTools = createWorkspaceTools(store, views, port);

  const schemas = {
    ...fileTools.schemas,
    ...sheetTools.schemas,
    ...workspaceTools.schemas,
  };
  const localHandlers = {
    ...fileTools.handlers,
    ...sheetTools.handlers,
    ...workspaceTools.handlers,
  };
  const handlers = handlersOverride || localHandlers;

  for (const [name, schema] of Object.entries(schemas)) {
    server.registerTool(name, schema, handlers[name]);
  }

  return { server, store, views, handlers, schemas };
};
