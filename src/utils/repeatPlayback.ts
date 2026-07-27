import abcjs from 'abcjs';

export interface MeasureOccurrence {
  measure: number;
  startTimeSec: number;
  playbackFraction: number;
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

  const charToMeasure = new Map<number, number>();
  tune.noteTimings?.forEach((ev) => {
    if (typeof ev.startChar === 'number' && typeof ev.measureNumber === 'number') {
      charToMeasure.set(ev.startChar, ev.measureNumber + 1); // 1-based measure
    }
  });

  const audioData = tune.setUpAudio?.({ qpm: bpm });
  const totalDuration = audioData?.totalDuration || 0;
  const events = audioData?.tracks?.[0] || [];

  if (totalDuration <= 0 || events.length === 0) return [];

  let maxStart = 0;
  events.forEach((ev: any) => {
    if (typeof ev.start === 'number') {
      const end = ev.start + (ev.duration || 0);
      if (end > maxStart) maxStart = end;
    }
  });
  if (maxStart <= 0) maxStart = 1;

  const occurrences: MeasureOccurrence[] = [];
  let lastMeasure = -1;

  events.forEach((ev: any) => {
    if (typeof ev.startChar === 'number') {
      const measure = charToMeasure.get(ev.startChar);
      if (measure !== undefined && measure !== lastMeasure) {
        const startTimeSec = (ev.start / maxStart) * totalDuration;
        const playbackFraction = Math.max(0, Math.min(1, startTimeSec / totalDuration));
        occurrences.push({
          measure,
          startTimeSec,
          playbackFraction,
        });
        lastMeasure = measure;
      }
    }
  });

  return occurrences;
}

/**
 * Selects the measure occurrence that best matches current playback state.
 * If audio is playing at `currentPlaybackSeconds`, selects the occurrence corresponding
 * to the current or next repeat pass. If stopped, selects the first pass occurrence.
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

  let chosen = matching[0];
  let minDiff = Infinity;

  for (const occ of matching) {
    const diff = Math.abs(occ.startTimeSec - currentPlaybackSeconds);
    if (diff < minDiff) {
      minDiff = diff;
      chosen = occ;
    }
  }

  return chosen;
}
