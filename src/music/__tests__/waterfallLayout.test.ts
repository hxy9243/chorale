import { describe, expect, it } from 'vitest';
import { pianoKeys, isBlackKey, pitchLabel, indexNoteWindow, visibleNotes, noteGeometry } from '../waterfallLayout';
import type { WaterfallNote } from '../waterfallPlayback';
const note = (midiPitch: number, onsetSeconds = 1, durationSeconds = 1): WaterfallNote => ({ id: `${midiPitch}:${onsetSeconds}`, voice: 0, midiPitch, onsetSeconds, durationSeconds });
describe('waterfall pitch and time geometry', () => {
  it('groups black keys in twos and threes with no E/B sharps', () => {
    const keys = pianoKeys([note(60), note(83)]);
    expect(keys.filter((key) => key.black).map((key) => key.midiPitch)).toEqual([61, 63, 66, 68, 70, 73, 75, 78, 80, 82]);
    expect(keys.find((key) => key.midiPitch === 61)?.x).toBeCloseTo(0.69);
    expect(keys.find((key) => key.midiPitch === 65)?.x).toBe(3);
    expect(isBlackKey(64)).toBe(false);
    expect(isBlackKey(71)).toBe(false);
    expect(pitchLabel(60)).toBe('C4');
  });
  it('includes extreme notes and always provides at least two octaves', () => {
    expect(pianoKeys([note(0), note(127)]).at(-1)?.midiPitch).toBe(127);
    expect(pianoKeys([note(60)]).length).toBe(24);
    expect(pianoKeys([note(127)]).length).toBeGreaterThanOrEqual(24);
    expect(pianoKeys([]).length).toBe(24);
  });
  it('prunes dense expired history beneath a long held note', () => {
    let reads = 0;
    const notes = Array.from({ length: 10000 }, (_, i) => ({ ...note(60, i, 0.1), get durationSeconds() { reads++; return 0.1; } }));
    notes.unshift(note(48, 0, 20000));
    const index = indexNoteWindow(notes);
    reads = 0;
    expect(visibleNotes(index, 9999).length).toBe(2);
    expect(reads).toBeLessThan(50);
  });
  it('places leading edge exactly at the keyboard at onset without a strike gap', () => {
    expect(noteGeometry(note(60), 0, 400).bottom).toBe(320);
    expect(noteGeometry(note(60), 1, 400)).toEqual({ y: 320, height: 80, bottom: 400 });
    expect(noteGeometry(note(60), 1.5, 400).height).toBe(40);
    expect(noteGeometry(note(60), 2, 400).height).toBe(0);
  });
  it('finds overlapping held notes after arbitrary seek and removes exact note ends', () => {
    const held = note(48, 0, 20);
    const index = indexNoteWindow([note(62, 25), note(64, 10), held, note(60, 1)]);
    expect(visibleNotes(index, 10).map((n) => n.midiPitch)).toEqual([48, 64]);
    expect(visibleNotes(index, 11).map((n) => n.midiPitch)).toEqual([48]);
    expect(visibleNotes(index, 20).map((n) => n.midiPitch)).toEqual([62]);
    expect(visibleNotes(index, 0).map((n) => n.midiPitch)).toEqual([48, 60]);
  });
});
