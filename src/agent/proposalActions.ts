import type { Annotation, AnnotationProposal } from '../types/document';
import {
  validateAnnotation,
  validateAnnotationProposal,
} from '../music/documentSchema';

export class ProposalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalActionError';
  }
}

export const markOutdatedProposals = (
  proposals: readonly AnnotationProposal[],
  documentId: string,
  sourceRevision: number,
): AnnotationProposal[] => proposals.map((proposal) => (
  proposal.state === 'proposed'
  && (proposal.documentId !== documentId || proposal.sourceRevision !== sourceRevision)
    ? { ...proposal, state: 'outdated' }
    : proposal
));

export const rejectAnnotationProposal = (
  proposals: readonly AnnotationProposal[],
  proposalId: string,
): AnnotationProposal[] => proposals.map((proposal) => (
  proposal.id === proposalId && proposal.state === 'proposed'
    ? { ...proposal, state: 'rejected' }
    : proposal
));

export const editAnnotationProposal = (
  proposals: readonly AnnotationProposal[],
  proposalId: string,
  value: unknown,
  now = new Date().toISOString(),
): AnnotationProposal[] => {
  const proposal = proposals.find(({ id }) => id === proposalId);
  if (!proposal || proposal.state !== 'proposed') {
    throw new ProposalActionError('Only a proposed annotation can be edited.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProposalActionError('Edited annotation is invalid.');
  }
  const annotation = validateAnnotation({
    ...value,
    id: proposal.annotation.id,
    source: 'assistant',
    agentProfiles: proposal.annotation.agentProfiles,
    createdAt: proposal.annotation.createdAt,
    updatedAt: now,
  });
  if (!annotation) throw new ProposalActionError('Edited annotation is invalid.');

  return proposals.map((candidate) => (
    candidate.id === proposalId ? { ...candidate, annotation } : candidate
  ));
};

export type ApplyAllResult = Readonly<{
  status: 'ready' | 'empty' | 'outdated' | 'invalid';
  proposals: AnnotationProposal[];
  annotations: Annotation[];
  invalidProposalIds: string[];
}>;

export const prepareApplyAll = (
  proposals: readonly AnnotationProposal[],
  documentId: string,
  sourceRevision: number,
  existingAnnotationIds: ReadonlySet<string> = new Set(),
): ApplyAllResult => {
  const synchronized = markOutdatedProposals(proposals, documentId, sourceRevision);
  if (synchronized.some((proposal, index) => (
    proposal.state === 'outdated' && proposals[index]?.state === 'proposed'
  ))) {
    return {
      status: 'outdated',
      proposals: synchronized,
      annotations: [],
      invalidProposalIds: [],
    };
  }

  const eligible = synchronized.filter(({ state }) => state === 'proposed');
  if (eligible.length === 0) {
    return {
      status: 'empty',
      proposals: synchronized,
      annotations: [],
      invalidProposalIds: [],
    };
  }

  const seenIds = new Set(existingAnnotationIds);
  const invalidProposalIds: string[] = [];
  const annotations: Annotation[] = [];
  for (const proposal of eligible) {
    const validatedProposal = validateAnnotationProposal(proposal);
    if (!validatedProposal || seenIds.has(proposal.annotation.id)) {
      invalidProposalIds.push(proposal.id);
      continue;
    }
    seenIds.add(validatedProposal.annotation.id);
    annotations.push(validatedProposal.annotation);
  }
  if (invalidProposalIds.length > 0) {
    return {
      status: 'invalid',
      proposals: synchronized,
      annotations: [],
      invalidProposalIds,
    };
  }

  const acceptedIds = new Set(eligible.map(({ id }) => id));
  return {
    status: 'ready',
    proposals: synchronized.map((proposal) => (
      acceptedIds.has(proposal.id) ? { ...proposal, state: 'accepted' } : proposal
    )),
    annotations,
    invalidProposalIds: [],
  };
};
