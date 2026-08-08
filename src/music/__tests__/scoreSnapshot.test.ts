import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createScoreSnapshot, extractScore } from '../scoreSnapshot';
import { isRationalDuration } from '../rational';

const fixtureDirectory = resolve(process.cwd(), 'src/test/fixtures/score-snapshot');
const readFixture = (filename: string) => (
  readFileSync(resolve(fixtureDirectory, filename), 'utf8')
);

describe('score snapshot extraction', () => {
  it('keeps a deterministic fixture corpus for every required score shape', () => {
    const fixtures = readdirSync(fixtureDirectory)
      .filter((filename) => filename.endsWith('.abc'))
      .sort();

    expect(fixtures).toEqual([
      '01-four-four.abc',
      '02-pickup.abc',
      '03-compound-six-eight.abc',
      '04-fractions-tuplets.abc',
      '05-rests-ties.abc',
      '06-multiple-voices.abc',
      '07-inline-changes.abc',
      '08-repeats-endings.abc',
    ]);
    for (const filename of fixtures) {
      const abc = readFileSync(resolve(fixtureDirectory, filename), 'utf8');
      expect(() => extractScore(abc), filename).not.toThrow();
    }
  });

  it('verifies written numbering, exact rational time, and source ranges across the corpus', () => {
    for (const filename of readdirSync(fixtureDirectory).filter((name) => name.endsWith('.abc'))) {
      const abc = readFixture(filename);
      const score = extractScore(abc);

      expect(score.measures.map((measure) => measure.measureNumber), filename)
        .toEqual(score.measures.map((_, index) => index + 1));
      for (const measure of score.measures) {
        expect(measure.abcSlice, filename).toBe(abc.slice(measure.abcRange.start, measure.abcRange.end));
        for (const event of measure.events) {
          expect(event.position.measure, filename).toBe(measure.measureNumber);
          expect(isRationalDuration(event.position.offset), filename).toBe(true);
          expect(isRationalDuration(event.duration), filename).toBe(true);
          expect(event.abcRange?.start, filename).toBeGreaterThanOrEqual(measure.abcRange.start);
          expect(event.abcRange?.end, filename).toBeLessThanOrEqual(measure.abcRange.end);
        }
      }
    }

    const fourFour = extractScore(readFixture('01-four-four.abc'));
    expect(fourFour.measures[0].events.map((event) => event.position.offset)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 4 },
      { numerator: 3, denominator: 8 },
      { numerator: 1, denominator: 2 },
      { numerator: 3, denominator: 4 },
      { numerator: 7, denominator: 8 },
    ]);

    const pickup = extractScore(readFixture('02-pickup.abc'));
    expect(pickup.measures).toHaveLength(3);
    expect(pickup.measures[0].events).toHaveLength(1);
    expect(pickup.measures[1].events).toHaveLength(4);

    const compound = extractScore(readFixture('03-compound-six-eight.abc'));
    expect(compound.meter).toBe('6/8');
    expect(compound.measures[0].events.at(-1)?.position.offset)
      .toEqual({ numerator: 5, denominator: 8 });

    const fractions = extractScore(readFixture('04-fractions-tuplets.abc'));
    expect(fractions.measures[0].events.map((event) => event.duration)).toEqual([
      { numerator: 1, denominator: 16 },
      { numerator: 3, denominator: 16 },
      { numerator: 1, denominator: 12 },
      { numerator: 1, denominator: 12 },
      { numerator: 1, denominator: 12 },
      { numerator: 1, denominator: 4 },
      { numerator: 1, denominator: 4 },
    ]);

    const tiesAndRests = extractScore(readFixture('05-rests-ties.abc'));
    expect(tiesAndRests.measures[0].events[0].type).toBe('rest');
    expect(tiesAndRests.measures[0].events.at(-1)?.tieStart).toBe(true);
    expect(tiesAndRests.measures[1].events[0].tieEnd).toBe(true);

    const voices = extractScore(readFixture('06-multiple-voices.abc'));
    expect(voices.voices).toEqual(['upper', 'lower']);
    expect(voices.measures[0].events.filter((event) => (
      event.position.offset.numerator === 0
    )).map((event) => event.voiceId)).toEqual(['lower', 'upper']);

    const changes = extractScore(readFixture('07-inline-changes.abc'));
    expect(changes.measures[1].keyChange).toBe('G');
    expect(changes.measures[2].meterChange).toBe('6/8');

    const repeats = extractScore(readFixture('08-repeats-endings.abc'));
    expect(repeats.measures).toHaveLength(4);
    expect(repeats.measures[0].abcSlice).toContain('|:');
    expect(repeats.measures[0].abcSlice).toContain('|1');
    expect(repeats.measures[1].abcSlice).toContain(':|2');
  });

  it('rejects every malformed fixture with a compact parser error', () => {
    const invalidDirectory = resolve(
      process.cwd(),
      'src/test/fixtures/score-snapshot-invalid',
    );
    const invalidFixtures = readdirSync(invalidDirectory).sort();

    expect(invalidFixtures).toEqual(['invalid-meter.abc', 'unclosed-chord.abc']);
    for (const filename of invalidFixtures) {
      const abc = readFileSync(resolve(invalidDirectory, filename), 'utf8');
      expect(() => extractScore(abc), filename).toThrow(/^Malformed ABC:/);
    }
  });

  it('extracts written measures, rational events, metadata, and source ranges', () => {
    const abc = [
      'X:1',
      'T:Snapshot',
      'C:Chorale',
      'M:4/4',
      'L:1/8',
      'Q:1/4=96',
      'K:C',
      'C2 D E/2F/2 z2 | [K:G] G,A Bc |]',
    ].join('\n');

    const score = extractScore(abc);

    expect(score).toMatchObject({
      title: 'Snapshot',
      composer: 'Chorale',
      key: 'C',
      meter: '4/4',
      tempoText: '1/4=96',
      voices: ['voice-1'],
    });
    expect(score.measures).toHaveLength(2);
    expect(score.measures[0].events.map((event) => ({
      type: event.type,
      offset: event.position.offset,
      duration: event.duration,
    }))).toEqual([
      { type: 'note', offset: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 } },
      { type: 'note', offset: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 8 } },
      { type: 'note', offset: { numerator: 3, denominator: 8 }, duration: { numerator: 1, denominator: 16 } },
      { type: 'note', offset: { numerator: 7, denominator: 16 }, duration: { numerator: 1, denominator: 16 } },
      { type: 'rest', offset: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 4 } },
    ]);
    expect(score.measures[1].keyChange).toBe('G');
    expect(score.measures[0].abcSlice).toContain('C2 D E/2F/2 z2 |');
    expect(score.measures[0].events[0].abcRange).toEqual(expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
    }));
  });

  it('retains simultaneous voices, tuplets, ties, accidentals, and octave', () => {
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      '[V:upper] (3^CDE F2-F2 | F8 |',
      '[V:lower] C,4 z4 | G,8 |',
    ].join('\n');

    const score = extractScore(abc);
    const firstMeasure = score.measures[0];
    const upper = firstMeasure.events.filter((event) => event.voiceId === 'upper');
    const lower = firstMeasure.events.filter((event) => event.voiceId === 'lower');

    expect(score.voices).toEqual(['upper', 'lower']);
    expect(upper.slice(0, 3).map((event) => event.duration)).toEqual([
      { numerator: 1, denominator: 12 },
      { numerator: 1, denominator: 12 },
      { numerator: 1, denominator: 12 },
    ]);
    expect(upper[0].pitches).toEqual([{ step: 'C', accidental: 'sharp', octave: 4 }]);
    expect(upper[3].tieStart).toBe(true);
    expect(upper[4].tieEnd).toBe(true);
    expect(lower[0]).toMatchObject({
      position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
      pitches: [{ step: 'C', octave: 3 }],
    });
  });

  it('treats a pickup as written measure one and aligns with abcjs global classes', () => {
    const score = extractScore([
      'X:1',
      'M:4/4',
      'L:1/4',
      'K:C',
      'G | C D E F | G4 |]',
    ].join('\n'));

    expect(score.measures.map((measure) => ({
      writtenMeasure: measure.measureNumber,
      abcjsGlobalClass: `abcjs-mm${measure.measureNumber - 1}`,
      eventOffsets: measure.events.map((event) => event.position),
    }))).toEqual([
      {
        writtenMeasure: 1,
        abcjsGlobalClass: 'abcjs-mm0',
        eventOffsets: [{ measure: 1, offset: { numerator: 0, denominator: 1 } }],
      },
      {
        writtenMeasure: 2,
        abcjsGlobalClass: 'abcjs-mm1',
        eventOffsets: [
          { measure: 2, offset: { numerator: 0, denominator: 1 } },
          { measure: 2, offset: { numerator: 1, denominator: 4 } },
          { measure: 2, offset: { numerator: 1, denominator: 2 } },
          { measure: 2, offset: { numerator: 3, denominator: 4 } },
        ],
      },
      {
        writtenMeasure: 3,
        abcjsGlobalClass: 'abcjs-mm2',
        eventOffsets: [{ measure: 3, offset: { numerator: 0, denominator: 1 } }],
      },
    ]);
  });

  it('reports parser warnings as malformed ABC errors', () => {
    expect(() => extractScore('X:1\nM:broken\nK:C\nC|')).toThrow(/Malformed ABC.*meter/);
    expect(() => extractScore('')).toThrow(/empty/);
  });

  it('handles inline tempo directives, staff changes, and hairpins without throwing Malformed ABC', () => {
    const abcWithDirectives = [
      'X:1',
      'T:Tempo and Directives',
      'M:4/4',
      'L:1/4',
      'Q:1/4=120',
      'K:C',
      '[Q:1/4=140] C D [I:staff +1] E F | G A B c |]',
    ].join('\n');

    expect(() => extractScore(abcWithDirectives)).not.toThrow();
    const snapshot = createScoreSnapshot({
      snapshotId: 'snap-dir',
      documentId: 'doc-dir',
      revision: 1,
      abc: abcWithDirectives,
      annotations: [],
    });
    expect(snapshot.measures).toHaveLength(2);
  });

  it('allows non-fatal line warnings when measures are successfully extracted', () => {
    const abcWithLineWarning = [
      'X:1',
      'T:Line Warning Test',
      'M:4/4',
      'L:1/4',
      'K:C',
      'C D E F | G A B c | % Line 6 note',
    ].join('\n');

    expect(() => extractScore(abcWithLineWarning)).not.toThrow();
    const score = extractScore(abcWithLineWarning);
    expect(score.measures).toHaveLength(2);
  });

  it('builds one immutable runtime snapshot with reusable lookup indexes', () => {
    const annotation = {
      id: 'annotation-1',
      kind: 'explanation' as const,
      span: { startMeasure: 1, endMeasure: 2 },
      label: 'Opening',
      body: 'Opening explanation.',
      source: 'assistant' as const,
      agentProfiles: ['general' as const],
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    const snapshot = createScoreSnapshot({
      snapshotId: 'snapshot-1',
      documentId: 'document-1',
      revision: 3,
      abc: 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G4 |]',
      annotations: [annotation],
    });
    annotation.label = 'Mutated after capture';

    expect(snapshot).toMatchObject({
      snapshotId: 'snapshot-1',
      documentId: 'document-1',
      revision: 3,
    });
    expect(snapshot.measureIndex.get(1)).toBe(snapshot.measures[0]);
    expect(snapshot.eventIndex.get(2)).toBe(snapshot.measures[1].events);
    expect(snapshot.sourceIndex.get(snapshot.measures[0].events[0].abcRange!.start))
      .toContain(snapshot.measures[0].events[0]);
    expect(snapshot.annotationIndex.get(1)?.[0].label).toBe('Opening');
    expect(snapshot.annotationIndex.get(2)?.[0]).toBe(snapshot.annotations[0]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.measures[0].events[0].position.offset)).toBe(true);
    expect(Object.isFrozen(snapshot.annotations[0].span)).toBe(true);
    expect('set' in snapshot.measureIndex).toBe(false);
    expect(() => (snapshot.measures as unknown[]).push({})).toThrow();
  });
});
