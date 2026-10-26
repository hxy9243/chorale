import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Code, MessageSquare, Music2, Play, Plus, Repeat, StickyNote } from 'lucide-react';
import type { ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';

export type ScoreContextAction = 'play' | 'loop' | 'chord' | 'annotation' | 'abc' | 'ask' | 'ask-new';

const ITEMS = [
  { action: 'play', label: 'Play selection', icon: Play },
  { action: 'loop', label: 'Loop selection', icon: Repeat },
  { action: 'chord', label: 'Add chord symbol…', icon: Music2 },
  { action: 'annotation', label: 'Add annotation…', icon: StickyNote },
  { action: 'abc', label: 'Edit in ABC', icon: Code },
  { action: 'ask', label: 'Ask about selection…', icon: MessageSquare },
  { action: 'ask-new', label: 'Ask about selection in new chat…', icon: Plus },
] as const;

export function ScoreContextMenu({ x, y, anchor, interfaceZoom, surfaceRef, available, onAction, onClose }: {
  x: number;
  y: number;
  anchor: ScoreAnchor;
  interfaceZoom: number;
  surfaceRef: RefObject<HTMLElement | null>;
  available: ReadonlySet<ScoreContextAction>;
  onAction: (action: ScoreContextAction) => void;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const zoom = interfaceZoom / 100;
  const [point, setPoint] = useState({ left: x / zoom, top: y / zoom });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPoint({
      left: Math.max(8, Math.min(x / zoom, (window.innerWidth - bounds.width) / zoom - 8)),
      top: Math.max(8, Math.min(y / zoom, (window.innerHeight - bounds.height) / zoom - 8)),
    });
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    const resize = () => onClose();
    const scroll = (event: Event) => {
      // Selection synchronization can finish a smooth scroll after this opens.
      // Dismiss on user scrolling the sheet, not those queued scroll events.
      const target = event.target;
      const viewport = surfaceRef.current?.closest('.sheet-viewport');
      if (target instanceof Node && viewport?.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('wheel', scroll, true);
    document.addEventListener('touchmove', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('wheel', scroll, true);
      document.removeEventListener('touchmove', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [x, y, zoom, surfaceRef, onClose]);

  return createPortal(
    <div ref={ref} className="file-context-menu score-context-menu" style={point}
      role="menu" aria-label="Selection actions"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      <div className="file-context-menu-heading">{formatAnchorLabel(anchor)}</div>
      {ITEMS.map(({ action, label, icon: Icon }) => (
        <button key={action} type="button" role="menuitem" className="file-context-menu-item"
          disabled={!available.has(action)}
          title={!available.has(action) && action.startsWith('ask') ? 'Chat is available in the desktop app' : undefined}
          onClick={() => onAction(action)}>
          <Icon size={15} aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </div>, document.body,
  );
}
