import { useCallback, useEffect, useMemo, useState } from 'react';
import { useResizablePanel } from './useResizablePanel';
import {
  clampEditorPanelWidth,
  clampChatPanelWidth,
  clampFileRailWidth,
  defaultFileRailWidth,
  fitWorkspacePanelLayout,
} from '../utils/workspaceSizing';

export const EDITOR_VISIBLE_KEY = 'chorale.workspace.editorVisible';
export const EDITOR_WIDTH_KEY = 'chorale.workspace.editorWidth';
export const CHAT_OPEN_KEY = 'chorale.workspace.chatOpen';
export const CHAT_WIDTH_KEY = 'chorale.workspace.chatWidth';
export const FILE_RAIL_WIDTH_KEY = 'chorale.workspace.fileRailWidth';
export const FILE_RAIL_COLLAPSED_KEY = 'chorale.workspace.fileRailCollapsed';
export const SHEET_ZOOM_KEY = 'chorale.workspace.sheetZoom';

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
  const [chatWidth, setChatWidth] = useState<number>(() => (
    readStoredNumber(
      CHAT_WIDTH_KEY,
      clampChatPanelWidth(392, layoutViewportWidth()),
      (width) => clampChatPanelWidth(width, layoutViewportWidth()),
    )
  ));

  useEffect(() => {
    window.localStorage.setItem(EDITOR_VISIBLE_KEY, String(editorVisible));
  }, [editorVisible]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_WIDTH_KEY, String(editorWidth));
  }, [editorWidth]);

  useEffect(() => {
    window.localStorage.setItem(SHEET_ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    window.localStorage.setItem(FILE_RAIL_WIDTH_KEY, String(Math.round(railWidth)));
  }, [railWidth]);

  useEffect(() => {
    window.localStorage.setItem(FILE_RAIL_COLLAPSED_KEY, String(railCollapsed));
  }, [railCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_OPEN_KEY, String(chatOpen));
  }, [chatOpen]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(Math.round(chatWidth)));
  }, [chatWidth]);

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
    chatPanelWidth: chatWidth,
    editorPanelWidth: editorWidth,
    fileRailVisible: !railCollapsed,
    chatPanelVisible: chatOpen,
    editorPanelVisible: editorVisible,
  }), [chatOpen, chatWidth, editorVisible, editorWidth, layoutWidth, railCollapsed, railWidth]);

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
    chatWidth,
    fittedPanelLayout,
    beginEditorResize,
    beginRailResize,
    beginChatResize,
  };
};
