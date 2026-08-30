import { describe, expect, it } from 'vitest';
import { parseAbcHeaderMetadata } from '../../utils/abcMetadata';
import { extractScore } from '../scoreSnapshot';
import {
  applyMeasureMutation,
  applyWholeScoreReplacement,
  createBlankPianoScore,
  rebaseAnnotationsForMutation,
} from '../scoreDrafting';
import type { Annotation } from '../../types/document';

describe('createBlankPianoScore', () => {
  it('creates a canonical two-staff piano score with one full-measure rest per voice', () => {
    const result = createBlankPianoScore({
      title: 'Nocturne',
      subtitle: 'A small beginning',
      composer: 'Ada Composer',
      key: 'D minor',
      meter: '3/4',
      tempo: 84,
      measures: 8,
    });

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;

    expect(result.abcSource).toContain('T:Nocturne\nT:A small beginning\nC:Ada Composer');
    expect(result.abcSource).toContain('Q:1/4=84');
    expect(result.abcSource).toContain('%%score { upper | lower }');
    expect(result.abcSource.match(/\bZ\s*\|/g)).toHaveLength(16);

    const metadata = parseAbcHeaderMetadata(result.abcSource);
    expect(metadata).toMatchObject({
      title: 'Nocturne',
      subtitle: 'A small beginning',
      composer: 'Ada Composer',
      key: 'Dm',
      meter: '3/4',
      tempoBpm: 84,
    });
    const score = extractScore(result.abcSource);
    expect(score.voices).toEqual(['upper', 'lower']);
    expect(score.measures).toHaveLength(8);
    for (const measure of score.measures) {
      expect(measure.events).toHaveLength(2);
      expect(measure.events.every((event) => event.type === 'rest')).toBe(true);
    }
  });

  it.each([
    [{ title: '', key: 'C', meter: '4/4', tempo: 120, measures: 8 }, 'Title is required.'],
    [{ title: 'Draft', key: 'H', meter: '4/4', tempo: 120, measures: 8 }, 'Invalid key'],
    [{ title: 'Draft', key: 'C', meter: '5/3', tempo: 120, measures: 8 }, 'Meter note value'],
    [{ title: 'Draft', key: 'C', meter: '4/4', tempo: 19, measures: 8 }, 'Tempo must be'],
    [{ title: 'Draft', key: 'C', meter: '4/4', tempo: 120, measures: 257 }, 'Measures must be'],
  ])('rejects invalid input %#', (input, expectedError) => {
    const result = createBlankPianoScore(input);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.join(' ')).toContain(expectedError);
    }
  });

  it('sanitizes metadata so values cannot create new ABC header lines', () => {
    const result = createBlankPianoScore({
      title: 'Safe\nK:G',
      composer: 'A % note',
      key: 'C',
      meter: '4/4',
      tempo: 120,
      measures: 1,
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.abcSource).toContain('T:Safe K:G');
      expect(result.abcSource).toContain('C:A \\% note');
      expect(result.abcSource.match(/^K:/gm)).toHaveLength(1);
    }
  });
});

describe('source-aware voice replacement', () => {
  it('keeps replacement music attached to voice IDs when score layout order is reversed', () => {
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/4',
      '%%score { lower | upper }',
      'V:upper clef=treble',
      'V:lower clef=bass',
      'K:C',
      '[V:upper] C4 |]',
      '[V:lower] G,4 |]',
    ].join('\n');
    const result = applyMeasureMutation(abc, {
      kind: 'replace',
      span: { startMeasure: 1, endMeasure: 1 },
      replacementAbc: '[V:upper] E4 |\n[V:lower] F,4 |',
    });

    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.abcSource).toContain('[V:upper] E4|]');
      expect(result.abcSource).toContain('[V:lower] F,4|]');
    }
  });
});

