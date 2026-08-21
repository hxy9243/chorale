import React from 'react';
import type { AnnotationProposal, ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';

interface AnnotationProposalCardProps {
  proposal: AnnotationProposal;
  readOnly?: boolean;
  invalid?: boolean;
  onNavigateMeasure?: (anchor: ScoreAnchor) => void;
  onEdit?(trigger: HTMLButtonElement): void;
  onReject?(): void;
}

const STATE_LABELS: Record<AnnotationProposal['state'], string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  outdated: 'Outdated',
  unavailable: 'Unavailable',
};

export const AnnotationProposalCard: React.FC<AnnotationProposalCardProps> = ({
  proposal,
  readOnly = false,
  invalid = false,
  onNavigateMeasure,
  onEdit,
  onReject,
}) => {
  const { annotation } = proposal;
  const collapsed = proposal.state === 'rejected';
  const actionsDisabled = readOnly || proposal.state !== 'proposed';

  return (
    <section
      className={`annotation-proposal-card annotation-${annotation.kind} ${collapsed ? 'collapsed' : ''}`}
      data-state={proposal.state}
      data-invalid={invalid || undefined}
      data-annotation-kind={annotation.kind}
      aria-label={`${annotation.label} annotation proposal`}
    >
      <button
        type="button"
        className="annotation-proposal-target score-reference-link"
        onClick={() => onNavigateMeasure?.(annotation.span)}
        title={`Select ${formatAnchorLabel(annotation.span)} in score`}
        aria-label={`Select ${formatAnchorLabel(annotation.span)}`}
      >
        <div className="annotation-proposal-heading">
          <div className="annotation-proposal-title-group">
            <span className="annotation-proposal-kind">{annotation.kind.replace('-', ' ')}</span>
            <strong className="annotation-proposal-label">{annotation.label}</strong>
          </div>
          <span className="annotation-proposal-state">{STATE_LABELS[proposal.state]}</span>
        </div>
        {!collapsed && (
          <>
            <div className="annotation-proposal-meta">
              <span className="annotation-proposal-span">{formatAnchorLabel(annotation.span)}</span>
            </div>
            {annotation.kind === 'chord' && (
              <div className="annotation-proposal-chord">
                <strong>{annotation.chordSymbol}</strong>
                {annotation.romanNumeral && <span>{annotation.romanNumeral}</span>}
              </div>
            )}
            <p className="annotation-proposal-body">{annotation.body}</p>
          </>
        )}
      </button>
      {!collapsed && (
        <>
          {proposal.state === 'outdated' && (
            <p className="annotation-proposal-notice">Rerun analysis for the current score revision.</p>
          )}
          {proposal.state === 'unavailable' && (
            <p className="annotation-proposal-notice">This proposal is unavailable because the run did not complete.</p>
          )}
          {invalid && (
            <p className="annotation-proposal-notice" role="alert">Fix this proposal before applying the turn.</p>
          )}
          {proposal.state === 'proposed' && (
            <div className="annotation-proposal-actions">
              <button
                type="button"
                data-proposal-edit={proposal.id}
                onClick={(event) => onEdit?.(event.currentTarget)}
                disabled={actionsDisabled}
              >
                Edit
              </button>
              <button type="button" onClick={onReject} disabled={actionsDisabled}>Reject</button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
