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
            <radialGradient
              key={voice}
              id={`${clipId}-illuminating-shadow-${voice}`}
              cx="50%"
              cy="100%"
              r="100%"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
              <stop offset="22%" stopColor={voiceColor} stopOpacity={0.85} />
              <stop offset="55%" stopColor={voiceColor} stopOpacity={0.4} />
              <stop offset="85%" stopColor={voiceColor} stopOpacity={0.1} />
              <stop offset="100%" stopColor={voiceColor} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {keys.filter((key) => !key.black).map((key) => <line key={key.midiPitch} x1={key.x * keyWidth} x2={key.x * keyWidth} y1={0} y2={keyboardY} className="waterfall-lane" />)}
          {position.isPlaying && visible.map((note) => {
            if (note.onsetSeconds > position.currentSeconds || note.onsetSeconds + note.durationSeconds <= position.currentSeconds) return null;
            const key = keyMap.get(note.midiPitch);
            if (!key) return null;
            const kw = key.width * keyWidth;
            const shadowWidth = Math.max(kw * 1.6, 22);
            const shadowHeight = Math.min(32, Math.max(16, keyboardY * 0.16));
            const cx = (key.x + key.width / 2) * keyWidth;
            const voiceColor = color(note.voice);
            return (
              <g key={`glow-group-${note.id}`} className="waterfall-merge-glow">
                <ellipse
                  cx={cx}
                  cy={keyboardY}
                  rx={shadowWidth / 2}
                  ry={shadowHeight}
                  fill={`url(#${clipId}-illuminating-shadow-${note.voice % WATERFALL_COLORS.length})`}
                  className="waterfall-illuminating-shadow"
                />
                <line
                  x1={cx - kw * 0.4}
                  y1={keyboardY}
                  x2={cx + kw * 0.4}
                  y2={keyboardY}
                  stroke="#ffffff"
                  strokeWidth={2.2}
                  opacity={0.85}
                />
                {[0, 1, 2, 3, 4, 5, 6].map((p) => {
                  const phase = ((position.currentSeconds * 7 + p * 0.14) % 1);
                  const angle = -Math.PI / 2 + (p - 3) * 0.28 + Math.sin(p * 2.5) * 0.12;
                  const speed = 14 + (p % 3) * 7;
                  const dist = speed * phase;
                  const px = cx + Math.cos(angle) * dist;
                  const py = keyboardY + Math.sin(angle) * dist + phase * phase * 6;
                  const pSize = Math.max(0.7, (1 - phase * 0.5) * (1.6 + (p % 2) * 0.5));
                  const pOpacity = (1 - phase) * 0.85;
                  return (
                    <circle
                      key={`splash-${p}`}
                      cx={px}
                      cy={py}
                      r={pSize}
                      fill={p % 2 === 0 ? '#ffffff' : voiceColor}
                      opacity={pOpacity}
                      className="waterfall-splash-particle"
                    />
                  );
                })}
              </g>
            );
          })}
          {visible.map((note) => {
            const key = keyMap.get(note.midiPitch);
            if (!key) return null;
            const geometry = noteGeometry(note, position.currentSeconds, keyboardY);
            if (geometry.height <= 0) return null;
            const noteX = key.x * keyWidth + 1;
            const noteWidth = Math.max(1, key.width * keyWidth - 2);
            const isMerging = geometry.bottom >= keyboardY;
            const rx = Math.max(1, Math.min(noteWidth / 2, 4));
            const renderHeight = isMerging
              ? Math.max(0, keyboardY - geometry.y + noteWidth)
              : geometry.height;
            const voiceColor = color(note.voice);
            return (
              <g key={note.id} className="waterfall-note-item">
                <rect
                  data-note={note.id}
                  x={noteX}
                  y={geometry.y}
                  width={noteWidth}
                  height={renderHeight}
                  rx={rx}
                  fill={voiceColor}
                  opacity={0.88}
                  className="waterfall-note-body"
                />
                {/* Dynamic particle fading effect at the tail */}
                <g className="waterfall-note-tail" pointerEvents="none">
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const phase = ((position.currentSeconds * 4 + i * 0.16 + note.midiPitch * 0.05) % 1);
                    const xSpread = (((i * 1.618) % 1) - 0.5) * (noteWidth * 0.7);
                    const px = noteX + noteWidth / 2 + xSpread;
                    const riseDist = 2 + phase * 18;
                    const py = geometry.y - riseDist;
                    if (py < 0) return null;
                    const pSize = Math.max(0.6, (1 - phase * 0.4) * 1.6);
                    const pOpacity = (1 - phase) * 0.75;
                    return (
                      <circle
                        key={`tail-p-${i}`}
                        cx={px}
                        cy={py}
                        r={pSize}
                        fill={i % 3 === 0 ? '#ffffff' : voiceColor}
                        opacity={pOpacity}
                        className="waterfall-tail-particle"
                      />
                    );
                  })}
                  {noteWidth >= 4 && geometry.height >= 4 && (
                    <path
                      d={`M ${noteX + 1} ${geometry.y + rx} A ${rx} ${rx} 0 0 1 ${noteX + noteWidth - 1} ${geometry.y + rx}`}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.75)"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              </g>
            );
          })}
        </g>
        <line x1={0} y1={keyboardY} x2={width} y2={keyboardY} className="waterfall-keyboard-rail" />
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