describe('rebaseAnnotationsForMutation', () => {
  const annotations: Annotation[] = [{
    id: 'before', kind: 'explanation', span: { startMeasure: 1, endMeasure: 2 }, label: 'Before', body: 'Before', source: 'user', createdAt: 'now', updatedAt: 'now',
  }, {
    id: 'inside', kind: 'explanation', span: { startMeasure: 3, endMeasure: 4 }, label: 'Inside', body: 'Inside', source: 'user', createdAt: 'now', updatedAt: 'now',
  }, {
    id: 'after', kind: 'chord', span: { startMeasure: 6, endMeasure: 6 }, position: { measure: 6, offset: { numerator: 0, denominator: 1 } }, chordSymbol: 'C', label: 'After', body: 'After', source: 'user', createdAt: 'now', updatedAt: 'now',
  }];

  it('shifts and expands anchors around inserted measures', () => {
    const result = rebaseAnnotationsForMutation(annotations, {
      kind: 'insert', span: { startMeasure: 2, endMeasure: 2 }, position: 'after', count: 2,
    });
    expect(result.map(({ span }) => span)).toEqual([
      { startMeasure: 1, endMeasure: 2 },
      { startMeasure: 5, endMeasure: 6 },
      { startMeasure: 8, endMeasure: 8 },
    ]);
    expect(result[2].kind === 'chord' && result[2].position.measure).toBe(8);
  });

  it('removes contained annotations and rebases following anchors after delete', () => {
    const result = rebaseAnnotationsForMutation(annotations, {
      kind: 'delete', span: { startMeasure: 3, endMeasure: 4 },
    });
    expect(result.map(({ id, span }) => ({ id, span }))).toEqual([
      { id: 'before', span: { startMeasure: 1, endMeasure: 2 } },
      { id: 'after', span: { startMeasure: 4, endMeasure: 4 } },
    ]);
    expect(result[1].kind === 'chord' && result[1].position.measure).toBe(4);
  });

  it('preserves anchors for replacements', () => {
    expect(rebaseAnnotationsForMutation(annotations, {
      kind: 'replace', span: { startMeasure: 3, endMeasure: 4 }, replacementAbc: 'z4 | z4 |',
    })).toEqual(annotations);
  });
});

