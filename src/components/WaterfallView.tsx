import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WaterfallPlayback } from '../music/waterfallPlayback';
import { indexNoteWindow, noteGeometry, pianoKeys, pitchLabel, visibleNotes, WATERFALL_COLORS } from '../music/waterfallLayout';

const SPARKS = Array.from({ length: 24 }, (_, i) => i);
const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Short, deterministic trajectories confined to the note's contact footprint. */
function contactSparks(age: number, width: number, seed: number) {
  return SPARKS.flatMap((i) => {
    const particleSeed = seed + i * 17;
    const lifetime = 0.16 + noise(particleSeed) * 0.08;
    const delay = i < 8 ? 0 : (i - 8) * 0.007;
    if (age < delay) return [];
    const phase = ((age - delay) % lifetime) / lifetime;
    const cycle = Math.floor((age - delay) / lifetime);
    const origin = 0.08 + noise(particleSeed + cycle * 31 + 2) * 0.84;
    const drift = (noise(particleSeed + 3) - 0.5) * Math.min(width * 0.15, 3);
    const x = Math.max(width * 0.04, Math.min(width * 0.96, origin * width + drift * phase));
    const rise = (3 + noise(particleSeed + 4) * 6) * (1 - (1 - phase) ** 2);
    return [{
      id: i, x, y: -0.8 - rise, length: 0.6 + (1 - phase) * 1.1,
      width: 0.6 + noise(particleSeed + 5) * 0.45,
      opacity: (1 - phase) ** 0.7 * (0.9 + Math.exp(-age * 14) * 0.1),
      white: i % 6 === 0,
    }];
  });
}

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
  const renderedNotes = visible.flatMap((note, i) => {
    const key = keyMap.get(note.midiPitch);
    if (!key) return [];
    const geometry = noteGeometry(note, position.currentSeconds, keyboardY);
    if (geometry.height <= 0) return [];
    return [{
      note, geometry, x: key.x * keyWidth + 1,
      width: Math.max(1, key.width * keyWidth - 2), gradientId: `${clipId}-note-${i}`,
    }];
  });
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
            <linearGradient key={voice} id={`${clipId}-contact-${voice}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={voiceColor} stopOpacity={0} />
              <stop offset="55%" stopColor={voiceColor} stopOpacity={0.28} />
              <stop offset="85%" stopColor={voiceColor} stopOpacity={0.72} />
              <stop offset="100%" stopColor="#fffdfa" stopOpacity={0.98} />
            </linearGradient>
          ))}
          {renderedNotes.map(({ note, geometry, gradientId }) => (
            <linearGradient key={note.id} id={gradientId} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={geometry.top} y2={geometry.bottom}>
              <stop offset="0%" stopColor={color(note.voice)} stopOpacity={0} />
              <stop offset="12%" stopColor={color(note.voice)} stopOpacity={0.04} />
              <stop offset="32%" stopColor={color(note.voice)} stopOpacity={0.22} />
              <stop offset="62%" stopColor={color(note.voice)} stopOpacity={0.58} />
              <stop offset="100%" stopColor={color(note.voice)} stopOpacity={0.86} />
            </linearGradient>
          ))}
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {keys.filter((key) => !key.black).map((key) => <line key={key.midiPitch} x1={key.x * keyWidth} x2={key.x * keyWidth} y1={0} y2={keyboardY} className="waterfall-lane" />)}
          {renderedNotes.map(({ note, geometry, x, width: noteWidth, gradientId }) => {
            const isMerging = geometry.bottom >= keyboardY;
            const radius = Math.max(1, Math.min(noteWidth / 2, 4));
            return <g key={note.id} className="waterfall-note-item">
              <rect data-note={note.id} x={x} y={geometry.top} width={noteWidth}
                height={geometry.bottom - geometry.top + (isMerging ? noteWidth : 0)}
                rx={radius} fill={`url(#${gradientId})`} className="waterfall-note-body" />
              {!isMerging && noteWidth >= 4 && geometry.height >= 4 && (
                <line x1={x + radius} x2={x + noteWidth - radius} y1={geometry.bottom - 1.2} y2={geometry.bottom - 1.2} stroke="#fffdfa" strokeWidth={1} strokeLinecap="round" opacity={0.45} />
              )}
            </g>;
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
        {/* Draw contact light over the notes and rail, confined above the keyboard. */}
        <g clipPath={`url(#${clipId})`} className="waterfall-contacts" pointerEvents="none">
          {position.isPlaying && renderedNotes.map(({ note, x, width: noteWidth }) => {
            const age = position.currentSeconds - note.onsetSeconds;
            if (age < 0 || age >= note.durationSeconds) return null;
            const attack = Math.exp(-age * 14);
            const glowHeight = 6 + attack * 3;
            return <g key={note.id} data-contact={note.id} className="waterfall-merge-glow">
              <rect x={x} y={keyboardY - glowHeight} width={noteWidth} height={glowHeight}
                fill={`url(#${clipId}-contact-${note.voice % WATERFALL_COLORS.length})`} className="waterfall-contact-glow" />
              {contactSparks(age, noteWidth, note.midiPitch * 97 + note.voice * 41 + note.onsetSeconds * 13).map((spark) => (
                <line key={spark.id} x1={x + spark.x} x2={x + spark.x}
                  y1={keyboardY + spark.y} y2={keyboardY + spark.y - spark.length}
                  stroke={spark.white ? '#fffdfa' : color(note.voice)}
                  strokeWidth={spark.width} strokeLinecap="round" opacity={spark.opacity} className="waterfall-splash-particle" />
              ))}
              <rect x={x} y={keyboardY - 1.4} width={noteWidth} height={1.4}
                fill="#fffdfa" opacity={0.8 + attack * 0.2} className="waterfall-contact-seam" />
            </g>;
          })}
        </g>
      </svg>
      {!notes?.length && <p className="waterfall-empty" role="status">{playback ? 'No sounding notes in this score.' : 'Waiting for score audio…'}</p>}
    </div>
  </>;
}
