import type { PlaybackPosition } from '../utils/repeatPlayback';

/** Score-time seconds are independent of playback speed, so score anchors and
 * the waterfall use the same timeline even when the audio buffer is rebuilt. */
export interface WaterfallNote {
  id: string;
  midiPitch: number;
  voice: number;
  onsetSeconds: number;
  durationSeconds: number;
}

export type WaterfallPosition = PlaybackPosition;

export interface WaterfallPlayback {
  notes: WaterfallNote[];
  getPosition: () => WaterfallPosition;
}

export interface SynthSequenceNote {
  pitch: number;
  start: number;
  end: number;
  volume?: number;
}

export interface SynthSequence {
  tracks: Array<Array<{
    cmd: string;
    pitch?: number;
    start?: number;
    duration?: number;
    volume?: number;
    gap?: number;
  }>>;
  totalDuration?: number;
}

/** The small, version-specific abcjs adapter surface is isolated here.
 * These fields are the actual CreateSynth clock, not its beat callback timer. */
export interface SynthPlaybackBuffer {
  flattened?: SynthSequence;
  millisecondsPerMeasure?: number;
  meterSize?: number;
  duration?: number;
  fadeLength?: number;
  isRunning?: boolean;
  startTimeSec?: number;
  pausedTimeSec?: number;
}

export interface SynthTimingState<T> {
  qpm?: number;
  lastMoment?: number;
  isRunning?: boolean;
  replaceTarget?: (target: T) => void;
  pause?: () => void;
  start?: (position?: number, units?: 'seconds') => void;
  setProgress?: (position: number, units?: 'seconds') => void;
}

export interface SynthTransport<T = unknown> {
  midiBuffer?: SynthPlaybackBuffer | null;
  timer?: SynthTimingState<T> | null;
  visualObj?: T | null;
  percent?: number;
  seek?: (position: number, units?: 'seconds') => void;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function secondsPerWholeNote(buffer: SynthPlaybackBuffer, speed = 1): number {
  const milliseconds = buffer.millisecondsPerMeasure;
  const meter = buffer.meterSize;
  return finite(milliseconds) && milliseconds > 0 && finite(meter) && meter > 0
    ? milliseconds / 1000 / meter * speed
    : 0;
}

/** SynthController rounds its timing BPM even though the rendered buffer uses
 * the exact measure duration. Restore that tempo before the timer starts so
 * notation and finish callbacks cannot drift at fractional playback speeds.
 * Deriving BPM from the tune's beat count also handles compound meter and
 * tempo markings whose note unit is not a quarter note. */
export function synchronizeSynthTimingTempo<T extends { getBeatsPerMeasure?: () => number }>(
  timer: { qpm?: number; replaceTarget?: (target: T) => void } | null | undefined,
  buffer: SynthPlaybackBuffer | null | undefined,
  tune: T,
): void {
  const milliseconds = buffer?.millisecondsPerMeasure;
  const beats = tune.getBeatsPerMeasure?.();
  if (!timer?.replaceTarget || !finite(milliseconds) || milliseconds <= 0 || !finite(beats) || beats <= 0) return;
  const tempo = beats / milliseconds * 60_000;
  if (!finite(tempo) || tempo <= 0 || Math.abs((timer.qpm ?? 0) - tempo) < 1e-9) return;
  timer.qpm = tempo;
  timer.replaceTarget(tune);
}

/** sequenceCallback is abcjs's final, resolved note map: repeats, ties, chords,
 * accompaniment, rests, tempo and swing have already been interpreted by audio. */
export function waterfallNotesFromNoteMap(
  tracks: readonly (readonly SynthSequenceNote[])[],
  secondsPerWhole: number,
): WaterfallNote[] {
  if (!finite(secondsPerWhole) || secondsPerWhole <= 0) return [];
  const notes: WaterfallNote[] = [];
  tracks.forEach((track, voice) => track.forEach((note, index) => {
    if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127
      || !finite(note.start) || note.start < 0 || !finite(note.end)
      || note.end <= note.start || note.volume === 0) return;
    notes.push({
      id: `${voice}:${index}`,
      midiPitch: note.pitch,
      voice,
      onsetSeconds: note.start * secondsPerWhole,
      durationSeconds: (note.end - note.start) * secondsPerWhole,
    });
  }));
  return notes.sort((a, b) => a.onsetSeconds - b.onsetSeconds || a.voice - b.voice || a.midiPitch - b.midiPitch);
}

/** Before the first Play, the existing soundfont preloader already has the
 * exact setUpAudio stream. Mirror abcjs create-note-map's gap/rounding rules for
 * that preview; sequenceCallback replaces it with the rendered map on Play. */
