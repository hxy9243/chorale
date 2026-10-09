import { describe, it, expect, vi } from 'vitest';
import abcjs from 'abcjs';
import { buildMeasureOccurrences, collectPreparedMeasureOccurrences, selectMeasureWithRepeats } from '../repeatPlayback';
import { renderPlaybackScore } from '../abcAudio';

describe('repeatPlayback utility', () => {
  it('collects prepared measure occurrences without repeating timing initialization', () => {
    const tune = renderPlaybackScore(document.createElement('div'), 'X:1\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n|: C D E F :|')[0];
    const timing = vi.spyOn(tune, 'setTiming');
    const occurrences = collectPreparedMeasureOccurrences(tune);
    expect(occurrences.map((occurrence) => occurrence.startTimeSec)).toEqual([0, 2]);
    expect(timing).not.toHaveBeenCalled();
    expect(occurrences).toEqual(buildMeasureOccurrences(tune));
    expect(timing).toHaveBeenCalledOnce();
  });
  it('handles scores with standard repeat signs', () => {
    const scratch = document.createElement('div');
    const abc = `X:1
T:Repeats Test
M:4/4
L:1/4
Q:1/4=120
K:C
|: C D E F | G A B c :|
G A B c | d e f g |]`;

    const tunes = abcjs.renderAbc(scratch, abc, { add_classes: true });
    const occurrences = buildMeasureOccurrences(tunes[0]);

    expect(occurrences.length).toBe(6);
    expect(occurrences.map((o) => o.measure)).toEqual([1, 2, 1, 2, 3, 4]);
    expect(occurrences.map((o) => o.startTimeSec)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(occurrences.map((o) => o.playbackPass)).toEqual([0, 0, 1, 1, 1, 1]);

    // When stopped / at 0s, selecting m.2 picks pass 1
    const sel0 = selectMeasureWithRepeats(2, occurrences, 0);
    expect(sel0?.startTimeSec).toBe(occurrences[1].startTimeSec);

    // Near the end of pass 1, selecting m.1 must not jump ahead to pass 2.
    const selPass1 = selectMeasureWithRepeats(1, occurrences, 3.9);
    expect(selPass1?.startTimeSec).toBe(occurrences[0].startTimeSec);

    // Once the playhead is in pass 2, selecting m.2 picks pass 2.
    const selPass2 = selectMeasureWithRepeats(2, occurrences, 4.1);
    expect(selPass2?.startTimeSec).toBe(occurrences[3].startTimeSec);
  });

  it('handles scores with 1st and 2nd endings', () => {
    const scratch = document.createElement('div');
    const abc = `X:1
T:Endings Test
M:4/4
L:1/4
Q:1/4=120
K:C
|: C D E F |1 G A B c :|2 G A B C |]`;

    const tunes = abcjs.renderAbc(scratch, abc, { add_classes: true });
    const occurrences = buildMeasureOccurrences(tunes[0]);

    expect(occurrences.map((o) => o.measure)).toEqual([1, 2, 1, 3]);
    expect(occurrences.map((o) => o.playbackPass)).toEqual([0, 0, 1, 1]);
    expect(selectMeasureWithRepeats(1, occurrences, 6.1)?.startTimeSec).toBe(4);
  });

  it('keeps both passes of a one-measure repeat', () => {
    const scratch = document.createElement('div');
    const abc = `X:1
T:Single Measure Repeat
M:4/4
L:1/4
Q:1/4=120
K:C
|: C D E F :|
G A B c |]`;

    const tunes = abcjs.renderAbc(scratch, abc, { add_classes: true });
    const occurrences = buildMeasureOccurrences(tunes[0]);

    expect(occurrences.map((o) => o.measure)).toEqual([1, 1, 2]);
    expect(occurrences.map((o) => o.startTimeSec)).toEqual([0, 2, 4]);
    expect(occurrences.map((o) => o.playbackPass)).toEqual([0, 1, 1]);
  });

  it('returns empty array when tune is invalid or empty', () => {
    const occurrences = buildMeasureOccurrences(null as any);
    expect(occurrences).toEqual([]);
  });

  it('returns null when target measure is not found', () => {
    const occurrences = [{
      measure: 1,
      startTimeSec: 0,
      playbackFraction: 0,
      playbackPass: 0,
    }];
    expect(selectMeasureWithRepeats(99, occurrences, 0)).toBeNull();
  });
});
