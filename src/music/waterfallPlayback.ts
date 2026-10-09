/** Score-time seconds are independent of playback speed, so score anchors and
 * the waterfall use the same timeline even when the audio buffer is rebuilt. */
export interface WaterfallNote {
  id: string;
  midiPitch: number;
  voice: number;
  onsetSeconds: number;
  durationSeconds: number;
}

export interface WaterfallPosition {
  currentSeconds: number;
  isPlaying: boolean;
}

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

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function secondsPerWholeNote(buffer: SynthPlaybackBuffer, speed = 1): number {
  const milliseconds = buffer.millisecondsPerMeasure;
  const meter = buffer.meterSize;
  return finite(milliseconds) && milliseconds > 0 && finite(meter) && meter > 0
    ? milliseconds / 1000 / meter * speed
    : 0;
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
