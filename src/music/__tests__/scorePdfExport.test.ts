import { describe, expect, it } from 'vitest';
import { generateScorePdfHtml, ScorePdfExportError } from '../scorePdfExport';
import type { Annotation } from '../../types/document';

const SAMPLE_ABC = `X:1
T:Simple Melody
C:Test Composer
M:4/4
L:1/4
K:C
C D E F | G A B c | c B A G | F E D C |
`;

const MULTI_SYSTEM_ABC = `X:1
T:Long Chorale
M:4/4
L:1/4
K:G
G A B c | d e f g | g f e d | c B A G |
G A B c | d e f g | g f e d | c B A G |
`;

describe('scorePdfExport', () => {
  it('throws when given empty ABC input', () => {
    expect(() => generateScorePdfHtml({ abcSource: '   ' })).toThrow(
      ScorePdfExportError,
    );
  });

  it('generates a valid standalone HTML document with sheet info and branding', () => {
    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: 'My Test Score',
      composer: 'J. S. Bach',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>My Test Score - exported from Chorale</title>');
    expect(html).toContain('J. S. Bach');
    expect(html).toContain('Key Signature:');
    expect(html).toContain('Time Signature:');
    expect(html).toContain('exported from Chorale');
    expect(html).toContain('print-system-row');
    expect(html).toContain('print-notation-col');
    expect(html).toContain('<svg');

  });


  it('escapes hostile HTML characters in title and annotations', () => {
    const dangerousAnnotations: Annotation[] = [
      {
        id: 'ann-xss',
        kind: 'explanation',
        span: { startMeasure: 1, endMeasure: 2 },
        label: '<script>alert("hack")</script>',
        body: '<b>bold</b> & "quotes"',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: '<script>alert(1)</script>',
      annotations: dangerousAnnotations,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;');
  });

  it('renders chord badges in the SVG output', () => {
    const annotations: Annotation[] = [
      {
        id: 'chord-1',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'Cmaj7',
        romanNumeral: 'I7',
        label: 'Tonic chord',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: 'Chord Test',
      annotations,
    });

    expect(html).toContain('score-chord-badge');
    expect(html).toContain('Cmaj7');
    expect(html).toContain('I7');
  });

  it('renders range annotations in the uncollapsed annotation column', () => {
    const annotations: Annotation[] = [
      {
        id: 'ann-mod',
        kind: 'modulation',
        span: { startMeasure: 1, endMeasure: 2 },
        label: 'Tonicization of V',
        body: 'A brief excursion into the dominant key with leading tone F#.',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'ann-vl',
        kind: 'voice-leading',
        span: { startMeasure: 3, endMeasure: 4 },
        label: 'Parallel fifths avoidance',
        body: 'Contrary motion between outer voices.',
        source: 'assistant',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: 'Analysis Score',
      annotations,
    });

    expect(html).toContain('print-annotation-modulation');
    expect(html).toContain('print-annotation-voice-leading');
    expect(html).toContain('Tonicization of V');
    expect(html).toContain('A brief excursion into the dominant key with leading tone F#.');
    expect(html).toContain('Parallel fifths avoidance');
    expect(html).toContain('mm. 1–2');
    expect(html).toContain('mm. 3–4');
  });

  it('renders notation-only layout when no range annotations exist', () => {
    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: 'Clean Score',
      annotations: [],
    });

    expect(html).toContain('notation-only');
    expect(html).not.toContain('class="print-annotation-col"');
  });

  it('renders multi-system scores with sliced system rows', () => {
    const html = generateScorePdfHtml({
      abcSource: MULTI_SYSTEM_ABC,
      fallbackTitle: 'Multi-system Score',
      annotations: [],
    });

    expect(html).toContain('print-system-row');
    expect(html).toContain('viewBox=');
  });

  it('correctly positions chord annotations on multi-line scores across lines', () => {
    const annotations: Annotation[] = [
      {
        id: 'chord-m1',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'G',
        romanNumeral: 'I',
        label: 'Tonic line 1 start',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-m4',
        kind: 'chord',
        span: { startMeasure: 4, endMeasure: 4 },
        position: { measure: 4, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'D7',
        romanNumeral: 'V7',
        label: 'Dominant line 1 end',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-m5',
        kind: 'chord',
        span: { startMeasure: 5, endMeasure: 5 },
        position: { measure: 5, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'G',
        romanNumeral: 'I',
        label: 'Tonic line 2 start',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-m8',
        kind: 'chord',
        span: { startMeasure: 8, endMeasure: 8 },
        position: { measure: 8, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'G',
        romanNumeral: 'I',
        label: 'Tonic line 2 end',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: MULTI_SYSTEM_ABC,
      fallbackTitle: 'Multi-system Chord Score',
      annotations,
    });

    const matches = Array.from(
      html.matchAll(/class="score-chord-badge"\s+transform="translate\(([^,]+),\s*([^)]+)\)"/g),
    );
    expect(matches.length).toBe(4);
    const [c1, c4, c5, c8] = matches.map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    // Chord in m.1 is at start of line 1 (left side)
    expect(c1.x).toBeLessThan(150);
    // Chord in m.4 is at end of line 1 (right side of line 1)
    expect(c4.x).toBeGreaterThan(c1.x + 150);

    // Chord in m.5 is at start of line 2 (left side of line 2, NOT pushed to the right margin)
    expect(c5.x).toBeLessThan(150);
    // Chord in m.8 is at end of line 2 (right side of line 2)
    expect(c8.x).toBeGreaterThan(c5.x + 150);

    // Line 1 chords share a consistent baseline Y
    expect(c1.y).toBeCloseTo(c4.y, 1);
    // Line 2 chords share a consistent baseline Y
    expect(c5.y).toBeCloseTo(c8.y, 1);
    // Line 2 chords are below Line 1 chords on the master canvas
    expect(c5.y).toBeGreaterThan(c1.y + 40);
  });

  it('correctly renders chord annotations on multi-staff (grand staff) scores', () => {
    const grandStaffAbc = `X:1
T:Piano Score
%%staves {(1) (2)}
V:1 clef=treble
V:2 clef=bass
[V:1] C D E F | G A B c | c B A G | F E D C |
[V:2] C, D, E, F, | G, A, B, C | C B, A, G, | F, E, D, C, |
[V:1] C D E F | G A B c | c B A G | F E D C |
[V:2] C, D, E, F, | G, A, B, C | C B, A, G, | F, E, D, C, |
`;

    const annotations: Annotation[] = [
      {
        id: 'chord-p1',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'C',
        romanNumeral: 'I',
        label: 'Tonic',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-p5',
        kind: 'chord',
        span: { startMeasure: 5, endMeasure: 5 },
        position: { measure: 5, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'C',
        romanNumeral: 'I',
        label: 'Tonic System 2',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: grandStaffAbc,
      fallbackTitle: 'Piano Test',
      annotations,
    });

    const matches = Array.from(
      html.matchAll(/class="score-chord-badge"\s+transform="translate\(([^,]+),\s*([^)]+)\)"/g),
    );
    expect(matches.length).toBe(2);
    const [p1, p5] = matches.map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    // Both chords start at the beginning of their respective systems
    expect(p1.x).toBeLessThan(200);
    expect(p5.x).toBeLessThan(200);

    // Chords on grand staff stay safely above the treble staff of each system
    expect(p1.y).toBeLessThan(200);
    expect(p5.y).toBeGreaterThan(p1.y + 150); // System 2 is lower on the master canvas
  });

  it('de-conflicts multiple chords within the same measure horizontally', () => {
    const annotations: Annotation[] = [
      {
        id: 'chord-1a',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'Cmaj7',
        romanNumeral: 'I7',
        label: 'Beat 1',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-1b',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 1, denominator: 4 } },
        chordSymbol: 'Dm7',
        romanNumeral: 'ii7',
        label: 'Beat 2',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: 'Measure Chord Density Test',
      annotations,
    });

    const matches = Array.from(
      html.matchAll(/class="score-chord-badge"\s+transform="translate\(([^,]+),\s*([^)]+)\)"/g),
    );
    expect(matches.length).toBe(2);
    const [first, second] = matches.map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    expect(second.x).toBeGreaterThan(first.x + 35); // Clear gap between badges
    expect(first.y).toBeCloseTo(second.y, 1); // Same baseline
  });
});


