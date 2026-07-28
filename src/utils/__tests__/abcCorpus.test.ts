import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import abcjs from 'abcjs';
import {
  configureAudioPlayback,
  hideSyntheticTupletRests,
  prepareAbcForPlayback,
} from '../abcAudio';

const fixtureDirectory = resolve(process.cwd(), 'src/test/fixtures/abc');
const corpus = readdirSync(fixtureDirectory)
  .filter((filename) => filename.endsWith('.abc'))
  .sort()
  .map((filename) => ({
    filename,
    source: readFileSync(resolve(fixtureDirectory, filename), 'utf8'),
  }));

const render = (originalAbc: string) => {
  const scratch = document.createElement('div');
  const tunes = abcjs.renderAbc(scratch, prepareAbcForPlayback(originalAbc), {
    add_classes: true,
  });
  hideSyntheticTupletRests(originalAbc, tunes);
  configureAudioPlayback(originalAbc, tunes);
  return { scratch, tunes };
};

const voiceMeasureRanges = (source: string, voice: number) => {
  const voiceMarker = `\nV:${voice}\n`;
  const voiceStart = source.indexOf(voiceMarker) + voiceMarker.length;
  const nextVoiceStart = source.indexOf('\nV:', voiceStart);
  const voiceEnd = nextVoiceStart >= 0 ? nextVoiceStart : source.length;
  const ranges: Array<{ start: number; end: number }> = [];
  let measureStart = voiceStart;

  for (let offset = voiceStart; offset < voiceEnd; offset += 1) {
    if (source[offset] !== '|') continue;
    ranges.push({ start: measureStart, end: offset + 1 });
    measureStart = offset + 1;
  }

  return ranges;
};

describe('ABC corpus', () => {
  it('contains every supplied ABC regression fixture', () => {
    expect(corpus.map(({ filename }) => filename)).toEqual(expect.arrayContaining([
      'beethoven.abc',
      'fur_elise.abc',
      'moonlight.abc',
      'mozart_10.abc',
    ]));
  });

  it.each(corpus)('renders and prepares audio for $filename', ({ source }) => {
    const { scratch, tunes } = render(source);
    const syntheticRestCount = source.match(/\(\d(?::\d*){0,2}[ \t]*x/g)?.length ?? 0;

    expect(tunes.length).toBeGreaterThan(0);
    expect(scratch.querySelector('svg')).not.toBeNull();
    expect(scratch.querySelectorAll('.abcjs-rest[visibility="hidden"]'))
      .toHaveLength(syntheticRestCount);
    for (const tune of tunes) {
      expect(() => tune.setTiming?.(tune.getBpm?.())).not.toThrow();
      expect(() => tune.setUpAudio({})).not.toThrow();
    }
  });

  it('keeps Moonlight measures 40 through 44 aligned across every voice', () => {
    const moonlight = corpus.find(({ filename }) => filename === 'moonlight.abc');
    expect(moonlight).toBeDefined();

    const { scratch, tunes } = render(moonlight!.source);
    const audio = tunes[0].setUpAudio({});

    for (const measure of [40, 41, 42, 43, 44]) {
      for (const [voiceIndex, track] of audio.tracks.entries()) {
        const range = voiceMeasureRanges(moonlight!.source, voiceIndex + 1)[measure - 1];
        const sourceMeasureNotes = track.filter((event) => (
          event.cmd === 'note'
          && event.startChar >= range.start
          && event.startChar < range.end
        ));

        expect(
          sourceMeasureNotes.every((event) => (
            event.cmd === 'note'
            && event.start >= measure - 1
            && event.start < measure
          )),
          `voice ${voiceIndex + 1}, measure ${measure}`,
        ).toBe(true);
      }

      const barXs = Array.from(
        scratch.querySelectorAll<SVGPathElement>(
          `.abcjs-mm${measure - 1}.abcjs-bar path`,
        ),
      ).map((bar) => Number(bar.getAttribute('d')?.match(/^M ([\d.]+)/)?.[1]));
      expect(barXs).toHaveLength(2);
      expect(new Set(barXs)).toHaveLength(1);
    }
  });

  it('renders Moonlight measures 40 through 44 with the intended second-treble notes', () => {
    const moonlight = corpus.find(({ filename }) => filename === 'moonlight.abc');
    expect(moonlight).toBeDefined();

    const { tunes } = render(moonlight!.source);
    const secondTrebleVoice = tunes[0].setUpAudio({}).tracks[1];
    const ranges = voiceMeasureRanges(moonlight!.source, 2);
    const expectedPitches = new Map<number, number[]>([
      [40, [48]],
      [41, []],
      [42, [52, 56, 61, 56, 61, 64, 56, 61, 64, 56, 61, 64]],
      [43, [56, 63, 66, 56, 63, 66, 56, 63, 66, 56, 63, 66]],
      [44, [56, 61, 64, 56, 61, 64, 57, 61, 66, 57, 61, 66]],
    ]);

    for (const [measure, pitches] of expectedPitches) {
      const range = ranges[measure - 1];
      const notes = secondTrebleVoice.filter((event) => (
        event.cmd === 'note'
        && event.startChar >= range.start
        && event.startChar < range.end
      ));

      expect(notes.map((event) => event.cmd === 'note' ? event.pitch : null))
        .toEqual(pitches);
      expect(notes.every((event) => event.cmd === 'note' && event.volume > 0)).toBe(true);
    }
  });
});
