import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AIConnectionPublic,
  AIEvent,
  AIModelOption,
  AISelection,
  OAuthUpdateDetails,
  SaveAIConnectionInput,
} from './aiTypes';

export type OAuthState = {
  flowId: string;
  status: Extract<AIEvent, { type: 'oauth-update' }>['status'];
  details?: OAuthUpdateDetails;
};

export type AIProviderState = {
  desktopAvailable: boolean;
  loading: boolean;
  connections: AIConnectionPublic[];
  selection: AISelection | null;
  modelsByConnection: Record<string, AIModelOption[]>;
  oauth: OAuthState | null;
  error: string | null;
  reload(): Promise<void>;
  saveConnection(input: SaveAIConnectionInput): Promise<AIConnectionPublic>;
  deleteConnection(connectionId: string): Promise<void>;
  refreshModels(connectionId: string): Promise<AIModelOption[]>;
  setSelection(selection: AISelection | null): Promise<void>;
  openTraceDirectory(): Promise<void>;
  startCodexLogin(): Promise<void>;
  cancelCodexLogin(): Promise<void>;
};

const messageFromError = (error: unknown) => (
  error instanceof Error ? error.message : 'The AI provider operation failed.'
);

const getBridge = () => (typeof window === 'undefined' ? undefined : window.choraleAI);

export const useAIProviders = (): AIProviderState => {
  const [bridge, setBridge] = useState(getBridge);
  const [loading, setLoading] = useState(Boolean(bridge));
  const [connections, setConnections] = useState<AIConnectionPublic[]>([]);
  const [selection, setSelectionState] = useState<AISelection | null>(null);
  const [modelsByConnection, setModelsByConnection] = useState<Record<string, AIModelOption[]>>({});
  const [oauth, setOAuth] = useState<OAuthState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = getBridge();
    setBridge(current);
    setLoading(Boolean(current));
  }, []);

  const reload = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    try {
      const [nextConnections, nextSelection] = await Promise.all([
        bridge.listConnections(),
        bridge.getSelection(),
      ]);
      const modelEntries = await Promise.all(nextConnections.map(async (connection) => (
        [connection.id, await bridge.getCachedModels(connection.id)] as const
      )));
      setConnections(nextConnections);
      setSelectionState(nextSelection);
      setModelsByConnection(Object.fromEntries(modelEntries));
      setError(null);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onAIEvent((event) => {
      if (event.type !== 'oauth-update') return;
      setOAuth({
        flowId: event.flowId,
        status: event.status,
        details: event.details,
      });
      if (event.status === 'complete') void reload();
    });
  }, [bridge, reload]);

  const saveConnection = useCallback(async (input: SaveAIConnectionInput) => {
    if (!bridge) throw new Error('AI providers require the Chorale desktop app.');
    const connection = await bridge.saveConnection(input);
    await reload();
    return connection;
  }, [bridge, reload]);

  const deleteConnection = useCallback(async (connectionId: string) => {
    if (!bridge) return;
    await bridge.deleteConnection(connectionId);
    await reload();
  }, [bridge, reload]);

  const refreshModels = useCallback(async (connectionId: string) => {
    if (!bridge) throw new Error('AI providers require the Chorale desktop app.');
    const models = await bridge.refreshModels(connectionId);
    setModelsByConnection((current) => ({ ...current, [connectionId]: models }));
    await reload();
    return models;
  }, [bridge, reload]);

  const setSelection = useCallback(async (nextSelection: AISelection | null) => {
    if (!bridge) return;
    await bridge.setSelection(nextSelection);
    setSelectionState(nextSelection);
  }, [bridge]);

  const openTraceDirectory = useCallback(async () => {
    if (!bridge) throw new Error('Agent traces require the Chorale desktop app.');
    await bridge.openTraceDirectory();
  }, [bridge]);

  const startCodexLogin = useCallback(async () => {
    if (!bridge) throw new Error('AI providers require the Chorale desktop app.');
    const result = await bridge.startCodexLogin();
    setOAuth((current) => (
      current?.flowId === result.flowId
        ? current
        : { flowId: result.flowId, status: 'starting' }
    ));
  }, [bridge]);

  const cancelCodexLogin = useCallback(async () => {
    if (!bridge || !oauth) return;
    await bridge.cancelCodexLogin(oauth.flowId);
    setOAuth((current) => current ? { ...current, status: 'cancelled' } : null);
  }, [bridge, oauth]);

  return useMemo(() => ({
    desktopAvailable: Boolean(bridge),
    loading,
    connections,
    selection,
    modelsByConnection,
    oauth,
    error,
    reload,
    saveConnection,
    deleteConnection,
    refreshModels,
    setSelection,
    openTraceDirectory,
    startCodexLogin,
    cancelCodexLogin,
  }), [
    bridge,
    loading,
    connections,
    selection,
    modelsByConnection,
    oauth,
    error,
    reload,
    saveConnection,
    deleteConnection,
    refreshModels,
    setSelection,
    openTraceDirectory,
    startCodexLogin,
    cancelCodexLogin,
  ]);
};
