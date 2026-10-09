import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WaterfallPlayback } from '../music/waterfallPlayback';
import { indexNoteWindow, noteGeometry, pianoKeys, pitchLabel, visibleNotes, WATERFALL_COLORS } from '../music/waterfallLayout';

export function WaterfallView({ playback }: { playback: WaterfallPlayback | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clipId = useId();
  const [size, setSize] = useState({ width: 560, height: 440 });
  const [position, setPosition] = useState({ currentSeconds: 0, isPlaying: false });
  const notes = playback?.notes;
  const keys = useMemo(() => pianoKeys(notes ?? []), [notes]);
  const index = useMemo(() => indexNoteWindow(notes ?? []), [notes]);
  const voices = useMemo(() => [...new Set(notes?.map((note) => note.voice) ?? [])], [notes]);
  const whiteCount = keys.filter((key) => !key.black).length;
  const width = Math.max(size.width, whiteCount * 18);
  const height = Math.max(1, size.height);
  const keyboardHeight = Math.min(84, height * 0.3);
  const keyboardY = height - keyboardHeight;
  const keyWidth = width / whiteCount;
  const keyMap = useMemo(() => new Map(keys.map((key) => [key.midiPitch, key])), [keys]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setSize({ width: container.clientWidth || 560, height: container.clientHeight || 440 });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const sample = () => {
      const next = playback?.getPosition() ?? { currentSeconds: 0, isPlaying: false };
      setPosition((previous) => previous.currentSeconds === next.currentSeconds && previous.isPlaying === next.isPlaying ? previous : next);
      frame = requestAnimationFrame(sample);
    };
    sample();
    return () => cancelAnimationFrame(frame);
  }, [playback]);

  const visible = visibleNotes(index, position.currentSeconds);
  const active = new Map<number, number>();
  if (position.isPlaying) {
    for (const note of visible) {
      if (note.onsetSeconds <= position.currentSeconds) active.set(note.midiPitch, note.voice);
    }
  }
  const color = (voice: number) => WATERFALL_COLORS[voice % WATERFALL_COLORS.length];

  return <>
    <div className="waterfall-legend" aria-label="Waterfall voices">
      {voices.map((voice) => <span key={voice}><i style={{ background: color(voice) }} />Voice {voice + 1}</span>)}
      {!voices.length && <span>Play the current score with the shared controls below</span>}
    </div>
    <div className="waterfall-viewport" ref={containerRef}>
      <svg className="waterfall-piano" width={width} height={height} role="img" aria-label="Falling notes and piano keyboard. Notes sound when they reach the keys.">
        <defs>
          <clipPath id={clipId}><rect width={width} height={keyboardY} /></clipPath>
          {WATERFALL_COLORS.map((voiceColor, voice) => (
            <linearGradient key={voice} id={`${clipId}-note-${voice}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={voiceColor} stopOpacity={0.12} />
              <stop offset="25%" stopColor={voiceColor} stopOpacity={0.55} />
              <stop offset="50%" stopColor={voiceColor} stopOpacity={0.85} />
              <stop offset="100%" stopColor={voiceColor} stopOpacity={0.85} />
            </linearGradient>
          ))}
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {keys.filter((key) => !key.black).map((key) => <line key={key.midiPitch} x1={key.x * keyWidth} x2={key.x * keyWidth} y1={0} y2={keyboardY} className="waterfall-lane" />)}
          {visible.map((note) => {
            const key = keyMap.get(note.midiPitch);
            if (!key) return null;
            const geometry = noteGeometry(note, position.currentSeconds, keyboardY);
            const noteWidth = Math.max(1, key.width * keyWidth - 2);
            return <rect
              key={note.id}
              data-note={note.id}
              x={key.x * keyWidth + 1}
              y={geometry.y}
              width={noteWidth}
              height={geometry.height}
              rx={noteWidth / 2}
              fill={`url(#${clipId}-note-${note.voice % WATERFALL_COLORS.length})`}
            />;
          })}
        </g>
        {[...keys.filter((key) => !key.black), ...keys.filter((key) => key.black)].map((key) => {
          const voice = active.get(key.midiPitch);
          return <g key={key.midiPitch} data-pitch={key.midiPitch} data-active={voice !== undefined}>
            <rect x={key.x * keyWidth} y={keyboardY} width={key.width * keyWidth} height={key.black ? keyboardHeight * 0.62 : keyboardHeight} rx={2} fill={voice !== undefined ? color(voice) : key.black ? '#454540' : '#faf9f5'} stroke="#b8b6ae" strokeWidth={0.8} />
            {keyboardHeight >= 30 && key.midiPitch % 12 === 0 && <text x={(key.x + 0.5) * keyWidth} y={height - 10} textAnchor="middle" className="waterfall-key-label">{pitchLabel(key.midiPitch)}</text>}
          </g>;
        })}
      </svg>
      {!notes?.length && <p className="waterfall-empty" role="status">{playback ? 'No sounding notes in this score.' : 'Waiting for score audio…'}</p>}
    </div>
  </>;
}
