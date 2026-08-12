import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnotationEditor } from '../AnnotationEditor';

describe('AnnotationEditor', () => {
  it('creates a validated manual annotation and focuses the first field', async () => {
    const onSave = vi.fn();
    render(
      <AnnotationEditor
        mode="manual"
        defaultSpan={{ startMeasure: 2, endMeasure: 4 }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Kind'));
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Sequence' } });
    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'The idea repeats by step.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      kind: 'explanation',
      span: { startMeasure: 2, endMeasure: 4 },
      label: 'Sequence',
      body: 'The idea repeats by step.',
      source: 'user',
    });
  });

  it('uses friendly compound beats to save an exact rational chord position', async () => {
    const onSave = vi.fn();
    render(
      <AnnotationEditor
        mode="manual"
        defaultSpan={{ startMeasure: 3, endMeasure: 3 }}
        meter="6/8"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'chord' } });
    fireEvent.change(screen.getByLabelText('Beat'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Chord symbol'), { target: { value: 'D7' } });
    fireEvent.change(screen.getByLabelText('Roman numeral (optional)'), { target: { value: 'V7/V' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Secondary dominant' } });
    fireEvent.change(screen.getByLabelText('Explanation'), { target: { value: 'Prepares the dominant.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      kind: 'chord',
      position: { measure: 3, offset: { numerator: 3, denominator: 8 } },
      chordSymbol: 'D7',
      romanNumeral: 'V7/V',
    });
  });

  it('blocks invalid ranges and surfaces async save failures', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('IndexedDB save failed'));
    render(
      <AnnotationEditor
        mode="manual"
        defaultSpan={{ startMeasure: 2, endMeasure: 4 }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('End measure'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Invalid' } });
    fireEvent.change(screen.getByLabelText('Explanation'), { target: { value: 'Invalid range.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Check the measure range');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('End measure'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    expect((await screen.findByRole('alert')).textContent).toContain('IndexedDB save failed');
  });

  it('supports Escape cancellation and explicit accepted-annotation deletion', () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <AnnotationEditor
        mode="accepted"
        initialAnnotation={{
          id: 'annotation-1',
          kind: 'explanation',
          span: { startMeasure: 1, endMeasure: 1 },
          label: 'Opening',
          body: 'Opening explanation.',
          source: 'user',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        }}
        defaultSpan={{ startMeasure: 1, endMeasure: 1 }}
        onSave={vi.fn()}
        onCancel={onCancel}
        onDelete={onDelete}
      />,
    );

    fireEvent.keyDown(container.querySelector('form')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Delete annotation' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('edits every persisted field and supports changing a chord into a range annotation', async () => {
    const onSave = vi.fn();
    render(
      <AnnotationEditor
        mode="accepted"
        initialAnnotation={{
          id: 'annotation-chord',
          kind: 'chord',
          span: { startMeasure: 2, endMeasure: 2 },
          position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
          chordSymbol: 'G7',
          romanNumeral: 'V7',
          label: 'Dominant',
          body: 'Prepares tonic.',
          source: 'assistant',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        }}
        defaultSpan={{ startMeasure: 2, endMeasure: 2 }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Chord symbol')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'voice-leading' } });
    fireEvent.change(screen.getByLabelText('Start measure'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('End measure'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Outer voices' } });
    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'The outer voices move in contrary motion.' },
    });
    expect(screen.queryByLabelText('Chord symbol')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'annotation-chord',
      kind: 'voice-leading',
      span: { startMeasure: 2, endMeasure: 4 },
      label: 'Outer voices',
      body: 'The outer voices move in contrary motion.',
      source: 'assistant',
    })));
  });

  it('keeps delete failures inline', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Annotation delete failed'));
    render(
      <AnnotationEditor
        mode="accepted"
        initialAnnotation={{
          id: 'annotation-1',
          kind: 'explanation',
          span: { startMeasure: 1, endMeasure: 1 },
          label: 'Opening',
          body: 'Opening explanation.',
          source: 'user',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        }}
        defaultSpan={{ startMeasure: 1, endMeasure: 1 }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete annotation' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Annotation delete failed');
  });
});
