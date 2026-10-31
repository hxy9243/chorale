import { contextBridge, ipcRenderer } from 'electron';
import type {
  AIEvent,
  AISelection,
  ChoraleAIBridge,
  SaveAIConnectionInput,
  SheetAgentRequest,
  SheetAgentSteerRequest,
} from '../src/agent/aiTypes';
import type { SavePdfFileRequest, SaveTextFileRequest } from '../src/types/fileBridge';
import { AI_IPC, FILE_IPC, SCAN_IPC, MCP_IPC } from './ipcChannels';
import type { McpIntegrationBridge } from '../src/types/mcpIntegration';
import type { ScoreScanBridge } from '../src/types/scoreScan';

const scanBridge: ScoreScanBridge = {
  status: () => ipcRenderer.invoke(SCAN_IPC.status),
  scan: (request) => ipcRenderer.invoke(SCAN_IPC.scan, request),
  start: (request) => ipcRenderer.invoke(SCAN_IPC.start, request),
  listJobs: () => ipcRenderer.invoke(SCAN_IPC.listJobs),
  result: (jobId) => ipcRenderer.invoke(SCAN_IPC.result, jobId),
  fail: (jobId, message) => ipcRenderer.invoke(SCAN_IPC.fail, jobId, message),
  dismiss: (jobId) => ipcRenderer.invoke(SCAN_IPC.dismiss, jobId),
  cancel: (jobId) => ipcRenderer.invoke(SCAN_IPC.cancel, jobId),
  openSourceFolder: (jobId) => ipcRenderer.invoke(SCAN_IPC.openSourceFolder, jobId),
};

const filesBridge = {
  saveTextFile: (request: SaveTextFileRequest) => (
    ipcRenderer.invoke(FILE_IPC.saveTextFile, request)
  ),
  savePdfFile: (request: SavePdfFileRequest) => (
    ipcRenderer.invoke(FILE_IPC.savePdfFile, request)
  ),
};


const bridge: ChoraleAIBridge = {
  listConnections: () => ipcRenderer.invoke(AI_IPC.listConnections),
  saveConnection: (input: SaveAIConnectionInput) => (
    ipcRenderer.invoke(AI_IPC.saveConnection, input)
  ),
  deleteConnection: (connectionId: string) => (
    ipcRenderer.invoke(AI_IPC.deleteConnection, connectionId)
  ),
  refreshModels: (connectionId: string) => (
    ipcRenderer.invoke(AI_IPC.refreshModels, connectionId)
  ),
  getCachedModels: (connectionId: string) => (
    ipcRenderer.invoke(AI_IPC.getCachedModels, connectionId)
  ),
  getAnalysisSelection: () => ipcRenderer.invoke(AI_IPC.getAnalysisSelection),
  setAnalysisSelection: selection => ipcRenderer.invoke(AI_IPC.setAnalysisSelection, selection),
  getAnalysis: documentId => ipcRenderer.invoke(AI_IPC.getAnalysis, documentId),
  observeAnalysis: context => ipcRenderer.invoke(AI_IPC.observeAnalysis, context),
  setAnalysisPreferences: (documentId, preferences) => ipcRenderer.invoke(AI_IPC.setAnalysisPreferences, documentId, preferences),
  requestAnalysis: request => ipcRenderer.invoke(AI_IPC.requestAnalysis, request),
  stopAnalysis: documentId => ipcRenderer.invoke(AI_IPC.stopAnalysis, documentId),
  removeAnalysis: documentId => ipcRenderer.invoke(AI_IPC.removeAnalysis, documentId),
  getSelection: () => ipcRenderer.invoke(AI_IPC.getSelection),
  setSelection: (selection: AISelection | null) => (
    ipcRenderer.invoke(AI_IPC.setSelection, selection)
  ),
  openTraceDirectory: () => ipcRenderer.invoke(AI_IPC.openTraceDirectory),
  startCodexLogin: () => ipcRenderer.invoke(AI_IPC.startCodexLogin),
  cancelCodexLogin: (flowId: string) => (
    ipcRenderer.invoke(AI_IPC.cancelCodexLogin, flowId)
  ),
  logoutConnection: (connectionId: string) => (
    ipcRenderer.invoke(AI_IPC.logoutConnection, connectionId)
  ),
  sendChat: (request: SheetAgentRequest) => ipcRenderer.invoke(AI_IPC.sendChat, request),
  steerChat: (requestId: string, steer: SheetAgentSteerRequest) => (
    ipcRenderer.invoke(AI_IPC.steerChat, requestId, steer)
  ),
  abortChat: (requestId: string) => ipcRenderer.invoke(AI_IPC.abortChat, requestId),
  onAIEvent: (listener: (event: AIEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: AIEvent) => listener(payload);
    ipcRenderer.on(AI_IPC.event, wrapped);
    return () => ipcRenderer.removeListener(AI_IPC.event, wrapped);
  },
};

contextBridge.exposeInMainWorld('choraleAI', bridge);
contextBridge.exposeInMainWorld('choraleFiles', filesBridge);
contextBridge.exposeInMainWorld('choraleScan', scanBridge);
const mcpBridge: McpIntegrationBridge = {
  offerSetup: () => ipcRenderer.invoke(MCP_IPC.offerSetup),
  preview: (client) => ipcRenderer.invoke(MCP_IPC.preview, client),
  connect: (previewId) => ipcRenderer.invoke(MCP_IPC.connect, previewId),
  openGuide: () => ipcRenderer.invoke(MCP_IPC.openGuide),
  onOpenSettings: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on(MCP_IPC.openSettings, wrapped);
    return () => ipcRenderer.removeListener(MCP_IPC.openSettings, wrapped);
  },
};
contextBridge.exposeInMainWorld('choraleMcp', mcpBridge);
