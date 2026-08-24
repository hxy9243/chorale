import { describe, expect, it } from 'vitest';
import { parseAbcHeaderMetadata } from '../../utils/abcMetadata';
import { extractScore } from '../scoreSnapshot';
import { applyMeasureMutation, createBlankPianoScore, rebaseAnnotationsForMutation } from '../scoreDrafting';
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
    [{ title: 'Draft', key: 'C', meter: '4/4', tempo: 120, measures: 33 }, 'Measures must be'],
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

  it('edits every piano voice and requires the same voice set', () => {
    const abc = pianoScore();
    const result = applyMeasureMutation(abc, {
      kind: 'replace',
      span: { startMeasure: 2, endMeasure: 3 },
      replacementAbc: '[V:upper] C D E F | G A B c |\n[V:lower] C, D, E, F, | G, A, B, C |',
    });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      const score = extractScore(result.abcSource);
      expect(score.measures).toHaveLength(4);
      expect(score.voices).toEqual(['upper', 'lower']);
      expect(score.measures[1].events.every((event) => event.type === 'note')).toBe(true);
    }

    const missingVoice = applyMeasureMutation(abc, {
      kind: 'replace', span: { startMeasure: 2, endMeasure: 2 }, replacementAbc: '[V:upper] C4 |',
    });
    expect(missingVoice.status).toBe('invalid');
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
});
