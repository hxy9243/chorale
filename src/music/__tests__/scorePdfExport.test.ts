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
});


