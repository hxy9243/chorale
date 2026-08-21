import { describe, it, expect } from 'vitest';
import {
  parseAbcHeaderMetadata,
  updateAbcHeaderMetadata,
  validateKeySignature,
  validateMeter,
  validateTempo,
  MIN_TEMPO_BPM,
  MAX_TEMPO_BPM,
} from '../abcMetadata';

describe('abcMetadata Utilities', () => {
  describe('validateKeySignature', () => {
    it('accepts standard major and minor keys', () => {
      expect(validateKeySignature('C')).toEqual({ valid: true, value: 'C' });
      expect(validateKeySignature('G')).toEqual({ valid: true, value: 'G' });
      expect(validateKeySignature('F#')).toEqual({ valid: true, value: 'F#' });
      expect(validateKeySignature('Bb')).toEqual({ valid: true, value: 'Bb' });
      expect(validateKeySignature('Am')).toEqual({ valid: true, value: 'Am' });
      expect(validateKeySignature('c#m')).toEqual({ valid: true, value: 'C#m' });
      expect(validateKeySignature('D minor')).toEqual({ valid: true, value: 'Dm' });
      expect(validateKeySignature('Eb major')).toEqual({ valid: true, value: 'Eb' });
    });

    it('accepts modal keys and preserves clef tags', () => {
      expect(validateKeySignature('D dorian')).toEqual({ valid: true, value: 'D dorian' });
      expect(validateKeySignature('G mixolydian')).toEqual({ valid: true, value: 'G mixolydian' });
      expect(validateKeySignature('C treble')).toEqual({ valid: true, value: 'C clef=treble' });
      expect(validateKeySignature('Am bass')).toEqual({ valid: true, value: 'Am clef=bass' });
    });

    it('rejects invalid keys', () => {
      expect(validateKeySignature('')).toMatchObject({ valid: false });
      expect(validateKeySignature('H')).toMatchObject({ valid: false });
      expect(validateKeySignature('X#m')).toMatchObject({ valid: false });
      expect(validateKeySignature('C invalidmode')).toMatchObject({ valid: false });
    });
  });

  describe('validateMeter', () => {
    it('accepts valid fractions and shorthand meters', () => {
      expect(validateMeter('4/4')).toEqual({ valid: true, value: '4/4' });
      expect(validateMeter('3/4')).toEqual({ valid: true, value: '3/4' });
      expect(validateMeter('6/8')).toEqual({ valid: true, value: '6/8' });
      expect(validateMeter('12/8')).toEqual({ valid: true, value: '12/8' });
      expect(validateMeter('C')).toEqual({ valid: true, value: 'C' });
      expect(validateMeter('C|')).toEqual({ valid: true, value: 'C|' });
      expect(validateMeter('none')).toEqual({ valid: true, value: 'none' });
    });

    it('rejects invalid meters', () => {
      expect(validateMeter('')).toMatchObject({ valid: false });
      expect(validateMeter('4/5')).toMatchObject({ valid: false });
      expect(validateMeter('0/4')).toMatchObject({ valid: false });
      expect(validateMeter('40/4')).toMatchObject({ valid: false });
      expect(validateMeter('random')).toMatchObject({ valid: false });
    });
  });

  describe('validateTempo', () => {
    it('accepts integer BPM numbers and strings within range [20, 400]', () => {
      expect(validateTempo('120')).toEqual({
        valid: true,
        value: '♩ = 120',
        bpm: 120,
        tempoUnit: '1/4',
      });
      expect(validateTempo('144')).toEqual({
        valid: true,
        value: '♩ = 144',
        bpm: 144,
        tempoUnit: '1/4',
      });
      expect(validateTempo('♩ = 80')).toEqual({
        valid: true,
        value: '♩ = 80',
        bpm: 80,
        tempoUnit: '1/4',
      });
      expect(validateTempo('1/4=132')).toEqual({
        valid: true,
        value: '♩ = 132',
        bpm: 132,
        tempoUnit: '1/4',
      });
      expect(validateTempo('3/8=45')).toEqual({
        valid: true,
        value: '3/8 = 45',
        bpm: 45,
        tempoUnit: '3/8',
      });
    });

    it('rejects out of bounds or unparseable tempos', () => {
      expect(validateTempo('15')).toMatchObject({ valid: false });
      expect(validateTempo('450')).toMatchObject({ valid: false });
      expect(validateTempo('0')).toMatchObject({ valid: false });
      expect(validateTempo(`${MIN_TEMPO_BPM - 1}`)).toMatchObject({ valid: false });
      expect(validateTempo(`${MAX_TEMPO_BPM + 1}`)).toMatchObject({ valid: false });
      expect(validateTempo('')).toMatchObject({ valid: false });
      expect(validateTempo('fast')).toMatchObject({ valid: false });
    });
  });

  describe('parseAbcHeaderMetadata', () => {
    it('parses complete header information including extended metadata', () => {
      const abc = `
X:1
T:Minuet in G
T:BWV Anh. 114
C:J.S. Bach
A:Christian Petzold
R:Minuet
O:Germany
S:Notebook for Anna Magdalena Bach
M:3/4
L:1/8
Q:1/4=116
K:G
GAB |
`;
      const meta = parseAbcHeaderMetadata(abc);
      expect(meta.title).toBe('Minuet in G');
      expect(meta.subtitle).toBe('BWV Anh. 114');
      expect(meta.composer).toBe('J.S. Bach');
      expect(meta.author).toBe('Christian Petzold');
      expect(meta.rhythm).toBe('Minuet');
      expect(meta.origin).toBe('Germany');
      expect(meta.source).toBe('Notebook for Anna Magdalena Bach');
      expect(meta.meter).toBe('3/4');
      expect(meta.unitLength).toBe('1/8');
      expect(meta.tempoBpm).toBe(116);
      expect(meta.tempoText).toBe('♩ = 116');
      expect(meta.key).toBe('G');
    });

    it('stops parsing metadata at the first tune key field', () => {
      const abc = `X:1
T:Body Safety
K:C
C:| D E F |
T:This is music, not a subtitle`;

      expect(parseAbcHeaderMetadata(abc)).toMatchObject({
        title: 'Body Safety',
        subtitle: undefined,
        composer: undefined,
        key: 'C',
      });
    });
  });

  describe('updateAbcHeaderMetadata', () => {
    it('updates existing header fields cleanly without corrupting the music body', () => {
      const abc = `X:1
T:Old Title
C:Old Composer
M:4/4
Q:1/4=100
K:C
C D E F |`;

      const updated = updateAbcHeaderMetadata(abc, {
        title: 'New Title',
        composer: 'New Composer',
        meter: '3/4',
        key: 'G',
        tempoBpm: 130,
      });

      expect(updated).toBe(`X:1
T:New Title
C:New Composer
M:3/4
Q:1/4=130
K:G
C D E F |`);
    });

    it('inserts missing fields in logical header locations', () => {
      const abc = `X:1
K:C
C D E F |`;

      const updated = updateAbcHeaderMetadata(abc, {
        title: 'Inserted Title',
        composer: 'Inserted Composer',
        author: 'Inserted Author',
        rhythm: 'Reel',
        meter: '6/8',
        tempoBpm: 90,
      });

      expect(updated).toContain('T:Inserted Title');
      expect(updated).toContain('C:Inserted Composer');
      expect(updated).toContain('A:Inserted Author');
      expect(updated).toContain('R:Reel');
      expect(updated).toContain('M:6/8');
      expect(updated).toContain('Q:1/4=90');
      expect(updated).toContain('K:C');
      expect(updated.endsWith('C D E F |')).toBe(true);
    });

    it('removes fields if set to empty string', () => {
      const abc = `X:1
T:Title
C:Composer
K:C
C D E F |`;

      const updated = updateAbcHeaderMetadata(abc, {
        composer: '',
      });

      expect(updated).not.toContain('C:Composer');
      expect(updated).toContain('T:Title');
    });

    it('updates subtitle separately from the primary title', () => {
      const abc = `X:1
T:Primary Title
T:Old Subtitle
K:C
C D E F |`;

      const updated = updateAbcHeaderMetadata(abc, { subtitle: 'New Subtitle' });

      expect(updated).toContain('T:Primary Title\nT:New Subtitle');
      expect(parseAbcHeaderMetadata(updated).subtitle).toBe('New Subtitle');
    });

    it('does not mistake a body C:| chord for a composer header', () => {
      const abc = `X:1
T:Body Safety
K:C
C:| D E F |`;

      const updated = updateAbcHeaderMetadata(abc, { composer: 'Claude Debussy' });

      expect(updated).toContain('T:Body Safety\nC:Claude Debussy\nK:C');
      expect(updated).toContain('K:C\nC:| D E F |');
    });

    it('collapses line-breaking metadata input so it cannot inject ABC fields', () => {
      const abc = `X:1
T:Old Title
K:C
C D E F |`;

      const updated = updateAbcHeaderMetadata(abc, {
        title: '100% safe title\nK:G\r\nC:Injected composer',
      });

      expect(updated).toContain('T:100\\% safe title K:G C:Injected composer');
      expect(updated).toContain('K:C\nC D E F |');
      expect(updated.match(/^K:/gm)).toHaveLength(1);
      expect(parseAbcHeaderMetadata(updated).title).toBe('100% safe title K:G C:Injected composer');
    });
  });
});
