import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseWorkspacePanesResult {
  sheetVisible: boolean;
  setSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  sheetPaneOnRight: boolean;
  setSheetPaneOnRight: React.Dispatch<React.SetStateAction<boolean>>;
  paneMenuOpen: boolean;
  setPaneMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  paneMenuRef: React.RefObject<HTMLDivElement | null>;
  openSheetPane: (editorVisible: boolean) => void;
  openEditorPane: (setEditorVisible: (visible: boolean) => void) => void;
  closeSheetPane: () => void;
  togglePaneMenu: () => void;
  closePaneMenu: () => void;
}

export function useWorkspacePanes(): UseWorkspacePanesResult {
  const [sheetVisible, setSheetVisible] = useState(true);
  const [sheetPaneOnRight, setSheetPaneOnRight] = useState(false);
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const paneMenuRef = useRef<HTMLDivElement>(null);

  const openSheetPane = useCallback((editorVisible: boolean) => {
    if (!sheetVisible) setSheetPaneOnRight(editorVisible);
    setSheetVisible(true);
    setPaneMenuOpen(false);
  }, [sheetVisible]);

  const openEditorPane = useCallback((setEditorVisible: (visible: boolean) => void) => {
    setSheetPaneOnRight(false);
    setEditorVisible(true);
    setPaneMenuOpen(false);
  }, []);

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
    sheetPaneOnRight,
    setSheetPaneOnRight,
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
