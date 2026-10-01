import { useCallback, useEffect, useRef, useState } from 'react';

export type PaneOrientation = 'horizontal' | 'vertical';
export type PaneOrder = 'sheet-first' | 'editor-first';
export type SnapTarget = 'left' | 'right' | 'top' | 'bottom';
export type WorkspacePaneId = 'sheet' | 'editor';

export const PANE_ORIENTATION_KEY = 'chorale.workspace.paneOrientation';
export const PANE_ORDER_KEY = 'chorale.workspace.paneOrder';

export interface UseWorkspacePanesResult {
  sheetVisible: boolean;
  setSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  paneOrientation: PaneOrientation;
  setPaneOrientation: React.Dispatch<React.SetStateAction<PaneOrientation>>;
  paneOrder: PaneOrder;
  setPaneOrder: React.Dispatch<React.SetStateAction<PaneOrder>>;
  sheetPaneOnRight: boolean;
  setSheetPaneOnRight: (action: React.SetStateAction<boolean>) => void;
  rearrangePane: (draggedPane: WorkspacePaneId, target: SnapTarget) => void;
  paneMenuOpen: boolean;
  setPaneMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  paneMenuRef: React.RefObject<HTMLDivElement | null>;
  openSheetPane: (editorVisible: boolean) => void;
  openEditorPane: (setEditorVisible: (visible: boolean) => void) => void;
  closeSheetPane: () => void;
  togglePaneMenu: () => void;
  closePaneMenu: () => void;
}

const readStoredOrientation = (): PaneOrientation => {
  if (typeof window === 'undefined') return 'horizontal';
  const val = window.localStorage.getItem(PANE_ORIENTATION_KEY);
  return val === 'vertical' ? 'vertical' : 'horizontal';
};

const readStoredOrder = (): PaneOrder => {
  if (typeof window === 'undefined') return 'sheet-first';
  const val = window.localStorage.getItem(PANE_ORDER_KEY);
  return val === 'editor-first' ? 'editor-first' : 'sheet-first';
};

export function useWorkspacePanes(): UseWorkspacePanesResult {
  const [sheetVisible, setSheetVisible] = useState(true);
  const [paneOrientation, setPaneOrientation] = useState<PaneOrientation>(readStoredOrientation);
  const [paneOrder, setPaneOrder] = useState<PaneOrder>(readStoredOrder);
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const paneMenuRef = useRef<HTMLDivElement>(null);

  const sheetPaneOnRight = paneOrientation === 'horizontal' && paneOrder === 'editor-first';

  const setSheetPaneOnRight = useCallback((action: React.SetStateAction<boolean>) => {
    setPaneOrder((prevOrder) => {
      const currentOnRight = prevOrder === 'editor-first';
      const nextOnRight = typeof action === 'function' ? action(currentOnRight) : action;
      return nextOnRight ? 'editor-first' : 'sheet-first';
    });
  }, []);

  const rearrangePane = useCallback((draggedPane: WorkspacePaneId, target: SnapTarget) => {
    if (target === 'top') {
      setPaneOrientation('vertical');
      setPaneOrder(draggedPane === 'sheet' ? 'sheet-first' : 'editor-first');
    } else if (target === 'bottom') {
      setPaneOrientation('vertical');
      setPaneOrder(draggedPane === 'sheet' ? 'editor-first' : 'sheet-first');
    } else if (target === 'left') {
      setPaneOrientation('horizontal');
      setPaneOrder(draggedPane === 'sheet' ? 'sheet-first' : 'editor-first');
    } else if (target === 'right') {
      setPaneOrientation('horizontal');
      setPaneOrder(draggedPane === 'sheet' ? 'editor-first' : 'sheet-first');
    }
  }, []);

  const openSheetPane = useCallback((editorVisible: boolean) => {
    if (!sheetVisible && editorVisible && paneOrientation === 'horizontal') {
      setPaneOrder('editor-first');
    }
    setSheetVisible(true);
    setPaneMenuOpen(false);
  }, [sheetVisible, paneOrientation]);

  const openEditorPane = useCallback((setEditorVisible: (visible: boolean) => void) => {
    if (paneOrientation === 'horizontal') {
      setPaneOrder('sheet-first');
    }
    setEditorVisible(true);
    setPaneMenuOpen(false);
  }, [paneOrientation]);

  const closeSheetPane = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const togglePaneMenu = useCallback(() => {
    setPaneMenuOpen((prev) => !prev);
  }, []);

  const closePaneMenu = useCallback(() => {
    setPaneMenuOpen(false);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PANE_ORIENTATION_KEY, paneOrientation);
  }, [paneOrientation]);

  useEffect(() => {
    window.localStorage.setItem(PANE_ORDER_KEY, paneOrder);
  }, [paneOrder]);

  useEffect(() => {
    if (!paneMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        paneMenuRef.current &&
        !paneMenuRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('.workspace-add-tab-btn')
      ) {
        setPaneMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPaneMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [paneMenuOpen]);

  return {
    sheetVisible,
    setSheetVisible,
    paneOrientation,
    setPaneOrientation,
    paneOrder,
    setPaneOrder,
    sheetPaneOnRight,
    setSheetPaneOnRight,
    rearrangePane,
    paneMenuOpen,
    setPaneMenuOpen,
    paneMenuRef,
    openSheetPane,
    openEditorPane,
    closeSheetPane,
    togglePaneMenu,
    closePaneMenu,
  };
}
