import { describe, expect, it } from 'vitest';
import { renderPlaybackScore } from '../../utils/abcAudio';
import { describeMixerStaves, setStaffInstrument, staffListeningMix } from '../staffInstruments';
import { describeMixerVoices, mixVoiceSequence } from '../voiceMixer';

const source = `X:1
T:Staff grouping
M:4/4
L:1/4
%%score (S A) B
V:S name="Soprano"
V:A name="Alto"
V:B clef=bass
K:C
[V:S] [I:MIDI=program 73] C D E F | [I:MIDI=program 72] G4 |
[V:A] E4 | F4 |
[V:B] C,4 | G,,4 |`;
const parse = (abc: string) => renderPlaybackScore(document.createElement('div'), abc)[0];

describe('staff source instruments', () => {
  it('groups simultaneous voices by actual staff and changes every program on only that staff', () => {
    const tune = parse(source);
    const staves = describeMixerStaves(tune, source);
    expect(staves.map((staff) => staff.voiceIds)).toEqual([['S', 'A'], ['B']]);
    expect(staves[0].mixed).toBe(true);
    const changed = setStaffInstrument(source, staves[0], 40);
    expect(changed).toContain('%%score (S A) B');
    expect(changed).toContain('C,4 | G,,4 |');
    const sequence = parse(changed).setUpAudio({});
    expect(sequence.tracks.slice(0, 2).every((track) => track.filter((event) => event.cmd === 'note').every((event) => event.instrument === 40))).toBe(true);
    expect(sequence.tracks[2].filter((event) => event.cmd === 'note').every((event) => event.instrument === 0)).toBe(true);
    expect(describeMixerStaves(parse(changed), changed)[0]).toMatchObject({ program: 40, mixed: false });
  });
  it('preserves implicit voices, prose, comments, channels and later line directives', () => {
    const abc = 'X:1\r\nT:"[I:MIDI=program 12]"\r\nM:4/4\r\nL:1/4\r\n%%MIDI program 0\r\nK:C\r\nC4 | % [I:MIDI=program 9]\r\n%%MIDI program 1 73 % sound\r\nD4 |';
    const [staff] = describeMixerStaves(parse(abc), abc);
    const changed = setStaffInstrument(abc, staff, 42);
    expect(changed).not.toContain('V:');
    expect(changed).toContain('T:"[I:MIDI=program 12]"');
    expect(changed).toContain('% [I:MIDI=program 9]');
    expect(changed).toContain('%%MIDI program 1 42 % sound\r\n');
    expect(parse(changed).setUpAudio({}).tracks[0].filter((event) => event.cmd === 'note').every((event) => event.instrument === 42)).toBe(true);
  });
  it('keeps repeated changes stable and edits later staves after expanded rests at original source offsets', () => {
    const abc = 'X:1\nM:4/4\nL:1/4\n%%score S B\nV:S\nV:B clef=bass\nK:C\n[V:S] Z12 |\n[V:B] C,4 | Z11 |';
    const bass = describeMixerStaves(parse(abc), abc)[1];
    const changed = setStaffInstrument(abc, bass, 42);
    expect(changed).toContain('[V:S] Z12 |');
    expect(changed).toMatch(/\[V:B\]\s*\[I:MIDI=program 42\]\s*C,4/);
    const again = setStaffInstrument(changed, describeMixerStaves(parse(changed), changed)[1], 70);
    expect(again.match(/I:MIDI=program/g)).toHaveLength(1);
    expect(parse(again).setUpAudio({}).tracks[1].filter((event) => event.cmd === 'note').every((event) => event.instrument === 70)).toBe(true);
  });
  it('reads instruments back from edited ABC and ignores legacy local program overrides', () => {
    const abc = setStaffInstrument(source, describeMixerStaves(parse(source), source)[1], 70);
    const tune = parse(abc);
    const staves = describeMixerStaves(tune, abc);
    const voices = describeMixerVoices(tune, abc);
    const mix = staffListeningMix(voices, staves, { [staves[0].id]: { solo: true, program: 99 }, [staves[1].id]: { program: 1 } });
    const sequence = mixVoiceSequence(tune.setUpAudio({}), voices, mix);
    expect(sequence.tracks[2].filter((event) => event.cmd === 'note').every((event) => event.instrument === 70 && event.volume === 0)).toBe(true);
    expect(staves[1].program).toBe(70);
    expect(mix[voices[0].id].program).toBeUndefined();
  });
});
