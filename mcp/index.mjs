import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LocalDocumentStore } from './store.mjs';
import { ViewSnapshotStore } from './views.mjs';
import { createFileManagementTools } from './tools/file-management.mjs';
import { createSheetManagementTools } from './tools/sheet-management.mjs';
import { createWorkspaceTools } from './tools/workspace.mjs';

const WORKSPACE_URI = 'ui://chorale/workspace-v1.html';

const workspaceHtml = `<!doctype html><html><body style="margin:0;background:#f6f0e6;color:#2e2925;font:14px system-ui"><main style="padding:16px"><h1 style="font-family:Georgia,serif;margin-top:0">Chorale</h1><div id="score">Loading score…</div></main><script>window.addEventListener('message',(event)=>{if(event.source!==parent)return;const data=event.data;if(data?.method!=='ui/notifications/tool-result')return;const score=data.params?.structuredContent;document.querySelector('#score').textContent=score?score.title+' · '+score.measureCount+' measures · revision '+score.revision:'No score selected.'},{passive:true});</script></body></html>`;

export const createMcpServer = (store = new LocalDocumentStore(), views = new ViewSnapshotStore(), port = 1685) => {
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

  // 1. File Management Tools
  for (const [name, schema] of Object.entries(fileTools.schemas)) {
    const handler = fileTools.handlers[name];
    if (schema.inputSchema) {
      server.registerTool(name, schema, handler);
    } else {
      server.registerTool(name, schema, handler);
    }
  }

  // 2. Sheet Management Tools
  for (const [name, schema] of Object.entries(sheetTools.schemas)) {
    const handler = sheetTools.handlers[name];
    if (schema.inputSchema) {
      server.registerTool(name, schema, handler);
    } else {
      server.registerTool(name, schema, handler);
    }
  }

  // 3. Workspace Tools
  for (const [name, schema] of Object.entries(workspaceTools.schemas)) {
    const handler = workspaceTools.handlers[name];
    if (schema.inputSchema) {
      server.registerTool(name, schema, handler);
    } else {
      server.registerTool(name, schema, handler);
    }
  }

  // Backward compatibility aliases
  // create_score -> create_new_file
  server.registerTool('create_score', fileTools.schemas.create_new_file, fileTools.handlers.create_new_file);
  // list_scores -> list_files
  server.registerTool('list_scores', fileTools.schemas.list_files, fileTools.handlers.list_files);
  // read_measure_range / read_measure_selection -> read_measure
  server.registerTool('read_measure_range', sheetTools.schemas.read_measure, sheetTools.handlers.read_measure);
  server.registerTool('read_measure_selection', sheetTools.schemas.read_measure, sheetTools.handlers.read_measure);
  // edit_score -> edit_measure (or whole score update)
  server.registerTool('edit_score', {
    title: 'Edit score',
    description: 'Update the ABC source of a score.',
    inputSchema: {
      documentId: fileTools.schemas.create_new_file.inputSchema.title,
      replacementAbc: fileTools.schemas.create_new_file.inputSchema.title,
      summary: fileTools.schemas.create_new_file.inputSchema.title.optional(),
      expectedRevision: fileTools.schemas.create_new_file.inputSchema.title.optional(),
    },
  }, async (input) => {
    const doc = await store.update(input.documentId, {
      abcSource: input.replacementAbc,
      expectedRevision: typeof input.expectedRevision === 'number' ? input.expectedRevision : undefined,
    });
    return {
      structuredContent: { documentId: doc.id, revision: doc.revision },
      content: [{ type: 'text', text: `Updated score "${doc.title}".` }],
    };
  });
  // add_annotations -> add_notation
  server.registerTool('add_annotations', sheetTools.schemas.add_notation, (input) => sheetTools.handlers.add_notation({
    documentId: input.documentId,
    expectedRevision: input.expectedRevision,
    notations: input.annotations || input.notations || [],
  }));
  // open_chorale_ui -> open_ui
  server.registerTool('open_chorale_ui', workspaceTools.schemas.open_ui, workspaceTools.handlers.open_ui);

  const aggregatedHandlers = {
    ...fileTools.handlers,
    ...sheetTools.handlers,
    ...workspaceTools.handlers,
    create_score: fileTools.handlers.create_new_file,
    list_scores: fileTools.handlers.list_files,
    read_measure_range: sheetTools.handlers.read_measure,
    read_measure_selection: sheetTools.handlers.read_measure,
    add_annotations: (input) => sheetTools.handlers.add_notation({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      notations: input.annotations || input.notations || [],
    }),
    open_chorale_ui: workspaceTools.handlers.open_ui,
  };

  return { server, store, views, handlers: aggregatedHandlers };
};
