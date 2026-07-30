import { contextBridge, ipcRenderer } from 'electron';
import type {
  AIEvent,
  AISelection,
  ChoraleAIBridge,
  SaveAIConnectionInput,
  SheetAgentRequest,
} from '../src/agent/aiTypes';
import { AI_IPC } from './ipcChannels';

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
  startCodexLogin: () => ipcRenderer.invoke(AI_IPC.startCodexLogin),
  cancelCodexLogin: (flowId: string) => (
    ipcRenderer.invoke(AI_IPC.cancelCodexLogin, flowId)
  ),
  logoutConnection: (connectionId: string) => (
    ipcRenderer.invoke(AI_IPC.logoutConnection, connectionId)
  ),
  sendChat: (request: SheetAgentRequest) => ipcRenderer.invoke(AI_IPC.sendChat, request),
  abortChat: (requestId: string) => ipcRenderer.invoke(AI_IPC.abortChat, requestId),
  onAIEvent: (listener: (event: AIEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: AIEvent) => listener(payload);
    ipcRenderer.on(AI_IPC.event, wrapped);
    return () => ipcRenderer.removeListener(AI_IPC.event, wrapped);
  },
};

contextBridge.exposeInMainWorld('choraleAI', bridge);
