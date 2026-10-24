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

