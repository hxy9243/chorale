import { describe, it, expect } from 'vitest';
import abcjs from 'abcjs';
import { buildMeasureOccurrences, selectMeasureWithRepeats } from '../repeatPlayback';

describe('repeatPlayback utility', () => {
  it('handles scores with standard repeat signs', () => {
    const scratch = document.createElement('div');
    const abc = `X:1
T:Repeats Test
M:4/4
L:1/4
K:C
|: C D E F | G A B c :|
G A B c | d e f g |]`;

    const tunes = abcjs.renderAbc(scratch, abc, { add_classes: true });
    const occurrences = buildMeasureOccurrences(tunes[0]);

    expect(occurrences.length).toBe(6);
    expect(occurrences.map((o) => o.measure)).toEqual([1, 2, 1, 2, 3, 4]);

    // When stopped / at 0s, selecting m.2 picks pass 1
    const sel0 = selectMeasureWithRepeats(2, occurrences, 0);
    expect(sel0?.startTimeSec).toBe(occurrences[1].startTimeSec);

    // When playing at pass 2 (e.g. 2.5s), selecting m.2 picks pass 2
    const selPass2 = selectMeasureWithRepeats(2, occurrences, 2.5);
    expect(selPass2?.startTimeSec).toBe(occurrences[3].startTimeSec);
  });

  it('handles scores with 1st and 2nd endings', () => {
    const scratch = document.createElement('div');
    const abc = `X:1
T:Endings Test
M:4/4
L:1/4
K:C
|: C D E F |1 G A B c :|2 G A B C |]`;

    const tunes = abcjs.renderAbc(scratch, abc, { add_classes: true });
    const occurrences = buildMeasureOccurrences(tunes[0]);

    expect(occurrences.map((o) => o.measure)).toEqual([1, 2, 1, 3]);
  });

  it('returns empty array when tune is invalid or empty', () => {
    const occurrences = buildMeasureOccurrences(null as any);
    expect(occurrences).toEqual([]);
  });

  it('returns null when target measure is not found', () => {
    const occurrences = [{ measure: 1, startTimeSec: 0, playbackFraction: 0 }];
    expect(selectMeasureWithRepeats(99, occurrences, 0)).toBeNull();
  });
});
