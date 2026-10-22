import { describe, expect, it } from 'vitest';
import abcjs from 'abcjs';
import { getAbcCompletions } from '../abcCompletions';

const complete = (value: string, caret = value.length, explicit = false) => getAbcCompletions(value, caret, ['upper', 'lower'], explicit);

describe('ABC completions', () => {
  it('matches notation prefixes and human-readable words', () => {
    expect(complete('C !fe')?.items[0].insert).toBe('!fermata!');
    expect(complete('C ferm')?.items[0].insert).toBe('!fermata!');
    expect(complete('C pian')?.items.map((item) => item.insert)).toEqual(['!p!', '!pp!']);
    expect(complete('C sharp')?.items[0].insert).toBe('^');
    expect(complete('C trip')?.items[0].insert).toBe('(3');
  });

  it('offers declared voices and valid inline directives without treating chords as directives', () => {
    expect(complete('[V:lo')?.items[0].insert).toBe('[V:lower]');
    expect(complete('[K:G')?.items[0].insert).toBe('[K:G]');
    expect(complete('[M:3')?.items[0].insert).toBe('[M:3/4]');
    expect(complete('[CEG')).toBeNull();
  });

  it('leaves notes, completed syntax, chord names, comments, and escaped quotes alone', () => {
    for (const value of ['C', 'f', 'z', 'C4', '!fermata!', '[K:G]', '"fermata', 'C % fermata', '"Am !fe', '"a\\"ferm']) {
      expect(complete(value), value).toBeNull();
    }
    expect(complete('"Am" ferm')?.items[0].insert).toBe('!fermata!');
  });

  it('replaces the full token around the caret while preserving surrounding notes', () => {
    const value = 'C !fermata! D |';
    const result = complete(value, 5)!;
    expect(value.slice(0, result.from) + result.items[0].insert + value.slice(result.to)).toBe(value);
    const inline = complete('C [K:G] D |', 6)!;
    expect(inline.to).toBe(7);
  });

  it('opens explicitly at an empty caret or after a note without replacing that note', () => {
    expect(complete('C ', 2, true)?.items.length).toBeGreaterThan(0);
    expect(complete('C', 1, true)).toMatchObject({ from: 1, to: 1 });
    expect(complete('C', 1, true)?.items[0].insert).toBe('!fermata!');
  });

  it('offers decoration spellings accepted by the installed ABC parser', () => {
    for (const prefix of ['!', 'ferm', 'trill', 'mord', 'turn', 'tenu', 'cres', 'dim']) {
      for (const item of complete(prefix)!.items) {
        const tune = abcjs.parseOnly(`X:1\nM:4/4\nL:1/4\nK:C\n${item.insert} C4 |`)[0];
        expect(tune.warnings ?? [], item.insert).toEqual([]);
      }
    }
  });
});
