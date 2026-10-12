import abcjs from 'abcjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractScoreSystems, getEstimatedScoreVideoSize, recordScoreVideo } from '../scoreVideoRecorder';
import type { SynthSequenceNote } from '../waterfallPlayback';

const abc = 'X:1\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n|: C2-C2 | [CEG]4 :|';
function buffer(channels = 1, length = 1220, sampleRate = 100): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (ch: number) => data[ch] } as AudioBuffer;
}

afterEach(() => vi.restoreAllMocks());

describe('Waterfall video preparation', () => {
  it('uses resolved synth pitches and exact clock, independently of notation timing and release tail', async () => {
    let callback: ((tracks: SynthSequenceNote[][]) => void) | undefined;
    const resolved = [[
      { pitch: 60, start: 0, end: 2 }, // tied across the written bar
      { pitch: 64, start: 2, end: 3 },
      { pitch: 67, start: 2, end: 3 }, // chord
      { pitch: 60, start: 4, end: 6 }, // repeated passage
    ], [{ pitch: 48, start: 1, end: 2 }]];
    // Exercise the real initAbcjsSynth callback forwarding and note-map adapter.
    vi.spyOn(abcjs.synth, 'CreateSynth').mockImplementation(function () {
      return {
        millisecondsPerMeasure: 1000, meterSize: 0.5, audioBuffers: [buffer()],
        init: vi.fn(async (options: { options: { sequenceCallback: typeof callback } }) => { callback = options.options.sequenceCallback; }),
        prime: vi.fn(async () => { callback?.(resolved); }),
      };
    } as never);
    const audioContext = { createBuffer: buffer } as unknown as AudioContext;
    const result = await extractScoreSystems(abc, 'warm', audioContext, 'waterfall');
    expect(result.waterfallNotes).toEqual([
      expect.objectContaining({ midiPitch: 60, voice: 0, onsetSeconds: 0, durationSeconds: 4 }),
      expect.objectContaining({ midiPitch: 48, voice: 1, onsetSeconds: 2, durationSeconds: 2 }),
      expect.objectContaining({ midiPitch: 64, voice: 0, onsetSeconds: 4, durationSeconds: 2 }),
      expect.objectContaining({ midiPitch: 67, voice: 0, onsetSeconds: 4, durationSeconds: 2 }),
      expect.objectContaining({ midiPitch: 60, voice: 0, onsetSeconds: 8, durationSeconds: 4 }),
    ]);
    expect(result.totalScoreTimeSec).toBe(result.audioBuffer?.duration);
    expect(result.totalScoreTimeSec).toBe(12.2);
    expect(result.systemImages.every(system => system.image === null)).toBe(true);
    expect(document.querySelector('[style*="-9999px"]')).toBeNull();
  });

  it('rejects waterfall preparation from an SVG without its synthesis source', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    await expect(extractScoreSystems(svg, 'warm', null, 'waterfall')).rejects.toThrow('requires the ABC score');
  });

  it('refuses an export with missing synchronized audio or note data', async () => {
    const canvas = document.createElement('canvas');
    await expect(recordScoreVideo(canvas, { systems: [], noteEvents: [], systemImages: [], totalScoreTimeSec: 8 }, {
      width: 720, height: 1280, aspectRatio: '9:16', theme: 'warm', visualization: 'waterfall', introDurationSec: 0, outroDurationSec: 0, metadata: { title: 'Test' },
    })).rejects.toThrow('synchronized piano notes and audio');
  });

  it('budgets motion exports independently of static sheet estimates', () => {
    expect(getEstimatedScoreVideoSize(60, 'compact', 'mp4', 'waterfall').bytes)
      .toBeGreaterThan(getEstimatedScoreVideoSize(60, 'compact', 'mp4', 'sheet').bytes);
  });
});