describe('applyMeasureMutation', () => {
  const singleVoice = [
    'X:1',
    'T:Draft',
    'M:4/4',
    'L:1/4',
    'K:C',
    'C D E F | G A B c | c B A G | F E D C |]',
    '',
  ].join('\n');

  const pianoScore = () => {
    const result = createBlankPianoScore({
      title: 'Piano draft', key: 'C', meter: '4/4', tempo: 120, measures: 4,
    });
    if (result.status !== 'valid') throw new Error(result.errors.join(' '));
    return result.abcSource;
  };

  it('inserts rests before and after a selection without changing the voice set', () => {
    const before = applyMeasureMutation(singleVoice, {
      kind: 'insert', span: { startMeasure: 2, endMeasure: 2 }, position: 'before', count: 2,
    });
    expect(before.status).toBe('valid');
    if (before.status === 'valid') {
      expect(extractScore(before.abcSource).measures).toHaveLength(6);
      expect(before.affectedSpan).toEqual({ startMeasure: 2, endMeasure: 3 });
      expect(before.abcSource).toMatch(/C D E F \|\s*Z \| Z \|\s+G A B c \|/);
    }

    const afterFinal = applyMeasureMutation(singleVoice, {
      kind: 'insert', span: { startMeasure: 4, endMeasure: 4 }, position: 'after', count: 1,
    });
    expect(afterFinal.status).toBe('valid');
    if (afterFinal.status === 'valid') {
      expect(extractScore(afterFinal.abcSource).measures).toHaveLength(5);
      expect(afterFinal.abcSource).toContain('F E D C | Z |]');
    }

    const afterInterior = applyMeasureMutation(singleVoice, {
      kind: 'insert', span: { startMeasure: 2, endMeasure: 2 }, position: 'after', count: 2,
    });
    expect(afterInterior.status).toBe('valid');
    if (afterInterior.status === 'valid') {
      expect(extractScore(afterInterior.abcSource).measures).toHaveLength(6);
      expect(afterInterior.affectedSpan).toEqual({ startMeasure: 3, endMeasure: 4 });
      expect(afterInterior.abcSource).toMatch(/G A B c \|\s+Z \| Z \|\s+c B A G \|/);
    }
  });

  it('replaces the selected content while preserving all unselected source bytes', () => {
    const result = applyMeasureMutation(singleVoice, {
      kind: 'replace', span: { startMeasure: 2, endMeasure: 3 }, replacementAbc: 'z4 | C4 |',
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.abcSource).toMatch(/C D E F \| z4\| C4\| F E D C \|\]/);
      expect(result.abcSource.slice(0, result.abcSource.indexOf('C D E F')))
        .toBe(singleVoice.slice(0, singleVoice.indexOf('C D E F')));
    }
  });

  it('edits every piano voice, retains existing voices, and adds new voices across the full score', () => {
    const abc = pianoScore();
    const result = applyMeasureMutation(abc, {
      kind: 'replace',
      span: { startMeasure: 2, endMeasure: 3 },
      replacementAbc: [
        '[V:upper] C D E F | G A B c |',
        '[V:lower] C, D, E, F, | G, A, B, C |',
        '[V:counter] E4 | F4 |',
      ].join('\n'),
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      const score = extractScore(result.abcSource);
      expect(score.measures).toHaveLength(4);
      expect(score.voices).toEqual(['upper', 'lower', 'counter']);
      expect(result.abcSource).toContain('%%score { upper | lower | counter }');
      expect(result.abcSource).toContain('V:counter\nK:C');
      expect(score.measures[0].events.find(({ voiceId }) => voiceId === 'counter')?.type).toBe('rest');
      expect(score.measures[1].events.find(({ voiceId }) => voiceId === 'counter')?.type).toBe('note');
      expect(score.measures[2].events.find(({ voiceId }) => voiceId === 'counter')?.type).toBe('note');
      expect(score.measures[3].events.find(({ voiceId }) => voiceId === 'counter')?.type).toBe('rest');
    }

    const missingVoice = applyMeasureMutation(abc, {
      kind: 'replace', span: { startMeasure: 2, endMeasure: 2 }, replacementAbc: '[V:upper] C4 |',
    });
    expect(missingVoice.status).toBe('invalid');
  });

  it('adds an explicit voice to a score whose original voice was implicit', () => {
    const result = applyMeasureMutation(singleVoice, {
      kind: 'replace',
      span: { startMeasure: 2, endMeasure: 3 },
      replacementAbc: '[V:voice-1] G4 | A4 |\n[V:counter] C4 | D4 |',
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      const score = extractScore(result.abcSource);
      expect(score.voices).toEqual(['voice-1', 'counter']);
      expect(score.measures).toHaveLength(4);
      expect(result.abcSource).toContain('V:voice-1\nV:counter\nK:C');
      expect(result.abcSource).toContain('[V:voice-1] C D E F |');
      expect(score.measures[0].events.find(({ voiceId }) => voiceId === 'counter')?.type).toBe('rest');
      expect(score.measures[3].events.find(({ voiceId }) => voiceId === 'counter')?.type).toBe('rest');
    }
  });

  it('supports inline voice switches when each selected source segment remains isolated', () => {
    const inline = [
      'X:1', 'M:4/4', 'L:1/4', 'V:one', 'V:two', 'K:C',
      '[V:one] C D E F | [V:two] C, D, E, F, | [V:one] G A B c | [V:two] G, A, B, C |]',
      '',
    ].join('\n');
    const score = extractScore(inline);
    expect(score.voices).toEqual(['one', 'two']);
    expect(score.measures).toHaveLength(2);
    const result = applyMeasureMutation(inline, {
      kind: 'replace',
      span: { startMeasure: 1, endMeasure: 1 },
      replacementAbc: '[V:one] z4 |\n[V:two] z4 |',
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(extractScore(result.abcSource).measures[0].events.every((event) => event.type === 'rest')).toBe(true);
    }
  });

  it('replaces content across repeat and volta boundaries while preserving their source bytes', () => {
    const repeated = [
      'X:1', 'M:4/4', 'L:1/4', 'K:C',
      '|: C4 |[1 D4 :|[2 E4 |]', '',
    ].join('\n');
    const result = applyMeasureMutation(repeated, {
      kind: 'replace',
      span: { startMeasure: 1, endMeasure: 2 },
      replacementAbc: 'z4 | z4 |',
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.abcSource).toContain('|: z4|[1 z4:|[2 E4 |]');
      expect(extractScore(result.abcSource).measures).toHaveLength(3);
    }
  });

  it('adds a voice while replacing a repeated range', () => {
    const repeated = [
      'X:1', 'M:4/4', 'L:1/4', 'V:one', 'K:C',
      '[V:one] |: C4 | D4 :| E4 |]', '',
    ].join('\n');
    const result = applyMeasureMutation(repeated, {
      kind: 'replace',
      span: { startMeasure: 1, endMeasure: 2 },
      replacementAbc: '[V:one] z4 | z4 |\n[V:counter] E4 | F4 |',
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      const score = extractScore(result.abcSource);
      expect(score.voices).toEqual(['one', 'counter']);
      expect(score.measures).toHaveLength(3);
      expect(result.abcSource).toContain('[V:counter] |: E4 | F4 :| Z |]');
    }
  });

  it('deletes a range, rejects delete-all, and rejects repeat boundaries', () => {
    const deleted = applyMeasureMutation(singleVoice, {
      kind: 'delete', span: { startMeasure: 2, endMeasure: 3 },
    });
    expect(deleted.status).toBe('valid');
    if (deleted.status === 'valid') {
      expect(extractScore(deleted.abcSource).measures).toHaveLength(2);
      expect(deleted.abcSource).toContain('C D E F | F E D C |]');
    }

    expect(applyMeasureMutation(singleVoice, {
      kind: 'delete', span: { startMeasure: 1, endMeasure: 4 },
    }).status).toBe('invalid');

    const repeated = singleVoice.replace('G A B c |', 'G A B c :|');
    const repeatResult = applyMeasureMutation(repeated, {
      kind: 'delete', span: { startMeasure: 2, endMeasure: 2 },
    });
    expect(repeatResult.status).toBe('unsupported');
  });

  it('rejects replacement count mismatches and oversized input without a candidate', () => {
    const countMismatch = applyMeasureMutation(singleVoice, {
      kind: 'replace', span: { startMeasure: 2, endMeasure: 3 }, replacementAbc: 'C4 |',
    });
    expect(countMismatch.status).toBe('invalid');

    const oversized = applyMeasureMutation(singleVoice, {
      kind: 'replace', span: { startMeasure: 2, endMeasure: 2 }, replacementAbc: 'C'.repeat(64 * 1024),
    });
    expect(oversized.status).toBe('invalid');
  });

  it('supports inline key and tempo changes within focused replacement', () => {
    const result = applyMeasureMutation(singleVoice, {
      kind: 'replace',
      span: { startMeasure: 2, endMeasure: 2 },
      replacementAbc: '[Q:1/4=180] [K:G] G A B c |',
    });

    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.abcSource).toContain('[Q:1/4=180] [K:G] G A B c');
      const score = extractScore(result.abcSource);
      expect(score.measures[1].keyChange).toBe('G');
    }
  });

  it('replaces measures that contain existing inline key changes', () => {
    const scoreWithKeyChange = [
      'X:1', 'T:Key Change', 'M:4/4', 'L:1/4', 'K:C',
      'C D E F | [K:G] G A B c | c B A G | F E D C |]', '',
    ].join('\n');

    const result = applyMeasureMutation(scoreWithKeyChange, {
      kind: 'replace',
      span: { startMeasure: 2, endMeasure: 2 },
      replacementAbc: '[K:D] d e f g |',
    });

    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.abcSource).toContain('[K:D] d e f g');
      const score = extractScore(result.abcSource);
      expect(score.measures[1].keyChange).toBe('D');
    }
  });
});

