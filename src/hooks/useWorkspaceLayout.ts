import { useCallback, useEffect, useMemo, useState } from 'react';
import { useResizablePanel } from './useResizablePanel';
import {
  clampEditorPanelWidth,
  clampChatPanelWidth,
  clampFileRailWidth,
  defaultFileRailWidth,
  fitWorkspacePanelLayout,
} from '../utils/workspaceSizing';
import { storageAdapter } from '../utils/storageAdapter';

export const EDITOR_VISIBLE_KEY = 'chorale.workspace.editorVisible';
export const EDITOR_WIDTH_KEY = 'chorale.workspace.editorWidth';
export const CHAT_OPEN_KEY = 'chorale.workspace.chatOpen';
export const CHAT_WIDTH_KEY = 'chorale.workspace.chatWidth';
export const FILE_RAIL_WIDTH_KEY = 'chorale.workspace.fileRailWidth';
export const FILE_RAIL_COLLAPSED_KEY = 'chorale.workspace.fileRailCollapsed';
export const FILE_RAIL_ACTIVE_PANEL_KEY = 'chorale.workspace.fileRailActivePanel';
export const SHEET_ZOOM_KEY = 'chorale.workspace.sheetZoom';

export type RailPanelId = 'files' | 'tools';

const DEFAULT_RAIL_PANEL: RailPanelId = 'files';

const DEFAULT_EDITOR_WIDTH = 420;
const DEFAULT_SHEET_ZOOM = 100;
const MIN_SHEET_ZOOM = 50;
const MAX_SHEET_ZOOM = 200;

export const clampSheetZoom = (zoom: number) => Math.max(MIN_SHEET_ZOOM, Math.min(MAX_SHEET_ZOOM, zoom));

const readStoredBool = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
};

const readStoredRailPanel = (key: string): RailPanelId => {
  if (typeof window === 'undefined') return DEFAULT_RAIL_PANEL;
  return window.localStorage.getItem(key) === 'tools' ? 'tools' : DEFAULT_RAIL_PANEL;
};

const readStoredNumber = (
  key: string,
  fallback: number,
  clamp: (value: number) => number,
) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? clamp(value) : fallback;
};

