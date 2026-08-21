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

  it('navigates to corresponding measures when clicking anywhere on the annotation block', () => {
    const onNavigateMeasure = vi.fn();
    render(<AnnotationProposalCard proposal={proposal()} onNavigateMeasure={onNavigateMeasure} />);

    const annotationTarget = screen.getByRole('button', { name: 'Select m. 2' });
    expect(annotationTarget).toBeTruthy();
    expect(annotationTarget.classList.contains('annotation-proposal-target')).toBe(true);
    expect(annotationTarget.classList.contains('score-reference-link')).toBe(true);

    // Clicking anywhere on the block (e.g. label or body inside the target)
    fireEvent.click(screen.getByText('Dominant'));
    expect(onNavigateMeasure).toHaveBeenCalledWith({ startMeasure: 2, endMeasure: 2 });

    fireEvent.click(screen.getByText('Prepares the cadence.'));
    expect(onNavigateMeasure).toHaveBeenCalledTimes(2);
  });

  it('applies kind-specific class names matching sheet annotation styling', () => {
    const chordProposal = proposal();
    const explanationProposal: AnnotationProposal = {
      ...proposal(),
      id: 'proposal-exp',
      annotation: {
        id: 'annotation-exp',
        kind: 'explanation',
        span: { startMeasure: 3, endMeasure: 4 },
        label: 'Cadential progression',
        body: 'Smooth voice-leading into tonic.',
        source: 'assistant',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    };

    const { container, rerender } = render(<AnnotationProposalCard proposal={chordProposal} />);
    const card = container.querySelector('.annotation-proposal-card');
    expect(card?.classList.contains('annotation-chord')).toBe(true);

    rerender(<AnnotationProposalCard proposal={explanationProposal} />);
    expect(card?.classList.contains('annotation-explanation')).toBe(true);
    expect(screen.getByRole('button', { name: 'Select mm. 3–4' })).toBeTruthy();
  });

  it('renders long labels and descriptions within target structure for boundary wrapping', () => {
    const longProposal: AnnotationProposal = {
      ...proposal(),
      id: 'proposal-long',
      annotation: {
        id: 'annotation-long',
        kind: 'voice-leading',
        span: { startMeasure: 1, endMeasure: 4 },
        label: 'Parallel fifths between Soprano and Tenor on beat 2 leading into deceptive cadence',
        body: 'Very detailed explanation describing voice-leading motion across multiple measures that needs wrapping inside the chat panel.',
        source: 'assistant',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    };

    const { container } = render(<AnnotationProposalCard proposal={longProposal} />);
    const card = container.querySelector('.annotation-proposal-card');
    const label = container.querySelector('.annotation-proposal-label');
    const body = container.querySelector('.annotation-proposal-body');
    expect(card).toBeTruthy();
    expect(label?.textContent).toContain('Parallel fifths');
    expect(body?.textContent).toContain('Very detailed explanation');
  });
});

