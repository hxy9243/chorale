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

  const abcWithInlineStaffChanges = `X:1
T:Cross-staff synchronization regression
L:1/4
Q:1/4=60
M:2/4
K:C
%%score { 1 | 2 }
V:1
C2 | C2 |
V:2
!f![I:staff -1] C/[I:staff +1] D/ E/ F/ | C2 |`;

  it('removes unsupported inline playback directives while preserving source offsets', () => {
    const prepared = prepareAbcForPlayback(abcWithMidNoteTempoChange);
    const preparedCrossStaff = prepareAbcForPlayback(abcWithInlineStaffChanges);

    expect(prepared).toContain('\nQ:1/4=60\n');
    expect(prepared).not.toContain('[Q:1/4=30]');
    expect(prepared).toHaveLength(abcWithMidNoteTempoChange.length);
    expect(prepared.indexOf('D E F')).toBe(abcWithMidNoteTempoChange.indexOf('D E F'));
    expect(preparedCrossStaff).not.toContain('[I:staff -1]');
    expect(preparedCrossStaff).not.toContain('[I:staff +1]');
    expect(preparedCrossStaff).toHaveLength(abcWithInlineStaffChanges.length);
    expect(preparedCrossStaff.indexOf('D/ E/ F/'))
      .toBe(abcWithInlineStaffChanges.indexOf('D/ E/ F/'));
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

  it('does not let cross-staff directives create phantom notes and shift one hand', () => {
    const originalAudio = abcjs.parseOnly(abcWithInlineStaffChanges)[0].setUpAudio({});
    const preparedAudio = abcjs
      .parseOnly(prepareAbcForPlayback(abcWithInlineStaffChanges))[0]
      .setUpAudio({});
    const trackEnd = (track: typeof preparedAudio.tracks[number]) => Math.max(
      ...track
        .filter((event) => event.cmd === 'note')
        .map((event) => event.start + event.duration),
    );

    expect(trackEnd(originalAudio.tracks[1])).toBeGreaterThan(trackEnd(originalAudio.tracks[0]));
    expect(trackEnd(preparedAudio.tracks[0])).toBe(trackEnd(preparedAudio.tracks[1]));
    expect(preparedAudio.tracks.map((track) => track.filter((event) => event.cmd === 'note').length))
      .toEqual([2, 5]);
  });

  it('engraves both staves with the same measure barline', () => {
    const barXs = (source: string) => {
      const scratch = document.createElement('div');
      abcjs.renderAbc(scratch, source, { add_classes: true });

      return Array.from(scratch.querySelectorAll<SVGPathElement>('.abcjs-mm0.abcjs-bar path'))
        .map((bar) => Number(bar.getAttribute('d')?.match(/^M ([\d.]+)/)?.[1]));
    };

    const preparedBarXs = barXs(prepareAbcForPlayback(abcWithInlineStaffChanges));

    expect(barXs(abcWithInlineStaffChanges)).toHaveLength(1);
    expect(preparedBarXs).toHaveLength(2);
    expect(new Set(preparedBarXs)).toHaveLength(1);
  });
});
