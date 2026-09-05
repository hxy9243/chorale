import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MeasureDraftingToolbar } from '../MeasureDraftingToolbar';

describe('MeasureDraftingToolbar', () => {
  const baseProps = {
    span: { startMeasure: 3, endMeasure: 4 },
  };

  it('binds selected span and submits insert-before and insert-after mutations', () => {
    const onMutate = vi.fn(() => ({
      status: 'valid' as const,
      abcSource: 'candidate',
      affectedSpan: { startMeasure: 3, endMeasure: 4 },
    }));
    const { rerender } = render(<MeasureDraftingToolbar {...baseProps} onMutate={onMutate} />);
    expect(screen.getByRole('group', { name: 'Edit Measures 3–4' })).toBeDefined();
    expect(screen.getByText('Measures 3–4')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Edit ABC/ })).toBeNull();

    // Test single measure span label
    rerender(<MeasureDraftingToolbar span={{ startMeasure: 2, endMeasure: 2 }} onMutate={onMutate} />);
    expect(screen.getByRole('group', { name: 'Edit Measure 2' })).toBeDefined();
    expect(screen.getByText('Measure 2')).toBeDefined();

    // Add before (1-click direct add)
    fireEvent.click(screen.getByRole('button', { name: /Add before/ }));
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'insert', span: { startMeasure: 2, endMeasure: 2 }, position: 'before', count: 1,
    });

    // Add after (1-click direct add)
    fireEvent.click(screen.getByRole('button', { name: /Add after/ }));
    expect(onMutate).toHaveBeenCalledWith({
      kind: 'insert', span: { startMeasure: 2, endMeasure: 2 }, position: 'after', count: 1,
    });
  });

  it('requires confirmation for delete and keeps invalid operations open with error message', () => {
    const onMutate = vi.fn(() => ({ status: 'invalid' as const, errors: ['A score must keep at least one measure.'] }));
    render(<MeasureDraftingToolbar {...baseProps} onMutate={onMutate} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByRole('alertdialog', { name: 'Delete measures?' })).toBeDefined();
    expect(screen.getByText(/This removes measures 3–4 from every voice/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete measures' }));
    expect(screen.getByRole('alert').textContent).toContain('A score must keep at least one measure.');
    expect(onMutate).toHaveBeenCalledWith({ kind: 'delete', span: baseProps.span });
  });
});
