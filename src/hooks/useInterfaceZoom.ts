import { useCallback, useEffect, useState } from 'react';

export const INTERFACE_ZOOM_KEY = 'chorale.workspace.interfaceZoom';
export const MIN_INTERFACE_ZOOM = 80;
export const MAX_INTERFACE_ZOOM = 160;
export const INTERFACE_ZOOM_STEP = 10;

export const clampInterfaceZoom = (value: number) => (
  Math.max(MIN_INTERFACE_ZOOM, Math.min(MAX_INTERFACE_ZOOM, value))
);

export const isSheetZoomTarget = (target: EventTarget | null) => (
  target instanceof Element && Boolean(target.closest('.sheet-music-card'))
);

const readInterfaceZoom = () => {
  if (typeof window === 'undefined') return 100;
  const stored = Number(window.localStorage.getItem(INTERFACE_ZOOM_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampInterfaceZoom(stored)
    : 100;
};

export const useInterfaceZoom = () => {
  const [zoom, setZoomState] = useState(readInterfaceZoom);

  const setZoom = useCallback((value: number) => {
    setZoomState(clampInterfaceZoom(Math.round(value / INTERFACE_ZOOM_STEP) * INTERFACE_ZOOM_STEP));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-zoom', String(zoom / 100));
    window.localStorage.setItem(INTERFACE_ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    const changeZoom = (direction: number) => {
      setZoomState((current) => clampInterfaceZoom(current + direction * INTERFACE_ZOOM_STEP));
    };
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (isSheetZoomTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      changeZoom(event.deltaY < 0 ? 1 : -1);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === '0') {
        event.preventDefault();
        setZoomState(100);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        changeZoom(1);
      } else if (event.key === '-') {
        event.preventDefault();
        changeZoom(-1);
      }
    };
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return { zoom, setZoom };
};
