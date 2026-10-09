import { X } from 'lucide-react';
import type { WaterfallPlayback } from '../music/waterfallPlayback';
import { WaterfallView } from './WaterfallView';

export function WaterfallPane({ playback, onClose }: { playback: WaterfallPlayback | null; onClose: () => void }) {
  return <section className="waterfall-pane workspace-pane" aria-label="Waterfall pane">
    <div className="pane-tab-strip">
      <div className="pane-tab active"><span className="pane-tab-title">Waterfall</span><button type="button" className="pane-tab-close" onClick={onClose} aria-label="Close Waterfall pane"><X size={13} /></button></div>
    </div>
    <div className="waterfall-card"><WaterfallView playback={playback} /></div>
  </section>;
}
