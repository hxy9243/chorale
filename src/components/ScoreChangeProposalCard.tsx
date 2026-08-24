import React from 'react';
import { Eye, RotateCcw, Trash2 } from 'lucide-react';
import type { ScoreChangeProposal } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';

export type ScoreChangeProposalCardProps = {
  proposal: ScoreChangeProposal;
  readOnly?: boolean;
  onPreview(): void;
  onApply(): void;
  onDiscard(): void;
};

const stateLabel: Record<ScoreChangeProposal['state'], string> = {
  proposed: 'Ready to review',
  accepted: 'Applied',
  rejected: 'Discarded',
  outdated: 'Outdated',
  unavailable: 'Unavailable',
};

export const ScoreChangeProposalCard: React.FC<ScoreChangeProposalCardProps> = ({
  proposal,
  readOnly = false,
  onPreview,
  onApply,
  onDiscard,
}) => {
  const actionable = proposal.state === 'proposed' && !readOnly;
  return (
    <section className="score-change-proposal-card" data-state={proposal.state} aria-label="Score change proposal">
      <div className="score-change-proposal-heading">
        <div>
          <span>Composition</span>
          <strong>{formatAnchorLabel(proposal.span)}</strong>
        </div>
        <span>{stateLabel[proposal.state]}</span>
      </div>
      <p>{proposal.summary}</p>
      {proposal.state === 'outdated' && <p className="score-change-proposal-notice">The score changed. Ask Chorale to compose again for the current revision.</p>}
      {proposal.state === 'unavailable' && <p className="score-change-proposal-notice">This proposal is unavailable because the run did not complete.</p>}
      {proposal.state === 'proposed' && (
        <div className="score-change-proposal-actions">
          <button type="button" onClick={onPreview} disabled={!actionable}><Eye size={14} /> Preview</button>
          <button type="button" className="primary" onClick={onApply} disabled={!actionable}><RotateCcw size={14} /> Apply</button>
          <button type="button" onClick={onDiscard} disabled={!actionable}><Trash2 size={14} /> Discard</button>
        </div>
      )}
    </section>
  );
};

export default ScoreChangeProposalCard;
