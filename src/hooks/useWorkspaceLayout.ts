import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [railCollapsed, setRailCollapsed] = useState<boolean>(false);
  const [chatWidth, setChatWidth] = useState<number>(() => (
    readStoredNumber(
      CHAT_WIDTH_KEY,
      clampChatPanelWidth(392, layoutViewportWidth()),
      (width) => clampChatPanelWidth(width, layoutViewportWidth()),
    )
  ));

  const editorDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const railDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const chatDragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

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

  const beginEditorResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    editorDragStateRef.current = {
      startX: event.clientX,
      startWidth: editorWidth,
    };
    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = editorDragStateRef.current;
      if (!dragState) return;
      const delta = dragState.startX - moveEvent.clientX;
      setEditorWidth(clampEditorPanelWidth(dragState.startWidth + delta));
    };

    const handlePointerUp = () => {
      editorDragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const beginRailResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    railDragStateRef.current = {
      startX: event.clientX,
      startWidth: railWidth,
    };
    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = railDragStateRef.current;
      if (!dragState) return;
      const delta = moveEvent.clientX - dragState.startX;
      setRailWidth(clampFileRailWidth(dragState.startWidth + delta));
    };

    const handlePointerUp = () => {
      railDragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const beginChatResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    chatDragStateRef.current = {
      startX: event.clientX,
      startWidth: chatWidth,
    };
    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = chatDragStateRef.current;
      if (!dragState) return;
      const delta = dragState.startX - moveEvent.clientX;
      setChatWidth(clampChatPanelWidth(dragState.startWidth + delta, layoutViewportWidth()));
    };

    const handlePointerUp = () => {
      chatDragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

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
