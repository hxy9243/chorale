import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import type { BuildResult, FileDocument } from '../types/document';
import { prepareAbcForPlayback } from '../utils/abcAudio';

export type BuildStatus = 'idle' | 'building' | 'valid' | 'invalid';

export const buildValidationMessage = (status: BuildStatus, buildResult: BuildResult | null): string | null => {
  if (status === 'building') return 'Checking ABC syntax and rebuilding derived score output.';
  if (status === 'invalid') return buildResult?.errors[0]?.message || 'ABC could not be rebuilt.';
  if (status === 'valid' && buildResult) {
    return `Rendered ${buildResult.renderedTuneCount} tune${buildResult.renderedTuneCount === 1 ? '' : 's'} with playback ${buildResult.hasPlayback ? 'available' : 'disabled'}.`;
  }
  return null;
};

export interface UseScoreBuildOptions {
  activeDocument: FileDocument | null | undefined;
  displayAbc: string;
  abcRevision: number;
}

export interface UseScoreBuildResult {
  buildStatus: BuildStatus;
  buildResult: BuildResult | null;
  tunes: abcjs.TuneObject[] | null;
  canRenderScore: boolean;
  workspaceMessage: string | null;
  handleTuneRendered: (renderedTunes: abcjs.TuneObject[] | null) => void;
}

export function useScoreBuild({
  activeDocument,
  displayAbc,
  abcRevision,
}: UseScoreBuildOptions): UseScoreBuildResult {
  const [tunes, setTunes] = useState<abcjs.TuneObject[] | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);

  const buildRequestRef = useRef(0);
  const isFirstBuildRef = useRef(true);
  const lastActiveDocIdRef = useRef<string | null>(null);

  // Reset build status during render when document or score text is empty
  const hasDocumentScore = Boolean(activeDocument && displayAbc.trim());
  const [prevHasDocumentScore, setPrevHasDocumentScore] = useState(hasDocumentScore);
  if (hasDocumentScore !== prevHasDocumentScore) {
    setPrevHasDocumentScore(hasDocumentScore);
    if (!hasDocumentScore) {
      setBuildStatus('idle');
      setBuildResult(null);
      setTunes(null);
    }
  }

  const handleTuneRendered = useCallback((renderedTunes: abcjs.TuneObject[] | null) => {
    setTunes((prev) => {
      if (prev === renderedTunes) return prev;
      if (!prev && !renderedTunes) return null;
      if (prev && renderedTunes && prev.length === renderedTunes.length && prev[0] === renderedTunes[0]) {
        return prev;
      }
      return renderedTunes;
    });
  }, []);

  useEffect(() => {
    if (!activeDocument || !displayAbc.trim()) {
      return;
    }

    const isDocSwitch = lastActiveDocIdRef.current !== activeDocument.id;
    lastActiveDocIdRef.current = activeDocument.id;

    const requestId = ++buildRequestRef.current;
    const delay = (isFirstBuildRef.current || isDocSwitch) ? 0 : 140;
    isFirstBuildRef.current = false;
    const timeout = window.setTimeout(() => {
      try {
        const parsedTunes = typeof abcjs.parseOnly === 'function'
          ? abcjs.parseOnly(prepareAbcForPlayback(displayAbc))
          : abcjs.renderAbc(document.createElement('div'), prepareAbcForPlayback(displayAbc));
        if (requestId !== buildRequestRef.current) return;

        const result: BuildResult = {
          fileId: activeDocument.id,
          revision: abcRevision,
          validation: 'valid',
          errors: [],
          renderedTuneCount: parsedTunes?.length || 0,
          hasPlayback: (parsedTunes?.length || 0) > 0,
        };
        setBuildResult(result);
        setBuildStatus('valid');
      } catch (caught) {
        if (requestId !== buildRequestRef.current) return;
        const message = caught instanceof Error ? caught.message : 'ABC validation failed.';
        const result: BuildResult = {
          fileId: activeDocument.id,
          revision: abcRevision,
          validation: 'invalid',
          errors: [{ message }],
          renderedTuneCount: 0,
          hasPlayback: false,
        };
        setBuildResult(result);
        setBuildStatus('invalid');
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [displayAbc, abcRevision, activeDocument]);

  const canRenderScore = buildStatus === 'valid';
  const workspaceMessage = useMemo(
    () => buildValidationMessage(buildStatus, buildResult),
    [buildResult, buildStatus],
  );

  return {
    buildStatus,
    buildResult,
    tunes,
    canRenderScore,
    workspaceMessage,
    handleTuneRendered,
  };
}
