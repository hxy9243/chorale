import abcjs from 'abcjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractScoreSystems, getEstimatedScoreVideoSize, recordScoreVideo, type ScoreVideoAudioCache } from '../scoreVideoRecorder';
import type { SynthSequenceNote } from '../waterfallPlayback';

const abc = 'X:1\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n|: C2-C2 | [CEG]4 :|';
function buffer(channels = 1, length = 1220, sampleRate = 100): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (ch: number) => data[ch] } as AudioBuffer;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mockSynth(tracks: SynthSequenceNote[][] = [[{ pitch: 60, start: 0, end: 1 }]]) {
  const prime = vi.fn(async () => {});
  const create = vi.spyOn(abcjs.synth, 'CreateSynth').mockImplementation(function () {
    let callback: ((notes: SynthSequenceNote[][]) => void) | undefined;
    return {
      millisecondsPerMeasure: 1000, meterSize: 0.5, audioBuffers: [buffer()],
      init: async (options: { options: { sequenceCallback: typeof callback } }) => { callback = options.options.sequenceCallback; },
      prime: async () => { await prime(); callback?.(tracks); },
    };
  } as never);
  return { create, prime };
}

describe('Waterfall video preparation', () => {
  it('shares in-flight synthesis when switching from sheet to waterfall and skips abandoned sheet images', async () => {
    const { create, prime } = mockSynth();
    let finish!: () => void;
    prime.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const context = { createBuffer: vi.fn(buffer) } as unknown as AudioContext;
    const audioCache: ScoreVideoAudioCache = {};
    const controller = new AbortController();
    const serialize = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const sheet = extractScoreSystems(abc, 'dark', context, 'sheet', { audioCache, signal: controller.signal });
    const abandoned = expect(sheet).rejects.toMatchObject({ name: 'AbortError' });
    const waterfall = extractScoreSystems(abc, 'warm', context, 'waterfall', { audioCache });
    await vi.waitFor(() => expect(prime).toHaveBeenCalledTimes(1));
    controller.abort();
    finish();
    await abandoned;
    const result = await waterfall;
    const darkResult = await extractScoreSystems(abc, 'dark', context, 'waterfall', { audioCache });
    expect(create).toHaveBeenCalledTimes(1);
    expect(context.createBuffer).toHaveBeenCalledTimes(1);
    expect(result.waterfallNotes).toHaveLength(1);
    expect(darkResult.audioBuffer).toBe(result.audioBuffer);
    expect(result.totalScoreTimeSec).toBe(12.2);
    expect(serialize).not.toHaveBeenCalled();
    expect(document.querySelector('[style*="-9999px"]')).toBeNull();
  });

  it('reuses completed audio while rebuilding themed sheet images', async () => {
    const { create } = mockSynth();
    vi.stubGlobal('Image', class {
      onload?: () => void;
      set src(_url: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sheet');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const serialize = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const context = { createBuffer: vi.fn(buffer) } as unknown as AudioContext;
    const audioCache: ScoreVideoAudioCache = {};
    const dark = await extractScoreSystems(abc, 'dark', context, 'sheet', { audioCache });
    const darkXml = serialize.mock.results.map(result => result.value).join('');
    serialize.mockClear();
    const waterfall = await extractScoreSystems(abc, 'warm', context, 'waterfall', { audioCache });
    const warm = await extractScoreSystems(abc, 'warm', context, 'sheet', { audioCache });
    const warmXml = serialize.mock.results.map(result => result.value).join('');
    expect(create).toHaveBeenCalledTimes(1);
    expect(context.createBuffer).toHaveBeenCalledTimes(1);
    expect(dark.audioBuffer).toBe(waterfall.audioBuffer);
    expect(warm.audioBuffer).toBe(waterfall.audioBuffer);
    expect(dark.systemImages.some(system => system.image)).toBe(true);
    expect(warm.systemImages.some(system => system.image)).toBe(true);
    expect(darkXml).toContain('stroke: #f8fafc !important');
    expect(warmXml).toContain('stroke: #1c1917 !important');
    expect(waterfall.totalScoreTimeSec).toBe(12.2);
  });

  it('keeps only the latest source and audio context in the session cache', async () => {
    const { create } = mockSynth();
    const first = { createBuffer: buffer } as unknown as AudioContext;
    const second = { createBuffer: buffer } as unknown as AudioContext;
    const audioCache: ScoreVideoAudioCache = {};
    await extractScoreSystems(abc, 'warm', first, 'waterfall', { audioCache });
    await extractScoreSystems(abc, 'warm', second, 'waterfall', { audioCache });
    await extractScoreSystems(`${abc}\n`, 'warm', second, 'waterfall', { audioCache });
    await extractScoreSystems(abc, 'warm', second, 'waterfall', { audioCache });
    expect(create).toHaveBeenCalledTimes(4);
  });

  it('evicts failed synthesis so the same source can retry', async () => {
    const { create, prime } = mockSynth();
    prime.mockRejectedValueOnce(new Error('Soundfont unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const context = { createBuffer: buffer } as unknown as AudioContext;
    const audioCache: ScoreVideoAudioCache = {};
    await expect(extractScoreSystems(abc, 'warm', context, 'waterfall', { audioCache })).rejects.toThrow('synchronized piano audio');
    expect(audioCache.current).toBeUndefined();
    const result = await extractScoreSystems(abc, 'warm', context, 'waterfall', { audioCache });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.audioBuffer?.duration).toBe(12.2);
  });

  it('caches valid all-rest audio with an empty resolved note map', async () => {
    const { create } = mockSynth([]);
    const context = { createBuffer: buffer } as unknown as AudioContext;
    const audioCache: ScoreVideoAudioCache = {};
    const rests = 'X:1\nM:4/4\nK:C\nz8';
    const warm = await extractScoreSystems(rests, 'warm', context, 'waterfall', { audioCache });
    const dark = await extractScoreSystems(rests, 'dark', context, 'waterfall', { audioCache });
    expect(create).toHaveBeenCalledTimes(1);
    expect(warm.waterfallNotes).toEqual([]);
    expect(dark.audioBuffer).toBe(warm.audioBuffer);
    expect(dark.totalScoreTimeSec).toBe(12.2);
  });

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
