import { describe, expect, it } from 'vitest';
import abcjs from 'abcjs';
import {
  bindAudioSynthesis,
  clearAudioTuneCache,
  configureAudioPlayback,
  hideSvgNode,
  hideSyntheticTupletRests,
  prepareAbcForAudio,
  prepareAbcForPlayback,
} from '../abcAudio';

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

  const abcWithInvisibleTupletRest = `X:1
T:Invisible tuplet rest regression
L:1/4
M:2/4
K:C
(3x/C/E/ C |`;

  const abcWithHairpin = `X:1
T:Hairpin synthesis regression
L:1/4
M:4/4
K:C
!p! C !>(! D E F !>)! | G4 |`;

  const abcWithSelfContainedTuplet = `X:1
T:Self-contained tuplet timing regression
L:1/4
M:4/4
K:C
%%score { 1 | 2 }
V:1
C4 | D4 | E4 | F4 |
V:2
x2 (3:2:2A,/ (D, (3:2:1C,3/2) | B,4 | C4 | D4 |`;

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

    const preparedTuplet = prepareAbcForPlayback(abcWithInvisibleTupletRest);
    expect(preparedTuplet).toContain('(3z/C/E/');
    expect(preparedTuplet).toHaveLength(abcWithInvisibleTupletRest.length);
    expect(preparedTuplet.indexOf('C/E/')).toBe(abcWithInvisibleTupletRest.indexOf('C/E/'));

    const preparedHairpinAudio = prepareAbcForAudio(abcWithHairpin);
    expect(prepareAbcForPlayback(abcWithHairpin)).toContain('!>(!');
    expect(preparedHairpinAudio).not.toContain('!>(!');
    expect(preparedHairpinAudio).not.toContain('!>)!');
    expect(preparedHairpinAudio).toContain('!p!');
    expect(preparedHairpinAudio).toHaveLength(abcWithHairpin.length);
    expect(preparedHairpinAudio.indexOf('G4')).toBe(abcWithHairpin.indexOf('G4'));
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

  it('anchors an invisible-rest triplet without displaying the synthetic rest', () => {
    const scratch = document.createElement('div');
    const prepared = prepareAbcForPlayback(abcWithInvisibleTupletRest);
    const tunes = abcjs.renderAbc(scratch, prepared, { add_classes: true });

    hideSyntheticTupletRests(abcWithInvisibleTupletRest, tunes);

    const hiddenRests = scratch.querySelectorAll<SVGGElement>(
      '.abcjs-rest[visibility="hidden"][aria-hidden="true"]',
    );
    expect(hiddenRests).toHaveLength(1);
    expect(hiddenRests[0].getAttribute('pointer-events')).toBe('none');
    expect(scratch.querySelector('.abcjs-triplet')).not.toBeNull();

    const originalAudio = abcjs.parseOnly(abcWithInvisibleTupletRest)[0].setUpAudio({});
    const preparedAudio = tunes[0].setUpAudio({});
    expect(preparedAudio.totalDuration).toBe(originalAudio.totalDuration);
  });

  it('uses hairpin-safe audio without removing the engraved decorations', () => {
    const scratch = document.createElement('div');
    const tunes = abcjs.renderAbc(scratch, prepareAbcForPlayback(abcWithHairpin), {
      add_classes: true,
    });
    const originalAudio = tunes[0].setUpAudio({});

    configureAudioPlayback(abcWithHairpin, tunes);
    const configuredAudio = tunes[0].setUpAudio({});

    expect(scratch.querySelector('.abcjs-dynamics[data-name="dynamics"]')).not.toBeNull();
    expect(configuredAudio.totalDuration).toBe(originalAudio.totalDuration);
    expect(configuredAudio.tracks[0].filter((event) => event.cmd === 'note'))
      .toHaveLength(originalAudio.tracks[0].filter((event) => event.cmd === 'note').length);
    expect(configuredAudio.tracks[0]
      .filter((event) => event.cmd === 'note')
      .every((event) => event.volume > 0)).toBe(true);
  });

  it('does not leak a self-contained tuplet multiplier into later measures', () => {
    const scratch = document.createElement('div');
    const tunes = abcjs.renderAbc(
      scratch,
      prepareAbcForPlayback(abcWithSelfContainedTuplet),
      { add_classes: true },
    );

    configureAudioPlayback(abcWithSelfContainedTuplet, tunes);
    const secondVoiceNotes = tunes[0].setUpAudio({}).tracks[1]
      .filter((event) => event.cmd === 'note');

    expect(secondVoiceNotes).toHaveLength(6);
    expect(secondVoiceNotes.slice(3).map((event) => event.start)).toEqual([1, 2, 3]);
    expect(secondVoiceNotes.slice(3).map((event) => event.duration)).toEqual([1, 1, 1]);
    expect(scratch.querySelectorAll('.abcjs-triplet')).toHaveLength(2);
  });

  it('caches audio tune objects for repeated calls with the same ABC string', () => {
    clearAudioTuneCache();
    const scratch = document.createElement('div');
    const tunes1 = abcjs.renderAbc(scratch, prepareAbcForPlayback(abcWithHairpin));
    const tunes2 = abcjs.renderAbc(scratch, prepareAbcForPlayback(abcWithHairpin));

    configureAudioPlayback(abcWithHairpin, tunes1);
    const audio1 = tunes1[0].setUpAudio;

    configureAudioPlayback(abcWithHairpin, tunes2);
    const audio2 = tunes2[0].setUpAudio;

    expect(audio1).toBeDefined();
    expect(audio2).toBeDefined();
  });

  it('safely handles binding audio synthesis to malformed tune objects', () => {
    const target = {} as abcjs.TuneObject;
    const invalidSource = {} as abcjs.TuneObject;
    expect(bindAudioSynthesis(target, invalidSource)).toBe(false);

    const validSource = { setUpAudio: () => ({}) } as unknown as abcjs.TuneObject;
    expect(bindAudioSynthesis(target, validSource)).toBe(true);
    expect(typeof target.setUpAudio).toBe('function');
  });

  it('safely conceals SVG nodes without throwing errors when missing or invalid', () => {
    expect(() => hideSvgNode(null)).not.toThrow();
    expect(() => hideSvgNode(undefined)).not.toThrow();

    const mockElem = { setAttribute: vi.fn() } as unknown as SVGElement;
    hideSvgNode(mockElem);
    expect(mockElem.setAttribute).toHaveBeenCalledWith('visibility', 'hidden');
  });
});

