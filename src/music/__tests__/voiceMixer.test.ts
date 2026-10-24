import { beforeEach, describe, expect, it } from 'vitest';
import { renderPlaybackScore } from '../../utils/abcAudio';
import { describeMixerVoices, isVoiceAudible, mixVoiceSequence, readVoiceMix, writeVoiceMix } from '../voiceMixer';
import { INSTRUMENTS, searchInstruments } from '../instruments';

const source = `X:1
M:4/4
L:1/4
%%score { lead | bass }
V:lead name="Melody"
V:bass clef=bass name="Bass"
K:C
[V:lead] [I:MIDI=program 73] "C"C D E F | G4 |
[V:bass] C,4 | G,,4 |`;

describe('voice mixer synthesis', () => {
  beforeEach(() => localStorage.clear());
  const prepare = () => {
    const [tune] = renderPlaybackScore(document.createElement('div'), source);
    return { tune, voices: describeMixerVoices(tune, source), sequence: tune.setUpAudio({}) };
  };
  it('uses source voice identity and named tracks, and includes generated accompaniment', () => {
    const { voices } = prepare();
    expect(voices.slice(0, 2).map(({ id, label }) => ({ id, label }))).toEqual([{ id: 'lead', label: 'Melody' }, { id: 'bass', label: 'Bass' }]);
    expect(voices).toHaveLength(3);
    expect(voices[2].id).toBe('accompaniment-1');
  });
  it('overrides every program event and note before loading without changing rhythm, source or original sequence', () => {
    const { voices, sequence } = prepare();
    const original = JSON.stringify(sequence);
    const mixed = mixVoiceSequence(sequence, voices, { lead: { program: 40 }, bass: { muted: true } });
    expect(mixed.tracks[0].filter((event) => event.cmd === 'note' || event.cmd === 'program').every((event) => event.instrument === 40)).toBe(true);
    const notes = mixed.tracks[1].filter((event) => event.cmd === 'note');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((event) => event.volume === 0)).toBe(true);
    expect(mixed.totalDuration).toBe(sequence.totalDuration);
    mixed.tracks.forEach((track, index) => track.forEach((event, position) => {
      if (event.cmd !== 'note') return;
      const originalEvent = sequence.tracks[index][position];
      expect(event).toMatchObject({ ...originalEvent, ...(index === 0 ? { instrument: 40 } : index === 1 ? { volume: 0 } : {}) });
    }));
    expect(JSON.stringify(sequence)).toBe(original);
  });
  it('supports multiple solos, mute precedence and stale solo removal', () => {
    const { voices, sequence } = prepare();
    const settings = { lead: { solo: true }, bass: { solo: true, muted: true }, deleted: { solo: true } };
    expect(voices.map((voice) => isVoiceAudible(voice, voices, settings))).toEqual([true, false, false]);
    expect(mixVoiceSequence(sequence, voices, settings).tracks[2].filter((event) => event.cmd === 'note').every((event) => event.volume === 0)).toBe(true);
    expect(voices.every((voice) => isVoiceAudible(voice, voices, { deleted: { solo: true } }))).toBe(true);
  });
  it('persists choices per document and validates untrusted stored values', () => {
    writeVoiceMix('score-a', { lead: { program: 40, solo: true } });
    expect(readVoiceMix('score-a').lead).toMatchObject({ program: 40, solo: true });
    expect(readVoiceMix('score-b')).toEqual({});
    localStorage.setItem('chorale.voiceMix.bad', '{');
    expect(readVoiceMix('bad')).toEqual({});
    localStorage.setItem('chorale.voiceMix.bad', JSON.stringify({ lead: { program: 900, muted: 'true' }, broken: null }));
    expect(readVoiceMix('bad')).toEqual({ lead: { muted: false, solo: false } });
  });
  it('offers all MIDI programs with readable names and searches names and families', () => {
    expect(INSTRUMENTS).toHaveLength(129);
    expect(INSTRUMENTS[0].name).toBe('Grand Piano');
    expect(searchInstruments('vio').map(({ name }) => name)).toContain('Violin');
    expect(searchInstruments('brass').length).toBeGreaterThan(1);
    expect(searchInstruments('not an instrument')).toHaveLength(0);
  });
});
