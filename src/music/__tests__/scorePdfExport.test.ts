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

  it('hides synthetic tuplet rests in the exported score SVG output', () => {
    const tupletAbc = `X:1
T:Tuplet Score
L:1/4
M:2/4
K:C
(3x/C/E/ C |
`;
    const html = generateScorePdfHtml({
      abcSource: tupletAbc,
      fallbackTitle: 'Tuplet Test',
    });

    expect(html).toContain('visibility="hidden"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders a multi-system spanning annotation across all covered systems via interval intersection', () => {
    const annotations: Annotation[] = [
      {
        id: 'ann-long',
        kind: 'explanation',
        span: { startMeasure: 1, endMeasure: 8 },
        label: 'Global Form Arc',
        body: 'Spans both system 1 (mm. 1–4) and system 2 (mm. 5–8).',
        source: 'assistant',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: MULTI_SYSTEM_ABC,
      fallbackTitle: 'Multi-system Annotation Arc',
      annotations,
    });

    // Both system rows should contain the annotation card
    const cardMatches = html.match(/Global Form Arc/g);
    expect(cardMatches).not.toBeNull();
    expect(cardMatches?.length).toBe(2);

    // Both system rows should have has-annotations class
    const rowMatches = html.match(/class="print-system-row\s+has-annotations"/g);
    expect(rowMatches?.length).toBe(2);
  });

  it('reserves annotation gutter only for systems with annotations while keeping unannotated systems full-width', () => {
    const annotations: Annotation[] = [
      {
        id: 'ann-line1-only',
        kind: 'modulation',
        span: { startMeasure: 1, endMeasure: 2 },
        label: 'Line 1 Modulation',
        body: 'Only covers measures 1 to 2.',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: MULTI_SYSTEM_ABC,
      fallbackTitle: 'Gutter Isolation Test',
      annotations,
    });

    // System 1 should have annotations class
    expect(html).toContain('class="print-system-row has-annotations"');
    // System 2 should be notation-only (100% full width, no empty annotation gutter)
    expect(html).toContain('class="print-system-row notation-only"');
  });

  it('de-conflicts three dense chord badges near right edge without overlapping at maxClampX', () => {
    const annotations: Annotation[] = [
      {
        id: 'chord-dense-1',
        kind: 'chord',
        span: { startMeasure: 4, endMeasure: 4 },
        position: { measure: 4, offset: { numerator: 1, denominator: 2 } }, // beat 3
        chordSymbol: 'Am7',
        romanNumeral: 'vi7',
        label: 'Chord 1',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-dense-2',
        kind: 'chord',
        span: { startMeasure: 4, endMeasure: 4 },
        position: { measure: 4, offset: { numerator: 3, denominator: 4 } }, // beat 4
        chordSymbol: 'D7',
        romanNumeral: 'V7',
        label: 'Chord 2',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
      {
        id: 'chord-dense-3',
        kind: 'chord',
        span: { startMeasure: 4, endMeasure: 4 },
        position: { measure: 4, offset: { numerator: 7, denominator: 8 } }, // beat 4.5
        chordSymbol: 'G',
        romanNumeral: 'I',
        label: 'Chord 3',
        body: '',
        source: 'user',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    ];

    const html = generateScorePdfHtml({
      abcSource: SAMPLE_ABC,
      fallbackTitle: 'Three Badge Right-Edge Density Test',
      annotations,
    });

    const matches = Array.from(
      html.matchAll(/class="score-chord-badge"\s+transform="translate\(([^,]+),\s*([^)]+)\)"/g),
    );
    expect(matches.length).toBe(3);
    const [b1, b2, b3] = matches.map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }));

    // All three badges must have distinct, strictly increasing X coordinates with sufficient clearance
    expect(b2.x).toBeGreaterThan(b1.x + 30);
    expect(b3.x).toBeGreaterThan(b2.x + 30);

    // Rightmost badge must not bleed beyond the SVG right margin clamp (780 - halfWidth - 14)
    expect(b3.x).toBeLessThanOrEqual(780 - 14);
  });
});


