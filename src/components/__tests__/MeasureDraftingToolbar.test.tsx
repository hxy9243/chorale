import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MeasureDraftingToolbar } from '../MeasureDraftingToolbar';

describe('MeasureDraftingToolbar', () => {
  const baseProps = {
    span: { startMeasure: 3, endMeasure: 4 },
    selectedAbc: '[V:upper] Z | Z |\n[V:lower] Z | Z |',
  };

  it('submits insert and replacement mutations for the active range', () => {
    const onMutate = vi.fn(() => ({
      status: 'valid' as const,
      abcSource: 'candidate',
      affectedSpan: { startMeasure: 3, endMeasure: 4 },
    }));
    render(<MeasureDraftingToolbar {...baseProps} onMutate={onMutate} />);
    expect(screen.getByRole('toolbar', { name: 'Edit Measures 3–4' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Add before/ }));
    fireEvent.change(screen.getByLabelText(/^Number of measures/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add measures' }));
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'insert', span: baseProps.span, position: 'before', count: 2,
    });

    fireEvent.click(screen.getByRole('button', { name: /Edit ABC/ }));
    fireEvent.change(screen.getByLabelText(/^Replacement ABC/), { target: { value: '[V:upper] C4 | D4 |\n[V:lower] C,4 | D,4 |' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace measures' }));
    expect(onMutate).toHaveBeenLastCalledWith({
      kind: 'replace',
      span: baseProps.span,
      replacementAbc: '[V:upper] C4 | D4 |\n[V:lower] C,4 | D,4 |',
    });
  });

  it('requires confirmation for delete and keeps invalid operations open', () => {
    const onMutate = vi.fn(() => ({ status: 'invalid' as const, errors: ['A score must keep at least one measure.'] }));
    render(<MeasureDraftingToolbar {...baseProps} onMutate={onMutate} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByRole('alertdialog', { name: 'Delete measures?' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete measures' }));
    expect(screen.getByRole('alert').textContent).toContain('A score must keep at least one measure.');
    expect(onMutate).toHaveBeenCalledWith({ kind: 'delete', span: baseProps.span });
  });
});
