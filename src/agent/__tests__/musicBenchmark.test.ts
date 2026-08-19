// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createScoreSnapshot,
  describeKeySignature,
  extractScore,
} from '../../music/scoreSnapshot';
import { createSheetTools } from '../../../electron/ai/sheetTools';
import { formatPrompt } from '../promptUtils';
import { SHEET_AGENT_SYSTEM_PROMPT } from '../../../electron/ai/systemPrompt';
import { AGENT_PROFILE_REGISTRY } from '../../../electron/ai/agentProfiles';
import type { MusicContextSnapshot } from '../types';

describe('Music Understanding & Theory Benchmark Suite', () => {
  describe('Benchmark 1: Key Signature Inheritance & Note Realization (Bach Chorale SATB in G Major)', () => {
    const bachChoraleG = [
      'X:1',
      'T:Bach Chorale in G Major',
      'C:J.S. Bach',
      'M:4/4',
      'L:1/4',
      'K:G',
      '[V:S] B A B c | d c B A | G4 |]',
      '[V:A] D D D E | F F G F | D4 |]',
      '[V:T] G F G G | A A D C | B,4 |]',
      '[V:B] G, D, G, C | F, D, G, D, | G,4 |]',
    ].join('\n');

    it('extracts score with 1 sharp (F#) active across all measures', () => {
      const score = extractScore(bachChoraleG);
      expect(score.key).toBe('G');
      expect(score.measures).toHaveLength(3);

      const keyInfo = describeKeySignature(score.key);
      expect(keyInfo.sharps).toEqual(['F#']);
      expect(keyInfo.flats).toEqual([]);
      expect(keyInfo.description).toContain('1 sharp: F#');

      for (const measure of score.measures) {
        expect(measure.activeKey).toBe('G');
        expect(measure.activeMeter).toBe('4/4');
      }
    });

    it('provides multi-voice vertical alignment and proper ABC slices for SATB', () => {
      const score = extractScore(bachChoraleG);
      const m1 = score.measures[0];
      expect(m1.abcSlice).toContain('[V:S]');
      expect(m1.abcSlice).toContain('[V:A]');
      expect(m1.abcSlice).toContain('[V:T]');
      expect(m1.abcSlice).toContain('[V:B]');

      // In G major, Alto F in m. 2 is F# (forming D major V chord with Bass D, Tenor A/C, Soprano A)
      const m2 = score.measures[1];
      expect(m2.abcSlice).toContain('[V:A] F F G F |');
    });

    it('constructs prompt with explicit key signature explanation avoiding F natural confusion', () => {
      const snapshot: MusicContextSnapshot = {
        id: 'bach-1',
        documentId: 'doc-bach-1',
        fileName: 'bach-chorale-g.abc',
        revision: 1,
        capturedAt: '2026-08-19T00:00:00.000Z',
        abc: bachChoraleG,
        selection: { startMeasure: 1, endMeasure: 2 },
        annotations: [],
      };

      const prompt = formatPrompt('Identify the cadence in m. 2 and Roman numerals in mm. 1-2', snapshot);
      expect(prompt).toContain('globalKey="G" (G major (1 sharp: F#))');
      expect(prompt).toContain('selection: mm. 1–2 | activeKey="G" (G major (1 sharp: F#))');
      expect(prompt).toContain('[m. 1]');
      expect(prompt).toContain('[m. 2]');

      // Verify token budget
      const estimatedTokens = Math.ceil((SHEET_AGENT_SYSTEM_PROMPT.length + prompt.length) / 4);
      expect(estimatedTokens).toBeLessThan(2000);
    });
  });

  describe('Benchmark 2: Pivot Chord Modulation (C Major to G Major)', () => {
    const pivotModulationAbc = [
      'X:2',
      'T:Modulation from C to G',
      'M:4/4',
      'L:1/4',
      'K:C',
      '[V:S] c G e d | c2 c2 | c B c d | B2 d2 |',
      '[V:A] E D G F | E2 E2 | E ^F G A | G2 B2 |',
      '[V:T] G, B, C B, | G,2 A,2 | A, A, D D | D2 G2 |',
      '[V:B] C, G,, C, G,, | C,2 A,,2 | A,, D, G,, D, | G,,2 G,,2 |',
    ].join('\n');

    it('extracts score and verifies pivot measure contains dual-function harmony', () => {
      const score = extractScore(pivotModulationAbc);
      expect(score.key).toBe('C');
      expect(score.measures).toHaveLength(4);

      // Measure 2 Beat 3-4 has A minor chord (Bass A,, Tenor A,, Alto E, Soprano c)
      // which functions as vi in C major and ii in G major.
      const m2 = score.measures[1];
      expect(m2.abcSlice).toContain('A,,2');

      // Measure 3 has ^F accidental in Alto introducing F# (leading tone of G major / V7 of G)
      const m3 = score.measures[2];
      expect(m3.abcSlice).toContain('^F');

      // Measure 4 resolves to G major with PAC (Bass G,,, Soprano d/B)
      const m4 = score.measures[3];
      expect(m4.abcSlice).toContain('G,,2');
    });

    it('verifies system prompt and harmony profile guide pivot chord analysis and CADENCE confirmation', () => {
      expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('Tonicization vs Modulation');
      expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('pivot chord (e.g. C: vi = G: ii)');
      expect(SHEET_AGENT_SYSTEM_PROMPT).toContain('confirms it with a cadence (e.g. PAC in G)');
      expect(AGENT_PROFILE_REGISTRY.harmony.prompt).toContain('pivot chord, secondary dominant, confirming cadence');
    });
  });

  describe('Benchmark 3: Temporary Tonicization vs True Modulation', () => {
    const tonicizationAbc = [
      'X:3',
      'T:Tonicization of V in F Major',
      'M:4/4',
      'L:1/4',
      'K:F',
      '[V:S] A B c A | d2 c2 | =B d c B | A2 A2 |',
      '[V:A] F F G F | F2 E2 | F F E G | F2 F2 |',
      '[V:T] C D C C | B,2 G,2 | G, B, G, C | C2 C2 |',
      '[V:B] F, D, E, F, | B,,2 C,2 | D, G,, C, C, | F,,2 F,,2 |',
    ].join('\n');

    it('verifies F major key signature (1 flat: Bb) and temporary secondary dominant in m. 3', () => {
      const score = extractScore(tonicizationAbc);
      expect(score.key).toBe('F');
      const keyInfo = describeKeySignature(score.key);
      expect(keyInfo.flats).toEqual(['Bb']);

      // Measure 3 contains =B (B natural) forming G7 (V7/V in F major) resolving to C (V)
      // but Measure 4 immediately returns to F major (I), confirming tonicization, not modulation
      const m3 = score.measures[2];
      expect(m3.abcSlice).toContain('=B');

      const m4 = score.measures[3];
      expect(m4.abcSlice).toContain('F,,2');
    });

    it('verifies tool payload gives exact measure slices for secondary dominant inspection', async () => {
      const snapshot = createScoreSnapshot({
        snapshotId: 'tonic-snap',
        documentId: 'doc-tonic',
        revision: 1,
        abc: tonicizationAbc,
        annotations: [],
      });
      const { tools } = createSheetTools(snapshot);
      await tools[0].execute('route', { profiles: ['harmony'] });
      const range = await tools[2].execute('read-tonic', { startMeasure: 3, endMeasure: 4 });

      const details = range.details as any;
      expect(details.activeKeyAtStart).toBe('F');
      expect(details.measures[0].abcSlice).toContain('=B');
      expect(details.measures[1].abcSlice).toContain('F2');
    });
  });

  describe('Benchmark 4: Minor Key Harmony & Cadences (A Minor)', () => {
    const minorHarmoniesAbc = [
      'X:4',
      'T:A Minor Cadences',
      'M:4/4',
      'L:1/4',
      'K:Am',
      '[V:S] c d e c | B2 A2 | c d B c | A2 F2 | d2 B2 | B2 A2 |]',
      '[V:A] A A ^G A | ^G2 E2 | A A ^G A | E2 D2 | F2 F2 | ^G2 E2 |]',
      '[V:T] E F E E | E2 C2 | E F E E | C2 A,2 | A,2 D2 | E2 C2 |]',
      '[V:B] A, D, E, A, | E,2 A,,2 | A,, D, E, A,, | A,,2 F,,2 | D,2 B,,2 | E,2 A,,2 |]',
    ].join('\n');

    it('verifies harmonic minor raised 7th (G#) and Deceptive / Phrygian / Authentic cadences', () => {
      const score = extractScore(minorHarmoniesAbc);
      expect(score.key).toBe('Am');
      const keyInfo = describeKeySignature(score.key);
      expect(keyInfo.description).toContain('leading tone G#');

      // Measure 1-2: Authentic Cadence (E7 -> Am with ^G in Alto/Tenor)
      expect(score.measures[0].abcSlice).toContain('^G');

      // Measure 4: Deceptive Cadence (V7 -> VI: Bass A,, -> F,, with F major chord)
      expect(score.measures[3].abcSlice).toContain('F,,2');

      // Measure 5: Phrygian Half Cadence (iv6 -> V)
      expect(score.measures[4].abcSlice).toContain('D,2');
    });
  });

  describe('Benchmark 5: Advanced Chromatic Harmony (Neapolitan 6th & German Augmented 6th in C Minor)', () => {
    const chromaticAbc = [
      'X:5',
      'T:Chromatic Harmony in C Minor',
      'M:4/4',
      'L:1/4',
      'K:Cm',
      '[V:S] c d _e c | _d2 c2 | c2 =B2 | c4 |]',
      '[V:A] G G G G | _A2 G2 | _E2 =D2 | E4 |]',
      '[V:T] _E F _E _E | F2 _E2 | C2 G,2 | G,4 |]',
      '[V:B] C, B,, C, C, | F,2 G,2 | _A,,2 G,,2 | C,4 |]',
    ].join('\n');

    it('verifies C minor key signature (3 flats: Bb, Eb, Ab) and chromatic chords', () => {
      const score = extractScore(chromaticAbc);
      expect(score.key).toBe('Cm');
      const keyInfo = describeKeySignature(score.key);
      expect(keyInfo.flats).toEqual(['Bb', 'Eb', 'Ab']);
      expect(keyInfo.description).toContain('leading tone B');

      // Measure 2: Neapolitan 6th (N6): Bass has F, Alto _A, Soprano _d, Tenor F forming Db major triad in 1st inversion
      const m2 = score.measures[1];
      expect(m2.abcSlice).toContain('_d2');
      expect(m2.abcSlice).toContain('_A2');
      expect(m2.abcSlice).toContain('F,2');

      // Measure 3: Augmented 6th resolving to dominant (Bass _A,, to G,,, Soprano c to =B, Tenor C to G,)
      const m3 = score.measures[2];
      expect(m3.abcSlice).toContain('_A,,2');
      expect(m3.abcSlice).toContain('=B2');
    });
  });

  describe('Benchmark 6: ABC Octave Registers & Pitch Step Realization', () => {
    const wideRegistersAbc = [
      'X:6',
      'T:Wide Pitch Registers',
      'M:4/4',
      'L:1/4',
      'K:C',
      '[V:1] c\'\' b\' a\' g\' | c\' b a g | c B A G | C B, A, G, | C, B,, A,, G,, |]',
    ].join('\n');

    it('correctly maps pitches across 5 octave registers (C2 to C7)', () => {
      const score = extractScore(wideRegistersAbc);
      expect(score.measures).toHaveLength(5);

      // Measure 1: c'' is Octave 7
      const m1Pitches = score.measures[0].events[0].pitches!;
      expect(m1Pitches[0]).toEqual({ step: 'C', octave: 7 });

      // Measure 2: c' is Octave 6
      const m2Pitches = score.measures[1].events[0].pitches!;
      expect(m2Pitches[0]).toEqual({ step: 'C', octave: 6 });

      // Measure 3: c is Octave 5
      const m3Pitches = score.measures[2].events[0].pitches!;
      expect(m3Pitches[0]).toEqual({ step: 'C', octave: 5 });

      // Measure 4: C is Octave 4 (Middle C)
      const m4Pitches = score.measures[3].events[0].pitches!;
      expect(m4Pitches[0]).toEqual({ step: 'C', octave: 4 });

      // Measure 5: C, is Octave 3, C,, is Octave 2
      const m5Pitches = score.measures[4].events[0].pitches!;
      expect(m5Pitches[0]).toEqual({ step: 'C', octave: 3 });
      const m5SecondPitch = score.measures[4].events[1].pitches!;
      expect(m5SecondPitch[0]).toEqual({ step: 'B', octave: 2 });
    });
  });

  describe('Benchmark 7: Polyphonic Voice Leading & 4-3 Suspension', () => {
    const suspensionAbc = [
      'X:7',
      'T:4-3 Suspension in G Major',
      'M:4/4',
      'L:1/4',
      'K:G',
      '[V:S] G A G-G/2F/2 | G4 |]',
      '[V:A] D D D2 | D4 |]',
      '[V:T] B, C B, A, | B,4 |]',
      '[V:B] G, F, G, D, | G,4 |]',
    ].join('\n');

    it('identifies 4-3 suspension: G held over Bass D on beat 3 and resolving to F# on beat 4', () => {
      const score = extractScore(suspensionAbc);
      const m1 = score.measures[0];
      expect(m1.abcSlice).toContain('G-G/2F/2');
      expect(m1.abcSlice).toContain('G, F, G, D,');

      // Soprano ties G into beat 3 over Bass D, forming dissonant 4th, then resolves to F# (3rd) on beat 4
      const sopranoEvents = m1.events.filter((e) => e.voiceId === 'S');
      expect(sopranoEvents.some((e) => e.tieStart)).toBe(true);
    });
  });

  describe('Benchmark 8: Mid-Score Selection Context & Token Economy Hard Ceiling', () => {
    // Generate a 36-measure score with key changes at m. 13 and m. 25
    const multiSectionScore = [
      'X:8',
      'T:Multi-Section Symphony',
      'C:Test Composer',
      'M:4/4',
      'L:1/4',
      'K:C',
      ...Array.from({ length: 12 }, (_, i) => `[V:S] C D E F | % m. ${i + 1}\n[V:B] C, G, C E |`),
      ...Array.from({ length: 12 }, (_, i) => (i === 0
        ? `[V:S] [K:G] G A B c | % m. 13\n[V:B] G, D G, B, |`
        : `[V:S] G A B c | % m. ${i + 13}\n[V:B] G, D G, B, |`)),
      ...Array.from({ length: 12 }, (_, i) => (i === 0
        ? `[V:S] [K:D] [M:3/4] d e f | % m. 25\n[V:B] D, A, D |`
        : `[V:S] d e f | % m. ${i + 25}\n[V:B] D, A, D |`)),
    ].join('\n');

    it('correctly inherits activeKey="D" and activeMeter="3/4" for selection at mm. 26-29', () => {
      const score = extractScore(multiSectionScore);
      expect(score.measures).toHaveLength(36);

      expect(score.measures[0].activeKey).toBe('C');
      expect(score.measures[12].activeKey).toBe('G');
      expect(score.measures[24].activeKey).toBe('D');
      expect(score.measures[25].activeKey).toBe('D');
      expect(score.measures[25].activeMeter).toBe('3/4');

      const snapshot: MusicContextSnapshot = {
        id: 'symphony-snap',
        documentId: 'doc-symphony',
        fileName: 'symphony.abc',
        revision: 1,
        capturedAt: '2026-08-19T00:00:00.000Z',
        abc: multiSectionScore,
        selection: { startMeasure: 26, endMeasure: 29 },
        annotations: [],
      };

      const prompt = formatPrompt('Explain the harmonic progression in mm. 26-29', snapshot);
      expect(prompt).toContain('selection: mm. 26–29 | activeKey="D" (D major (2 sharps: F#, C#)) | activeMeter="3/4"');
      expect(prompt).toContain('[m. 26]');
      expect(prompt).toContain('[m. 29]');
      expect(prompt).not.toContain('[m. 1]'); // Should not dump irrelevant earlier measures in selection slice

      // Token count check
      const promptTokens = Math.ceil(prompt.length / 4);
      const systemTokens = Math.ceil(SHEET_AGENT_SYSTEM_PROMPT.length / 4);
      const totalInitialTokens = promptTokens + systemTokens;

      expect(promptTokens).toBeLessThan(800);
      expect(totalInitialTokens).toBeLessThan(1500); // Well under 2K token target for standard Q&A!
      expect(totalInitialTokens).toBeLessThan(4000); // Strictly satisfies 4K token hard limit!
    });
  });
});
