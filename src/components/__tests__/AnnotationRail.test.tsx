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
  const inertProps = {
    editing: null,
    editor: null,
    onEdit: vi.fn(),
  } as const;

  it('excludes chords and sorts range annotations in score order', () => {
    render(<AnnotationRail {...inertProps} annotations={rangeAnnotations} onSelect={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: 'Annotations' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Annotations' })).toBeNull();
    expect(screen.queryByText('Notes tied to score passages.')).toBeNull();
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
    render(<AnnotationRail {...inertProps} annotations={rangeAnnotations} onSelect={onSelect} />);
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
    render(<AnnotationRail {...inertProps} annotations={[]} onSelect={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: 'Annotations' })).toBeDefined();
    expect(screen.getByText('No range annotations yet.')).toBeDefined();
    expect(screen.queryByLabelText(/range annotations/)).toBeNull();
  });

  it('positions range cards against their rendered measure heights', () => {
    const anchorYByAnnotationId = {
      modulation: 120,
      explanation: 240,
      voice: 360,
      later: 480,
    };
    const { container } = render(
      <AnnotationRail
        {...inertProps}
        annotations={rangeAnnotations}
        anchorYByAnnotationId={anchorYByAnnotationId}
        scoreHeight={600}
        onSelect={vi.fn()}
      />,
    );

    const list = container.querySelector<HTMLElement>('.annotation-rail-list')!;
    expect(list.dataset.scoreAligned).toBe('true');
    expect(list.style.getPropertyValue('--annotation-list-height')).toBe('600px');
    for (const [id, anchorY] of Object.entries(anchorYByAnnotationId)) {
      const card = container.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`)!;
      expect(card.dataset.annotationAnchorY).toBe(String(anchorY));
      expect(card.style.top).toBe(`${anchorY}px`);
    }
  });

  it('offers 44px edit controls and replaces the chosen card with its editor', () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <AnnotationRail
        {...inertProps}
        annotations={rangeAnnotations}
        onSelect={vi.fn()}
        onEdit={onEdit}
      />,
    );
    const editButtons = screen.getAllByRole('button', { name: 'Edit annotation' });
    expect(editButtons).toHaveLength(4);
    expect(editButtons[0].querySelector('[role="tooltip"]')?.textContent).toBe('Edit annotation');
    fireEvent.click(editButtons[0]);
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'modulation' }),
      editButtons[0],
    );

    rerender(
      <AnnotationRail
        {...inertProps}
        annotations={rangeAnnotations}
        editing={{ mode: 'accepted', annotationId: 'modulation' }}
        editor={<form aria-label="Inline test editor">Fields</form>}
        onSelect={vi.fn()}
      />,
    );
    const editor = screen.getByRole('form', { name: 'Inline test editor' });
    expect(editor.closest('.annotation-card-editor')?.parentElement?.getAttribute('data-annotation-kind'))
      .toBe('modulation');
    expect(screen.getAllByRole('button', { name: 'Edit annotation' })).toHaveLength(3);
  });

  it('omits add and count controls while retaining an externally opened editor', () => {
    const { container, rerender } = render(
      <AnnotationRail
        {...inertProps}
        annotations={[]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Add annotation/ })).toBeNull();
    expect(screen.queryByLabelText(/range annotations/)).toBeNull();
    expect(container.querySelector('.annotation-rail-create')).toBeNull();
    expect(container.querySelector('.annotation-rail-count')).toBeNull();

    rerender(
      <AnnotationRail
        {...inertProps}
        annotations={[]}
        editing={{ mode: 'manual' }}
        editor={<form aria-label="Create inline annotation">Fields</form>}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('form', { name: 'Create inline annotation' })).toBeDefined();
  });
});
