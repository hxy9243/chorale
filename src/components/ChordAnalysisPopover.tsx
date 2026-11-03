import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export function ChordAnalysisPopover({ annotationId, measure, initiatorRef, surfaceRef, interfaceZoom, layoutVersion, onClose, children }: {
  annotationId: string;
  measure: number;
  initiatorRef: RefObject<HTMLElement | SVGElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  interfaceZoom: number;
  layoutVersion: string;
  onClose: (restoreFocus?: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const zoom = interfaceZoom / 100;

  useLayoutEffect(() => {
    const panel = ref.current, surface = surfaceRef.current;
    if (!panel || !surface) return;
    let frame = 0;
    const position = () => {
      frame = 0;
      const initiator = initiatorRef.current?.isConnected ? initiatorRef.current
        : Array.from(surface.querySelectorAll<SVGElement>('[data-annotation-id]')).find(el => el.dataset.annotationId === annotationId);
      if (!initiator) return;
      initiatorRef.current = initiator;
      const badge = initiator.getBoundingClientRect();
      const measures = Array.from(surface.querySelectorAll<SVGElement>('.abcjs-measure-hit-area'))
        .filter(el => Number(el.dataset.measure) === measure)
        .map(el => el.getBoundingClientRect());
      const anchor = measures.sort((a, b) => Math.abs(a.top - badge.top) - Math.abs(b.top - badge.top))[0] ?? badge;
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) { onClose(); return; }
      const topEdge = Math.max(8, bounds.top + 8), bottomEdge = Math.min(window.innerHeight - 8, bounds.bottom - 8);
      if (anchor.bottom < bounds.top || anchor.top > bounds.bottom) { onClose(); return; }
      const width = Math.max(1, Math.min(320, (Math.min(window.innerWidth, bounds.right) - Math.max(0, bounds.left)) / zoom - 24));
      const maxHeight = Math.max(1, (bottomEdge - topEdge) / zoom);
      const height = Math.min(panel.getBoundingClientRect().height || maxHeight * zoom, maxHeight * zoom);
      const next = {
        left: Math.max(8, Math.min(bounds.left + 12, window.innerWidth - width * zoom - 8)) / zoom,
        top: Math.max(topEdge, Math.min(anchor.top, bottomEdge - height)) / zoom,
        width, maxHeight,
      };
      setPlacement(current => current && Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
    position();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(surface); observer?.observe(panel);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const outside = (event: Event) => {
      if (!panel.contains(event.target as Node) && !initiatorRef.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); }
    };
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [annotationId, measure, initiatorRef, surfaceRef, zoom, layoutVersion, onClose]);

  return createPortal(<div ref={ref} className="chord-analysis-popover" role="dialog" aria-modal={false} tabIndex={-1}
    aria-label="Chord analysis popover" data-measure={measure}
    style={placement ?? { visibility: 'hidden' }}>{children}</div>, document.body);
}
