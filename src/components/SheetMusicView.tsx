import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { ZoomIn, ZoomOut, RotateCcw, SlidersHorizontal } from 'lucide-react';

interface SheetMusicViewProps {
  abcCode: string;
  onTuneRendered?: (tune: abcjs.TuneObject[] | null) => void;
}

export const SheetMusicView: React.FC<SheetMusicViewProps> = ({ abcCode, onTuneRendered }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [transpose, setTranspose] = useState<number>(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!abcCode.trim()) {
      containerRef.current.innerHTML = '';
      setRenderError(null);
      onTuneRendered?.(null);
      return;
    }

    try {
      setRenderError(null);
      containerRef.current.innerHTML = '';
      
      const visualTranspose = transpose;
      const tunes = abcjs.renderAbc(containerRef.current, abcCode, {
        responsive: 'resize',
        scale: scale,
        staffwidth: 740,
        wrap: {
          minSpacing: 1.5,
          maxSpacing: 3,
          preferredMeasuresPerLine: 4,
        },
        add_classes: true,
        visualTranspose: visualTranspose,
        foregroundColor: '#000000',
        paddingtop: 15,
        paddingbottom: 15,
        paddingleft: 15,
        paddingright: 15,
      });

      if (tunes && tunes.length > 0 && onTuneRendered) {
        onTuneRendered(tunes);
      } else {
        onTuneRendered?.(null);
      }
    } catch (err: any) {
      console.error('abcjs render error:', err);
      containerRef.current.innerHTML = '';
      onTuneRendered?.(null);
      setRenderError(err?.message || 'Failed to render sheet music SVG.');
    }
  }, [abcCode, scale, transpose]);

  return (
    <div className="sheet-music-card glass-panel">
      <div className="sheet-header">
        <div className="sheet-title-group">
          <h3 className="section-title">Interactive Sheet Music</h3>
        </div>
        <div className="sheet-controls">
          <div className="control-group">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400 mr-1" />
            <span className="control-label">Key:</span>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setTranspose((t) => t - 1)}
              title="Transpose down 1 semitone"
            >
              -1
            </button>
            <span className="transpose-val">{transpose > 0 ? `+${transpose}` : transpose}</span>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setTranspose((t) => t + 1)}
              title="Transpose up 1 semitone"
            >
              +1
            </button>
            {transpose !== 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setTranspose(0)}
                title="Reset Transpose"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="control-group">
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(1)))}
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="scale-val">{Math.round(scale * 100)}%</span>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setScale((s) => Math.min(1.8, +(s + 0.1).toFixed(1)))}
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {renderError && (
        <div className="error-banner">
          <span>Sheet music render issue: {renderError}</span>
        </div>
      )}

      <div className="sheet-viewport">
        <div ref={containerRef} id="paper" className="abcjs-paper-container" />
      </div>
    </div>
  );
};
