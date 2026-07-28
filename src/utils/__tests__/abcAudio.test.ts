import { describe, expect, it } from 'vitest';
import abcjs from 'abcjs';
import { prepareAbcForPlayback } from '../abcAudio';

describe('abcAudio utilities', () => {
  const abcWithMidNoteTempoChange = `X:1
T:Tempo synchronization regression
L:1/4
Q:1/4=60
M:4/4
K:C
V:1
C [Q:1/4=30] D E F | G4 |
V:2
C4 | C4 |`;

  it('removes inline tempo changes but preserves the header tempo', () => {
    const prepared = prepareAbcForPlayback(abcWithMidNoteTempoChange);

    expect(prepared).toContain('\nQ:1/4=60\n');
    expect(prepared).not.toContain('[Q:1/4=30]');
    expect(prepared).toHaveLength(abcWithMidNoteTempoChange.length);
    expect(prepared.indexOf('D E F')).toBe(abcWithMidNoteTempoChange.indexOf('D E F'));
  });

  it('keeps voices aligned when another voice sustains through a tempo change', () => {
    const originalAudio = abcjs.parseOnly(abcWithMidNoteTempoChange)[0].setUpAudio({});
    const preparedAudio = abcjs
      .parseOnly(prepareAbcForPlayback(abcWithMidNoteTempoChange))[0]
      .setUpAudio({});
    const trackEnd = (track: typeof preparedAudio.tracks[number]) => Math.max(
      ...track
        .filter((event) => event.cmd === 'note')
        .map((event) => event.start + event.duration),
    );

    expect(Math.abs(trackEnd(originalAudio.tracks[0]) - trackEnd(originalAudio.tracks[1])))
      .toBeGreaterThan(1);
    expect(trackEnd(preparedAudio.tracks[0])).toBe(trackEnd(preparedAudio.tracks[1]));
    expect(preparedAudio.tracks.map((track) => track.filter((event) => event.cmd === 'note').length))
      .toEqual(originalAudio.tracks.map((track) => track.filter((event) => event.cmd === 'note').length));
  });
});
