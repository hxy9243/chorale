import abcjs from 'abcjs';
import { describe, expect, it } from 'vitest';
import {
  readWaterfallPosition, secondsPerWholeNote, synchronizeSynthSeekClock,
  waterfallNotesFromNoteMap, waterfallNotesFromSequence,
} from '../waterfallPlayback';
import type { SynthPlaybackBuffer, SynthSequence } from '../waterfallPlayback';

const ABC = `X:1
M:4/4
L:1/4
Q:1/4=120
K:C
V:upper
|: [CE]2 z G | A2-A2 :|
V:lower clef=bass
|: C,4 | G,4 :|`;

function resolvedBuffer(abc: string): SynthPlaybackBuffer {
  const tune = abcjs.parseOnly(abc)[0];
  const sequence = tune.setUpAudio({ chordsOff: false });
  const meter = tune.getMeterFraction();
  return {
    flattened: sequence as unknown as SynthSequence,
    millisecondsPerMeasure: tune.millisecondsPerMeasure((sequence as any).tempo),
    meterSize: meter.num / (meter.den ?? 4),
  };
}

describe('waterfall synthesis timeline', () => {
  it('uses real abcjs repeated/chord/tied/multivoice notes and leaves rests silent', () => {
    const notes = waterfallNotesFromSequence(resolvedBuffer(ABC));
    const upper = notes.filter((note) => note.voice === 0);
    expect(upper.map((note) => [note.midiPitch, note.onsetSeconds, note.durationSeconds])).toEqual([
      [60, 0, 1], [64, 0, 1], [67, 1.5, 0.5], [69, 2, 2],
      [60, 4, 1], [64, 4, 1], [67, 5.5, 0.5], [69, 6, 2],
    ]);
    expect(notes.filter((note) => note.voice === 1).map((note) => [note.midiPitch, note.onsetSeconds])).toEqual([
      [48, 0], [55, 2], [48, 4], [55, 6],
    ]);
    expect(new Set(notes.map((note) => note.id)).size).toBe(notes.length);
  });

  it('shares abcjs tempo and non-4/4 meter conversion', () => {
    const buffer = resolvedBuffer('X:1\nM:3/4\nL:1/4\nQ:1/4=60\nK:C\nC D E |');
    expect(secondsPerWholeNote(buffer)).toBe(4);
    expect(waterfallNotesFromSequence(buffer).map((note) => note.onsetSeconds)).toEqual([0, 1, 2]);
  });

  it('honors final resolved note-map timing (including swing) without reinterpreting ABC', () => {
    expect(waterfallNotesFromNoteMap([[{ pitch: 60, start: 0.165, end: 0.25, volume: 90 }]], 2))
      .toEqual([{ id: '0:0', midiPitch: 60, voice: 0, onsetSeconds: 0.33, durationSeconds: 0.16999999999999998 }]);
  });

  it('omits muted and invalid events and matches abcjs articulation gaps', () => {
    const notes = waterfallNotesFromSequence({ millisecondsPerMeasure: 2000, meterSize: 1, flattened: {
      tracks: [[
        { cmd: 'program' },
        { cmd: 'note', pitch: 60, start: 0, duration: 0.5, gap: 0.125, volume: 90 },
        { cmd: 'note', pitch: 61, start: 0, duration: 0.5, volume: 0 },
        { cmd: 'note', pitch: 128, start: 0, duration: 0.5, volume: 90 },
        { cmd: 'note', pitch: 62, start: 0, duration: -0.5, volume: 90 },
      ]],
    } });
    expect(notes).toHaveLength(1);
    expect(notes[0].durationSeconds).toBe(0.75);
  });
});

describe('waterfall WebAudio clock', () => {
  it('advances at exact audio time and freezes at a paused offset without beat callbacks', () => {
    const buffer: SynthPlaybackBuffer = { isRunning: true, startTimeSec: 20, duration: 8.2, fadeLength: 200 };
    const context = { currentTime: 21.123456, state: 'running' };
    const before = { ...buffer };
    expect(readWaterfallPosition(buffer, context).currentSeconds).toBeCloseTo(1.123456, 6);
    expect(buffer).toEqual(before);
    buffer.isRunning = false;
    buffer.pausedTimeSec = 1.123456;
    context.currentTime = 200;
    expect(readWaterfallPosition(buffer, context)).toEqual({ currentSeconds: 1.123456, isPlaying: false });
    buffer.isRunning = true;
    buffer.startTimeSec = 200 - 1.123456;
    buffer.pausedTimeSec = undefined;
    context.currentTime = 200.5;
    expect(readWaterfallPosition(buffer, context).currentSeconds).toBeCloseTo(1.623456, 6);
  });

  it('repairs running seek origin for both the visual clock and the next engine pause', () => {
    const buffer: SynthPlaybackBuffer = { isRunning: true, startTimeSec: 10, pausedTimeSec: 6 };
    const context = { currentTime: 12 };
    synchronizeSynthSeekClock(buffer, context);
    expect(buffer.startTimeSec).toBe(6);
    context.currentTime = 12.125;
    expect(readWaterfallPosition(buffer, context)).toEqual({ currentSeconds: 6.125, isPlaying: true });
  });

  it('uses score-time at changed speed, clamps at the end, and handles suspension/reset', () => {
    const buffer: SynthPlaybackBuffer = { isRunning: true, startTimeSec: 10, duration: 4.2, fadeLength: 200 };
    expect(readWaterfallPosition(buffer, { currentTime: 11 }, 2)).toEqual({ currentSeconds: 2, isPlaying: true });
    expect(readWaterfallPosition(buffer, { currentTime: 15 }, 2)).toEqual({ currentSeconds: 8, isPlaying: true });
    expect(readWaterfallPosition(buffer, { currentTime: 11, state: 'suspended' }, 2)).toEqual({ currentSeconds: 2, isPlaying: false });
    expect(readWaterfallPosition(undefined, undefined)).toEqual({ currentSeconds: 0, isPlaying: false });
    expect(readWaterfallPosition(undefined, undefined, 1, 3)).toEqual({ currentSeconds: 3, isPlaying: false });
  });
});
