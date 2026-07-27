import abcjs from 'abcjs';

type TimedTune = abcjs.TuneObject & {
  noteTimings?: abcjs.NoteTimingEvent[];
};

export interface MeasureOccurrence {
  measure: number;
  startTimeSec: number;
  playbackFraction: number;
  playbackPass: number;
}

export interface PlaybackPosition {
  currentSeconds: number;
  isPlaying: boolean;
}

/**
 * Builds an array of visual measure occurrences in chronological audio playback order,
 * properly accounting for unrolled repeats, endings, and multi-track voices.
 */
export function buildMeasureOccurrences(tune: abcjs.TuneObject): MeasureOccurrence[] {
  if (!tune) return [];

  const bpm = tune.getBpm?.() || 120;
  try {
    tune.setTiming?.(bpm);
  } catch {
    // If setTiming fails (e.g. tune not drawn yet), return empty
    return [];
  }

  // setTiming produces the same unrolled event sequence used by SynthController,
  // with timestamps already expressed in real milliseconds. Using setUpAudio track
  // units here would make selection drift whenever tempo or repeats are involved.
  const events = (tune as TimedTune).noteTimings?.filter((event) => (
    event.type === 'event'
      && typeof event.measureNumber === 'number'
      && Number.isFinite(event.milliseconds)
  )) || [];
  const totalDuration = tune.getTotalTime?.() || 0;

  if (totalDuration <= 0 || events.length === 0) return [];

  const occurrences: MeasureOccurrence[] = [];
  let lastTimingMeasure = -1;
  let playbackPass = 0;

  events.forEach((event) => {
    const measure = event.measureNumber! + 1;
    const startsMeasure = event.measureStart === true || measure !== lastTimingMeasure;
    lastTimingMeasure = measure;
    if (!startsMeasure) return;

    const previous = occurrences[occurrences.length - 1];
    const startTimeSec = event.milliseconds / 1000;
    if (previous?.measure === measure && previous.startTimeSec === startTimeSec) return;

    // A repeat (including a one-measure repeat) rewinds the visual measure number.
    // Keeping that rewind count lets selection stay in the playhead's current pass.
    if (previous && measure <= previous.measure) {
      playbackPass += 1;
    }

    occurrences.push({
      measure,
      startTimeSec,
      playbackFraction: Math.max(0, Math.min(1, startTimeSec / totalDuration)),
      playbackPass,
    });
  });

  return occurrences;
}

/**
 * Selects the target measure in the same unrolled repeat pass as the playhead.
 * A zero playhead selects the first pass. A paused playhead keeps its current pass.
 */
export function selectMeasureWithRepeats(
  targetMeasure: number,
  occurrences: MeasureOccurrence[],
  currentPlaybackSeconds: number = 0,
): MeasureOccurrence | null {
  if (!occurrences || occurrences.length === 0) return null;

  const matching = occurrences.filter((occ) => occ.measure === targetMeasure);
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  if (currentPlaybackSeconds <= 0) {
    return matching[0];
  }

  let currentOccurrence = occurrences[0];
  for (const occurrence of occurrences) {
    if (occurrence.startTimeSec > currentPlaybackSeconds) break;
    currentOccurrence = occurrence;
  }

  const samePass = matching.find(
    (occurrence) => occurrence.playbackPass === currentOccurrence.playbackPass,
  );
  if (samePass) return samePass;

  // Alternate endings do not necessarily contain every visual measure. In that
  // case use the most recent pass in which the requested measure exists.
  for (let index = matching.length - 1; index >= 0; index -= 1) {
    if (matching[index].playbackPass < currentOccurrence.playbackPass) {
      return matching[index];
    }
  }

  return matching[0];
}
