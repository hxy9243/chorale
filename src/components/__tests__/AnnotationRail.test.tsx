import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Annotation } from '../../types/document';
import { AnnotationRail } from '../AnnotationRail';

const annotation = (
  id: string,
  kind: Exclude<Annotation['kind'], 'chord'>,
  startMeasure: number,
  endMeasure: number,
  createdAt: string,
): Annotation => ({
  id,
  kind,
  span: { startMeasure, endMeasure },
  label: `${id} label`,
  body: `${id} body with enough detail to represent a longer annotation explanation.`,
  source: 'assistant',
  createdAt,
  updatedAt: createdAt,
});

const rangeAnnotations: Annotation[] = [
  annotation('later', 'explanation', 4, 4, '2026-08-05T00:00:04.000Z'),
  annotation('voice', 'voice-leading', 2, 3, '2026-08-05T00:00:03.000Z'),
  annotation('explanation', 'explanation', 2, 2, '2026-08-05T00:00:02.000Z'),
  annotation('modulation', 'modulation', 2, 2, '2026-08-05T00:00:01.000Z'),
  {
    id: 'chord',
    kind: 'chord',
    span: { startMeasure: 1, endMeasure: 1 },
    position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
    chordSymbol: 'C',
    label: 'Chord label',
    body: 'Chord body',
    source: 'assistant',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
];

describe('AnnotationRail', () => {
  it('excludes chords and sorts range annotations in score order', () => {
    render(<AnnotationRail annotations={rangeAnnotations} onSelect={vi.fn()} />);
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => card.getAttribute('data-annotation-kind'))).toEqual([
      'modulation',
      'explanation',
      'voice-leading',
      'explanation',
    ]);
    expect(screen.queryByText('Chord label')).toBeNull();
  });

  it('clamps cards by default and expands only the selected card', () => {
    const onSelect = vi.fn();
    render(<AnnotationRail annotations={rangeAnnotations} onSelect={onSelect} />);
    const first = screen.getByRole('button', { name: /modulation label/i });
    const second = screen.getByRole('button', { name: /explanation label/i });

    expect(first.querySelector('.annotation-card-body')?.classList.contains('collapsed')).toBe(true);
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(first.querySelector('.annotation-card-body')?.classList.contains('expanded')).toBe(true);
    expect(first.textContent).toContain('Selected');
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'modulation' }),
      first,
    );

    second.focus();
    fireEvent.click(second);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(first.querySelector('.annotation-card-body')?.classList.contains('collapsed')).toBe(true);
    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(second);
  });

  it('renders a persistent, instructive empty state', () => {
    render(<AnnotationRail annotations={[]} onSelect={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: 'Annotations' })).toBeDefined();
    expect(screen.getByText('No range annotations yet.')).toBeDefined();
    expect(screen.getByLabelText('0 range annotations')).toBeDefined();
  });
});
