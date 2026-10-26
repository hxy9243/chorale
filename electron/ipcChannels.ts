export const AI_IPC = {
  listConnections: 'chorale-ai:list-connections',
  saveConnection: 'chorale-ai:save-connection',
  deleteConnection: 'chorale-ai:delete-connection',
  refreshModels: 'chorale-ai:refresh-models',
  getCachedModels: 'chorale-ai:get-cached-models',
  getSelection: 'chorale-ai:get-selection',
  setSelection: 'chorale-ai:set-selection',
  openTraceDirectory: 'chorale-ai:open-trace-directory',
  startCodexLogin: 'chorale-ai:start-codex-login',
  cancelCodexLogin: 'chorale-ai:cancel-codex-login',
  logoutConnection: 'chorale-ai:logout-connection',
  sendChat: 'chorale-ai:send-chat',
  steerChat: 'chorale-ai:steer-chat',
  abortChat: 'chorale-ai:abort-chat',
  event: 'chorale-ai:event',
} as const;

export const FILE_IPC = {
  saveTextFile: 'chorale-file:save-text',
  savePdfFile: 'chorale-file:save-pdf',
} as const;

export const SCAN_IPC = {
  status: 'chorale-scan:status',
  start: 'chorale-scan:start',
  listJobs: 'chorale-scan:list-jobs',
  result: 'chorale-scan:result',
  fail: 'chorale-scan:fail',
  dismiss: 'chorale-scan:dismiss',
  scan: 'chorale-scan:scan',
  cancel: 'chorale-scan:cancel',
  openSourceFolder: 'chorale-scan:open-source-folder',
} as const;

export const MCP_IPC = {
  offerSetup: 'chorale-mcp:offer-setup',
  preview: 'chorale-mcp:preview',
  connect: 'chorale-mcp:connect',
  openGuide: 'chorale-mcp:open-guide',
  openSettings: 'chorale-mcp:open-settings',
} as const;