export function waterfallNotesFromSequence(buffer: SynthPlaybackBuffer): WaterfallNote[] {
  const tracks = buffer.flattened?.tracks ?? [];
  const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return waterfallNotesFromNoteMap(tracks.map((track) => track.flatMap((event) => {
    if (event.cmd !== 'note' || !finite(event.pitch) || !finite(event.start)
      || !finite(event.duration) || event.duration <= 0) return [];
    const gap = Math.min(event.gap || 0, event.duration * 2 / 3);
    return [{
      pitch: event.pitch,
      start: round(event.start),
      end: round(event.start + event.duration - gap),
      volume: event.volume,
    }];
  })), secondsPerWholeNote(buffer));
}

/** Reads audio time directly on every animation frame. No wall-clock
 * extrapolation is used, so tab suspension and audio-context suspension cannot
 * accumulate drift. A paused seek is available before a buffer exists. */
export function readWaterfallPosition(
  buffer: SynthPlaybackBuffer | null | undefined,
  context: { currentTime: number; state?: string } | null | undefined,
  speed = 1,
  pendingSeconds = 0,
): WaterfallPosition {
  if (!buffer) return { currentSeconds: Math.max(0, pendingSeconds), isPlaying: false };
  const running = Boolean(buffer.isRunning && context && finite(buffer.startTimeSec));
  let seconds = running
    ? context!.currentTime - buffer.startTimeSec!
    : (buffer.pausedTimeSec ?? pendingSeconds / speed);
  if (!finite(seconds)) seconds = 0;
  const duration = buffer.duration;
  if (finite(duration)) seconds = Math.min(seconds, Math.max(0, duration - (buffer.fadeLength ?? 0) / 1000));
  return {
    currentSeconds: Math.max(0, seconds * speed),
    isPlaying: running && context?.state !== 'suspended' && context?.state !== 'closed',
  };
}

/** abcjs 6.x updates the running audio offset on seek but leaves startTimeSec
 * at the old origin. Repair its bookkeeping at the seek boundary, which also
 * makes the engine's own subsequent pause/resume correct. The frame getter
 * itself remains strictly read-only. */
export function synchronizeSynthSeekClock(
  buffer: SynthPlaybackBuffer | null | undefined,
  context: { currentTime: number } | null | undefined,
): void {
  if (buffer?.isRunning && context && finite(buffer.pausedTimeSec)) {
    buffer.startTimeSec = context.currentTime - buffer.pausedTimeSec;
  }
}

/** One seek boundary for first-buffer readiness, user seeks and pause/resume.
 * abcjs seeks audio correctly but leaves both its running clock origin and
 * notation resume percent stale (the latter may be rounded by a beat callback). */
export function seekSynthExactly<T>(
  controller: SynthTransport<T>,
  context: { currentTime: number } | null | undefined,
  seconds: number,
  fallbackDurationSeconds = 0,
): { seconds: number; progress: number } {
  const buffer = controller.midiBuffer;
  const duration = finite(buffer?.duration)
    ? Math.max(0, buffer.duration - (buffer.fadeLength ?? 0) / 1000)
    : Math.max(0, fallbackDurationSeconds);
  const offset = Math.max(0, finite(seconds) ? seconds : 0);
  const bounded = duration > 0 ? Math.min(offset, duration) : offset;
  controller.seek?.(bounded, 'seconds');
  synchronizeSynthSeekClock(buffer, context);
  const notationDuration = (controller.timer?.lastMoment ?? 0) / 1000 || duration;
  controller.percent = notationDuration > 0 ? bounded / notationDuration : 0;
  return { seconds: bounded, progress: duration > 0 ? bounded / duration : 0 };
}

/** A new engraving of unchanged source only replaces notation event targets.
 * Keep the audio buffer and its clock untouched, and restore timing from the
 * exact audio offset rather than the last reported beat. */
export function rebindSynthTimingTarget<T>(
  controller: SynthTransport<T>,
  target: T,
  context: { currentTime: number } | null | undefined,
): void {
  controller.visualObj = target;
  const timer = controller.timer;
  if (!timer?.replaceTarget) return;
  const seconds = readWaterfallPosition(controller.midiBuffer, context).currentSeconds;
  const running = timer.isRunning ?? Boolean(controller.midiBuffer?.isRunning);
  timer.pause?.();
  timer.replaceTarget(target);
  if (running) timer.start?.(seconds, 'seconds');
  else timer.setProgress?.(seconds, 'seconds');
  const duration = (timer.lastMoment ?? 0) / 1000;
  controller.percent = duration > 0 ? seconds / duration : 0;
}
