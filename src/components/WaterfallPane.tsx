import type { CSSProperties, PointerEventHandler, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { WaterfallPlayback } from '../music/waterfallPlayback';
import { WaterfallView } from './WaterfallView';

interface WaterfallPaneProps {
  playback: WaterfallPlayback | null;
  onClose: () => void;
  onTabPointerDown: PointerEventHandler<HTMLDivElement>;
  dragging: boolean;
  style: CSSProperties;
  actions: ReactNode;
}

export function WaterfallPane({ playback, onClose, onTabPointerDown, dragging, style, actions }: WaterfallPaneProps) {
  return <section className="waterfall-pane workspace-pane" aria-label="Waterfall pane" style={style}>
    <div className="pane-tab-strip">
      <div className={`pane-tab active ${dragging ? 'is-dragging' : ''}`} role="tab" aria-selected="true" onPointerDown={onTabPointerDown}>
        <span className="pane-tab-title">Waterfall</span>
        <button type="button" className="pane-tab-close" onClick={onClose} aria-label="Close Waterfall pane"><X size={13} aria-hidden="true" /></button>
      </div>
      {actions}
    </div>
    <div className="waterfall-card"><WaterfallView playback={playback} /></div>
  </section>;
}