export const useWorkspaceLayout = (interfaceZoom: { zoom: number }) => {
  const layoutViewportWidth = useCallback(
    () => window.innerWidth * 100 / interfaceZoom.zoom,
    [interfaceZoom.zoom],
  );

  const [layoutWidth, setLayoutWidth] = useState(() => layoutViewportWidth());
  const [chatOpen, setChatOpen] = useState<boolean>(() => readStoredBool(CHAT_OPEN_KEY, true));
  const [editorVisible, setEditorVisible] = useState<boolean>(() => readStoredBool(EDITOR_VISIBLE_KEY, false));
  const [zoom, setZoom] = useState<number>(() => (
    readStoredNumber(SHEET_ZOOM_KEY, DEFAULT_SHEET_ZOOM, clampSheetZoom)
  ));
  const [editorWidth, setEditorWidth] = useState<number>(() => (
    readStoredNumber(EDITOR_WIDTH_KEY, DEFAULT_EDITOR_WIDTH, clampEditorPanelWidth)
  ));
  const [railWidth, setRailWidth] = useState<number>(() => (
    readStoredNumber(
      FILE_RAIL_WIDTH_KEY,
      defaultFileRailWidth(layoutViewportWidth()),
      clampFileRailWidth,
    )
  ));
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => (
    readStoredBool(FILE_RAIL_COLLAPSED_KEY, false)
  ));
  const [railActivePanel, setRailActivePanel] = useState<RailPanelId>(() => (
    readStoredRailPanel(FILE_RAIL_ACTIVE_PANEL_KEY)
  ));
  const [chatWidth, setChatWidth] = useState<number>(() => (
    readStoredNumber(
      CHAT_WIDTH_KEY,
      clampChatPanelWidth(392, layoutViewportWidth()),
      (width) => clampChatPanelWidth(width, layoutViewportWidth()),
    )
  ));
  const [globalPreferencesReady, setGlobalPreferencesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const values = await Promise.all([
        storageAdapter.getGlobalPreference<boolean>(EDITOR_VISIBLE_KEY), storageAdapter.getGlobalPreference<number>(EDITOR_WIDTH_KEY),
        storageAdapter.getGlobalPreference<number>(SHEET_ZOOM_KEY), storageAdapter.getGlobalPreference<number>(FILE_RAIL_WIDTH_KEY),
        storageAdapter.getGlobalPreference<boolean>(FILE_RAIL_COLLAPSED_KEY), storageAdapter.getGlobalPreference<RailPanelId>(FILE_RAIL_ACTIVE_PANEL_KEY),
        storageAdapter.getGlobalPreference<boolean>(CHAT_OPEN_KEY), storageAdapter.getGlobalPreference<number>(CHAT_WIDTH_KEY),
      ]);
      const entries = [
        [EDITOR_VISIBLE_KEY, values[0]], [EDITOR_WIDTH_KEY, values[1]], [SHEET_ZOOM_KEY, values[2]], [FILE_RAIL_WIDTH_KEY, values[3]],
        [FILE_RAIL_COLLAPSED_KEY, values[4]], [FILE_RAIL_ACTIVE_PANEL_KEY, values[5]], [CHAT_OPEN_KEY, values[6]], [CHAT_WIDTH_KEY, values[7]],
      ] as const;
      if (cancelled) return;
      for (const [key, value] of entries) {
        const preference = value as unknown;
        if (preference === null) continue;
        if (key === EDITOR_VISIBLE_KEY) setEditorVisible(Boolean(preference));
        if (key === EDITOR_WIDTH_KEY && typeof preference === 'number') setEditorWidth(clampEditorPanelWidth(preference));
        if (key === SHEET_ZOOM_KEY && typeof preference === 'number') setZoom(clampSheetZoom(preference));
        if (key === FILE_RAIL_WIDTH_KEY && typeof preference === 'number') setRailWidth(clampFileRailWidth(preference));
        if (key === FILE_RAIL_COLLAPSED_KEY) setRailCollapsed(Boolean(preference));
        if (key === FILE_RAIL_ACTIVE_PANEL_KEY && (preference === 'files' || preference === 'tools')) setRailActivePanel(preference);
        if (key === CHAT_OPEN_KEY) setChatOpen(Boolean(preference));
        if (key === CHAT_WIDTH_KEY && typeof preference === 'number') setChatWidth(clampChatPanelWidth(preference, layoutViewportWidth()));
      }
      setGlobalPreferencesReady(true);
    };
    void hydrate().catch(() => setGlobalPreferencesReady(true));
    return () => { cancelled = true; };
  }, [layoutViewportWidth]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_VISIBLE_KEY, String(editorVisible));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(EDITOR_VISIBLE_KEY, editorVisible);
  }, [editorVisible, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_WIDTH_KEY, String(editorWidth));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(EDITOR_WIDTH_KEY, editorWidth);
  }, [editorWidth, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(SHEET_ZOOM_KEY, String(zoom));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(SHEET_ZOOM_KEY, zoom);
  }, [zoom, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(FILE_RAIL_WIDTH_KEY, String(Math.round(railWidth)));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(FILE_RAIL_WIDTH_KEY, Math.round(railWidth));
  }, [railWidth, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(FILE_RAIL_COLLAPSED_KEY, String(railCollapsed));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(FILE_RAIL_COLLAPSED_KEY, railCollapsed);
  }, [railCollapsed, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(FILE_RAIL_ACTIVE_PANEL_KEY, railActivePanel);
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(FILE_RAIL_ACTIVE_PANEL_KEY, railActivePanel);
  }, [railActivePanel, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_OPEN_KEY, String(chatOpen));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(CHAT_OPEN_KEY, chatOpen);
  }, [chatOpen, globalPreferencesReady]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(chatWidth)));
    if (globalPreferencesReady) void storageAdapter.setGlobalPreference(CHAT_WIDTH_KEY, Math.round(chatWidth));
  }, [chatWidth, globalPreferencesReady]);

  useEffect(() => {
    const handleResize = () => {
      const nextLayoutWidth = layoutViewportWidth();
      setLayoutWidth(nextLayoutWidth);
      setChatWidth((current) => clampChatPanelWidth(current, nextLayoutWidth));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [layoutViewportWidth]);

  const { beginResize: beginEditorResize } = useResizablePanel({
    initialWidth: editorWidth,
    clampWidth: clampEditorPanelWidth,
    onWidthChange: setEditorWidth,
    direction: 'left',
  });

  const { beginResize: beginEditorResizeFromRight } = useResizablePanel({
    initialWidth: editorWidth,
    clampWidth: clampEditorPanelWidth,
    onWidthChange: setEditorWidth,
    direction: 'right',
  });

  const { beginResize: beginRailResize } = useResizablePanel({
    initialWidth: railWidth,
    clampWidth: clampFileRailWidth,
    onWidthChange: setRailWidth,
    direction: 'right',
  });

  const { beginResize: beginChatResize } = useResizablePanel({
    initialWidth: chatWidth,
    clampWidth: useCallback(
      (width: number) => clampChatPanelWidth(width, layoutViewportWidth()),
      [layoutViewportWidth],
    ),
    onWidthChange: setChatWidth,
    direction: 'left',
  });

  const fittedPanelLayout = useMemo(() => fitWorkspacePanelLayout({
    viewportWidth: layoutWidth,
    fileRailWidth: railWidth,
    chatPanelWidth: 0,
    editorPanelWidth: editorWidth,
    fileRailVisible: !railCollapsed,
    chatPanelVisible: false,
    editorPanelVisible: editorVisible,
  }), [editorVisible, editorWidth, layoutWidth, railCollapsed, railWidth]);

  return {
    zoom,
    setZoom,
    chatOpen,
    setChatOpen,
    editorVisible,
    setEditorVisible,
    editorWidth,
    railWidth,
    railCollapsed,
    setRailCollapsed,
    railActivePanel,
    setRailActivePanel,
    chatWidth,
    fittedPanelLayout,
    beginEditorResize,
    beginEditorResizeFromRight,
    beginRailResize,
    beginChatResize,
  };
};