describe('applyWholeScoreReplacement', () => {
  const source = [
    'X:1', 'T:Source', 'M:4/4', 'L:1/4', 'Q:1/4=120', 'K:C',
    'C D E F | G A B c |]', '',
  ].join('\n');

  it('accepts structural ABC edits including global and inline key and tempo changes', () => {
    const candidate = [
      'X:1', 'T:Reworked', 'M:4/4', 'L:1/4', 'Q:1/4=92',
      'V:melody clef=treble', 'V:counter clef=bass', 'K:G',
      '[V:melody] G A B c | [K:D] [Q:1/4=108] d c B A |]',
      '[V:counter] Z | D,4 |]', '',
    ].join('\n');
    const result = applyWholeScoreReplacement(source, candidate);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      const score = extractScore(result.abcSource);
      expect(score.key).toBe('G');
      expect(score.voices).toEqual(['melody', 'counter']);
      expect(score.measures[1].keyChange).toBe('D');
      expect(result.affectedSpan).toEqual({ startMeasure: 1, endMeasure: 2 });
      expect(result.abcSource).toContain('[Q:1/4=108]');
    }
  });

  it('extends the score with new measures without requiring them to exist first', () => {
    const candidate = source.replace('G A B c |]', 'G A B c | c4 | d4 | e4 | f4 |]');
    const result = applyWholeScoreReplacement(source, candidate);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(extractScore(result.abcSource).measures).toHaveLength(6);
      expect(result.affectedSpan).toEqual({ startMeasure: 1, endMeasure: 6 });
    }
  });

  it('rejects invalid, unchanged, oversized, and measure-removing candidates', () => {
    expect(applyWholeScoreReplacement(source, source).status).toBe('invalid');
    expect(applyWholeScoreReplacement(source, '').status).toBe('invalid');
    expect(applyWholeScoreReplacement(source, 'X:1\nM:broken\nK:C\nC|').status).toBe('invalid');
    expect(applyWholeScoreReplacement(source, `${source}\nX:2\nK:C\nC4 |]`).status).toBe('invalid');
    expect(applyWholeScoreReplacement(source, `${source} ${'C'.repeat(2_000_000)}`).status).toBe('invalid');
    expect(applyWholeScoreReplacement(source, source.replace('C D E F | G A B c |]', 'C D E F |]')).status).toBe('invalid');
  });
});
