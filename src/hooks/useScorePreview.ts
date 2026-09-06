import { useCallback, useEffect, useState } from 'react';
import type {
  ScoreAnchor,
  ScoreChangeProposal,
  ScoreVersion,
} from '../types/document';
import {
  applyMeasureMutation,
  applyWholeScoreReplacement,
  type MeasureMutation,
  type MeasureMutationResult,
} from '../music/scoreDrafting';

export interface ScorePreviewState {
  proposal: ScoreChangeProposal;
  abcSource: string;
  previousAnchor: ScoreAnchor | null;
}

export interface UseScorePreviewOptions {
  activeFileId: string | null;
  abcCode: string;
  abcRevision: number;
  activeAnchor: ScoreAnchor | null;
  setActiveAnchor: (anchor: ScoreAnchor | null) => void;
  handleWholeScoreReplacement: (replacementAbc: string, reason?: ScoreVersion['reason']) => MeasureMutationResult;
  handleMeasureMutation: (mutation: MeasureMutation, reason?: ScoreVersion['reason']) => MeasureMutationResult;
}

export interface UseScorePreviewResult {
  scorePreview: ScorePreviewState | null;
  setScorePreview: React.Dispatch<React.SetStateAction<ScorePreviewState | null>>;
  displayAbc: string;
  handlePreviewScoreProposal: (proposal: ScoreChangeProposal) => 'ready' | 'invalid' | 'outdated';
  handleApplyScoreProposal: (proposal: ScoreChangeProposal) => 'accepted' | 'invalid' | 'outdated';
  handleDiscardScoreProposal: (proposal: ScoreChangeProposal) => void;
  handleExitScorePreview: () => void;
}

export function useScorePreview({
  activeFileId,
  abcCode,
  abcRevision,
  activeAnchor,
  setActiveAnchor,
  handleWholeScoreReplacement,
  handleMeasureMutation,
}: UseScorePreviewOptions): UseScorePreviewResult {
  const [scorePreview, setScorePreview] = useState<ScorePreviewState | null>(null);

  // Adjust preview during render when activeFileId changes
  const [prevActiveFileId, setPrevActiveFileId] = useState(activeFileId);
  if (activeFileId !== prevActiveFileId) {
    setPrevActiveFileId(activeFileId);
    setScorePreview(null);
  }

  // Invalidate score preview if its proposal revision does not match current abcRevision
  const previewStale = Boolean(scorePreview && scorePreview.proposal.sourceRevision !== abcRevision);
  if (previewStale) {
    setScorePreview(null);
  }

  useEffect(() => {
    if (previewStale) {
      setActiveAnchor(null);
    }
  }, [previewStale, setActiveAnchor]);

  const displayAbc = scorePreview?.abcSource || abcCode;

  const handlePreviewScoreProposal = useCallback((proposal: ScoreChangeProposal) => {
    if (proposal.documentId !== activeFileId || proposal.sourceRevision !== abcRevision) return 'outdated' as const;
    const result = proposal.kind === 'replace-score'
      ? applyWholeScoreReplacement(abcCode, proposal.replacementAbc)
      : applyMeasureMutation(abcCode, {
          kind: 'replace', span: proposal.span, replacementAbc: proposal.replacementAbc,
        });
    if (result.status !== 'valid') return 'invalid' as const;
    setScorePreview({
      proposal,
      abcSource: result.abcSource,
      previousAnchor: scorePreview?.previousAnchor ?? activeAnchor,
    });
    setActiveAnchor(proposal.span);
    return 'ready' as const;
  }, [abcCode, abcRevision, activeAnchor, activeFileId, scorePreview, setActiveAnchor]);

  const handleApplyScoreProposal = useCallback((proposal: ScoreChangeProposal) => {
    if (proposal.documentId !== activeFileId || proposal.sourceRevision !== abcRevision) return 'outdated' as const;
    const result = proposal.kind === 'replace-score'
      ? handleWholeScoreReplacement(proposal.replacementAbc, 'tool-apply')
      : handleMeasureMutation({
          kind: 'replace', span: proposal.span, replacementAbc: proposal.replacementAbc,
        }, 'tool-apply');
    if (result.status !== 'valid') return 'invalid' as const;
    setScorePreview(null);
    return 'accepted' as const;
  }, [abcRevision, activeFileId, handleMeasureMutation, handleWholeScoreReplacement]);

  const handleDiscardScoreProposal = useCallback((proposal: ScoreChangeProposal) => {
    if (scorePreview?.proposal.id !== proposal.id) return;
    setActiveAnchor(scorePreview.previousAnchor);
    setScorePreview(null);
  }, [scorePreview, setActiveAnchor]);

  const handleExitScorePreview = useCallback(() => {
    if (!scorePreview) return;
    setActiveAnchor(scorePreview.previousAnchor);
    setScorePreview(null);
  }, [scorePreview, setActiveAnchor]);

  return {
    scorePreview,
    setScorePreview,
    displayAbc,
    handlePreviewScoreProposal,
    handleApplyScoreProposal,
    handleDiscardScoreProposal,
    handleExitScorePreview,
  };
}
