import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../types/document';
import {
  chordStaffSpacing,
  packAnnotationRailCards,
  packChordBadgeIntervals,
  projectAnnotations,
  requiredChordLaneCount,
  type AnnotationLayoutInput,
} from '../annotationLayout';

const stamp = '2026-08-05T00:00:00.000Z';
const base = {
  source: 'user' as const,
  createdAt: stamp,
  updatedAt: stamp,
};

const geometry: Omit<AnnotationLayoutInput, 'annotations'> = {
  systems: [
    { id: 'system-1', viewBox: '0 0 400 140' },
    { id: 'system-2', viewBox: '0 0 400 140' },
  ],
  measures: [
    { measure: 1, systemId: 'system-1', bounds: { x: 20, y: 40, width: 160, height: 50 } },
    { measure: 2, systemId: 'system-1', bounds: { x: 180, y: 40, width: 180, height: 50 } },
    { measure: 3, systemId: 'system-2', bounds: { x: 20, y: 40, width: 340, height: 50 } },
  ],
  events: [
    { position: { measure: 1, offset: { numerator: 0, denominator: 1 } }, systemId: 'system-1', bounds: { x: 30, y: 55, width: 10, height: 12 } },
    { position: { measure: 1, offset: { numerator: 1, denominator: 4 } }, systemId: 'system-1', bounds: { x: 70, y: 55, width: 10, height: 12 } },
    { position: { measure: 1, offset: { numerator: 1, denominator: 2 } }, systemId: 'system-1', bounds: { x: 110, y: 55, width: 10, height: 12 } },
    { position: { measure: 1, offset: { numerator: 3, denominator: 4 } }, systemId: 'system-1', bounds: { x: 150, y: 55, width: 10, height: 12 } },
    { position: { measure: 2, offset: { numerator: 0, denominator: 1 } }, systemId: 'system-1', bounds: { x: 190, y: 55, width: 10, height: 12 } },
    { position: { measure: 2, offset: { numerator: 3, denominator: 8 } }, systemId: 'system-1', bounds: { x: 270, y: 55, width: 10, height: 12 } },
    { position: { measure: 3, offset: { numerator: 0, denominator: 1 } }, systemId: 'system-2', bounds: { x: 30, y: 55, width: 10, height: 12 } },
  ],
};

describe('annotation layout projection', () => {
  it('keeps multiple chord changes at distinct exact rational onsets in 4/4 and compound 6/8', () => {
    const annotations: Annotation[] = [
      {
        ...base,
        id: 'chord-quarter',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 1, denominator: 4 } },
        chordSymbol: 'F',
        label: 'Subdominant',
        body: 'Moves away from tonic.',
      },
      {
        ...base,
        id: 'chord-half',
        kind: 'chord',
        span: { startMeasure: 1, endMeasure: 1 },
        position: { measure: 1, offset: { numerator: 1, denominator: 2 } },
        chordSymbol: 'G7',
        romanNumeral: 'V7',
        label: 'Dominant',
        body: 'Prepares tonic.',
      },
      {
        ...base,
        id: 'compound-beat-two',
        kind: 'chord',
        span: { startMeasure: 2, endMeasure: 2 },
        position: { measure: 2, offset: { numerator: 3, denominator: 8 } },
        chordSymbol: 'D7',
        label: 'Compound beat two',
        body: 'Starts on the second dotted-quarter beat.',
      },
    ];

    const result = projectAnnotations({ ...geometry, annotations });
    expect(result.map(({ annotationId, x }) => ({ annotationId, x }))).toEqual([
      { annotationId: 'chord-quarter', x: 75 },
      { annotationId: 'chord-half', x: 115 },
      { annotationId: 'compound-beat-two', x: 275 },
    ]);
  });

  it('packs measured chord widths horizontally on one stable baseline with a guaranteed gap', () => {
    const badges = [
      { id: 'wide', systemId: 'system-1', centerX: 100, width: 80 },
      { id: 'same-onset', systemId: 'system-1', centerX: 100, width: 52 },
      { id: 'adjacent', systemId: 'system-1', centerX: 172, width: 52 },
      { id: 'next-system', systemId: 'system-2', centerX: 100, width: 80 },
    ];

    const packed = packChordBadgeIntervals(badges, 6);
    expect(packed.map(({ lane }) => lane)).toEqual([0, 0, 0, 0]);
    expect(packed[1].left - packed[0].right).toBeCloseTo(6);
    expect(packed[2].left - packed[1].right).toBeCloseTo(6);
    expect(packed[3]).toMatchObject({ left: 60, right: 140 });
    expect(requiredChordLaneCount(packed)).toBe(1);
    expect(packChordBadgeIntervals(badges, 6)).toEqual(packed);
  });

  it('always reserves one fixed chord band so annotations cannot reflow the score', () => {
    expect(chordStaffSpacing()).toEqual({ stafftopmargin: 50, staffsep: 111 });
  });

  it('packs rail cards close to their measure centers without vertical overlap', () => {
    const packed = packAnnotationRailCards([
      { id: 'first', targetY: 100, height: 80 },
      { id: 'same-system', targetY: 120, height: 60 },
      { id: 'later-system', targetY: 300, height: 40 },
    ]);

    expect(packed[0]).toMatchObject({ top: 29, bottom: 109 });
    expect(packed[1]).toMatchObject({ top: 121, bottom: 181 });
    expect(packed[2]).toMatchObject({ top: 280, bottom: 320 });
    expect(packed[1].top - packed[0].bottom).toBe(12);
    expect(packAnnotationRailCards([
      { id: 'first', targetY: 100, height: 80 },
      { id: 'same-system', targetY: 120, height: 60 },
      { id: 'later-system', targetY: 300, height: 40 },
    ])).toEqual(packed);
  });

  it('uses one onset for simultaneous voices and interpolates missing rendered onsets', () => {
    const simultaneousEvents = [
      ...geometry.events,
      { position: { measure: 1, offset: { numerator: 1, denominator: 4 } }, systemId: 'system-1', bounds: { x: 70, y: 75, width: 12, height: 12 } },
    ];
    const annotations: Annotation[] = [{
      ...base,
      id: 'between-events',
      kind: 'chord',
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 3, denominator: 8 } },
      chordSymbol: 'Dm',
      label: 'Passing harmony',
      body: 'Falls between rendered onsets.',
    }];

    expect(projectAnnotations({ ...geometry, events: simultaneousEvents, annotations })[0].x).toBe(95);
  });

  it('splits range tracks at wrapped systems while retaining their visual roles', () => {
    const annotations: Annotation[] = [
      { ...base, id: 'mod', kind: 'modulation', span: { startMeasure: 2, endMeasure: 3 }, label: 'New key', body: 'Modulates across the wrap.' },
      { ...base, id: 'voice', kind: 'voice-leading', span: { startMeasure: 1, endMeasure: 2 }, label: 'Lines', body: 'Contrary motion.' },
      { ...base, id: 'note', kind: 'explanation', span: { startMeasure: 3, endMeasure: 3 }, label: 'Phrase', body: 'A side note.' },
    ];

    const result = projectAnnotations({ ...geometry, annotations });
    expect(result.filter(({ annotationId }) => annotationId === 'mod').map(({ systemId }) => systemId))
      .toEqual(['system-1', 'system-2']);
    expect(result.find(({ annotationId }) => annotationId === 'voice')).toMatchObject({
      track: 'voice-leading',
      x: 20,
      width: 340,
      y: 96,
    });
    expect(result.find(({ annotationId }) => annotationId === 'note')).toMatchObject({
      track: 'explanation',
      systemId: 'system-2',
      x: 364,
    });
  });
});
