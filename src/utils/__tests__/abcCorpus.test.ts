import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import abcjs from 'abcjs';
import { hideSyntheticTupletRests, prepareAbcForPlayback } from '../abcAudio';

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
  return { scratch, tunes };
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
});
