import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnnotationProposal } from '../../types/document';
import { AnnotationProposalCard } from '../AnnotationProposalCard';

const proposal = (state: AnnotationProposal['state'] = 'proposed'): AnnotationProposal => ({
  id: 'proposal-1',
  runId: 'run-1',
  documentId: 'document-1',
  sourceRevision: 1,
  state,
  annotation: {
    id: 'annotation-1',
    kind: 'chord',
    span: { startMeasure: 2, endMeasure: 2 },
    position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
    chordSymbol: 'G7',
    romanNumeral: 'V7',
    label: 'Dominant',
    body: 'Prepares the cadence.',
    source: 'assistant',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
});

describe('AnnotationProposalCard', () => {
  it('shows canonical proposal content with Edit and Reject but no individual Apply', () => {
    const onEdit = vi.fn();
    const onReject = vi.fn();
    render(<AnnotationProposalCard proposal={proposal()} onEdit={onEdit} onReject={onReject} />);

    expect(screen.getByText('G7')).toBeTruthy();
    expect(screen.getByText('V7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /^Apply$/ })).toBeNull();
  });

  it('keeps actions read-only during a run and collapses rejected proposals', () => {
    const { rerender } = render(<AnnotationProposalCard proposal={proposal()} readOnly />);
    expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<AnnotationProposalCard proposal={proposal('rejected')} />);
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.queryByText('Prepares the cadence.')).toBeNull();
  });

  it('labels outdated and invalid proposals with actionable notices', () => {
    const { rerender } = render(<AnnotationProposalCard proposal={proposal('outdated')} />);
    expect(screen.getByText('Outdated')).toBeTruthy();
    expect(screen.getByText(/Rerun analysis/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

    rerender(<AnnotationProposalCard proposal={proposal()} invalid />);
    expect(screen.getByRole('alert').textContent).toContain('Fix this proposal');
  });
});
