import { validateAnalysisPreferences } from '../src/analysis/types';
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { AIEvent } from '../src/agent/aiTypes';
import type { AIController } from './ai/controller';
import { AI_IPC } from './ipcChannels';
import {
  assertShortId,
  isAllowedRendererUrl,
  validateChatRequest,
  validateMusicContext,
  validateSaveInput,
  validateSelection,
  validateSteerRequest,
} from './ipcValidation';

const assertSender = (
  event: IpcMainInvokeEvent,
  getWindow: () => BrowserWindow | null,
) => {
  const window = getWindow();
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('Refused AI request from an unexpected renderer.');
  }
  if (!isAllowedRendererUrl(event.senderFrame?.url ?? '')) {
    throw new Error('Refused AI request from an unexpected origin.');
  }
};

export const registerAIIPC = (
  controller: AIController,
  getWindow: () => BrowserWindow | null,
) => {
  const handle = <T extends unknown[]>(
    channel: string,
    argumentCount: number,
    listener: (event: IpcMainInvokeEvent, ...args: T) => unknown,
  ) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertSender(event, getWindow);
      if (args.length !== argumentCount) throw new Error('Invalid IPC argument count.');
      return listener(event, ...(args as T));
    });
  };

  const emit = (event: IpcMainInvokeEvent) => (payload: AIEvent) => {
    if (!event.sender.isDestroyed()) event.sender.send(AI_IPC.event, payload);
  };

  handle(AI_IPC.listConnections, 0, () => controller.listConnections());
  handle(AI_IPC.saveConnection, 1, (_event, input: unknown) => (
    controller.saveConnection(validateSaveInput(input))
  ));
  handle(AI_IPC.deleteConnection, 1, (_event, id: unknown) => (
    controller.deleteConnection(assertShortId(id, 'connection ID'))
  ));
  handle(AI_IPC.refreshModels, 1, (_event, id: unknown) => (
    controller.refreshModels(assertShortId(id, 'connection ID'))
  ));
  handle(AI_IPC.getCachedModels, 1, (_event, id: unknown) => (
    controller.getCachedModels(assertShortId(id, 'connection ID'))
  ));
  handle(AI_IPC.getAnalysisSelection, 0, () => controller.getAnalysisSelection());
  handle(AI_IPC.setAnalysisSelection, 1, (_event, selection: unknown) => controller.setAnalysisSelection(validateSelection(selection)));
  handle(AI_IPC.getAnalysis, 1, (_event, id: unknown) => controller.analysis.get(assertShortId(id, 'document ID')));
  handle(AI_IPC.observeAnalysis, 1, (_event, context: unknown) => controller.analysis.observe(validateMusicContext(context)));
  handle(AI_IPC.setAnalysisPreferences, 2, (_event, id: unknown, preferences: unknown) => controller.analysis.preferences(assertShortId(id, 'document ID'), validateAnalysisPreferences(preferences)));
  handle(AI_IPC.requestAnalysis, 1, (_event, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analysis request.');
    const request = value as Record<string, unknown>;
    if (request.force !== undefined && typeof request.force !== 'boolean') throw new Error('Invalid analysis request.');
    return controller.analysis.request({ context: validateMusicContext(request.context), force: request.force });
  });
  handle(AI_IPC.stopAnalysis, 1, (_event, id: unknown) => controller.analysis.stop(assertShortId(id, 'document ID')));
  handle(AI_IPC.removeAnalysis, 1, (_event, id: unknown) => controller.analysis.remove(assertShortId(id, 'document ID')));
  handle(AI_IPC.getSelection, 0, () => controller.getSelection());
  handle(AI_IPC.setSelection, 1, (_event, selection: unknown) => (
    controller.setSelection(validateSelection(selection))
  ));
  handle(AI_IPC.openTraceDirectory, 0, () => controller.openTraceDirectory());
  handle(AI_IPC.startCodexLogin, 0, (event) => controller.startCodexLogin(emit(event)));
  handle(AI_IPC.cancelCodexLogin, 1, (_event, flowId: unknown) => (
    controller.cancelCodexLogin(assertShortId(flowId, 'OAuth flow ID'))
  ));
  handle(AI_IPC.logoutConnection, 1, (_event, id: unknown) => (
    controller.logoutConnection(assertShortId(id, 'connection ID'))
  ));
  handle(AI_IPC.sendChat, 1, (event, request: unknown) => (
    controller.sendChat(validateChatRequest(request), emit(event))
  ));
  handle(AI_IPC.steerChat, 2, (_event, requestId: unknown, steer: unknown) => {
    const validated = validateSteerRequest(requestId, steer);
    return controller.steerChat(validated.requestId, validated.steer);
  });
  handle(AI_IPC.abortChat, 1, (_event, requestId: unknown) => (
    controller.abortChat(assertShortId(requestId, 'chat request ID'))
  ));

  return () => {
    for (const channel of Object.values(AI_IPC)) {
      if (channel !== AI_IPC.event) ipcMain.removeHandler(channel);
    }
  };
};
