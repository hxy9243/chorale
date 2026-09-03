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
import { AI_IPC, FILE_IPC } from './ipcChannels';

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
