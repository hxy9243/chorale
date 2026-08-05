import React from 'react';
import type { AnnotationProposal } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';

interface AnnotationProposalCardProps {
  proposal: AnnotationProposal;
  readOnly?: boolean;
  invalid?: boolean;
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
  onEdit,
  onReject,
}) => {
  const { annotation } = proposal;
  const collapsed = proposal.state === 'rejected';
  const actionsDisabled = readOnly || proposal.state !== 'proposed';

  return (
    <section
      className={`annotation-proposal-card ${collapsed ? 'collapsed' : ''}`}
      data-state={proposal.state}
      data-invalid={invalid || undefined}
      aria-label={`${annotation.label} annotation proposal`}
    >
      <div className="annotation-proposal-heading">
        <div>
          <span className="annotation-proposal-kind">{annotation.kind.replace('-', ' ')}</span>
          <strong>{annotation.label}</strong>
        </div>
        <span className="annotation-proposal-state">{STATE_LABELS[proposal.state]}</span>
      </div>
      {!collapsed && (
        <>
          <div className="annotation-proposal-span">{formatAnchorLabel(annotation.span)}</div>
          {annotation.kind === 'chord' && (
            <div className="annotation-proposal-chord">
              <strong>{annotation.chordSymbol}</strong>
              {annotation.romanNumeral && <span>{annotation.romanNumeral}</span>}
            </div>
          )}
          <p>{annotation.body}</p>
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
