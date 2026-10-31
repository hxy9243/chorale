import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FileDocument } from '../types/document';
import type { AISelection } from '../agent/aiTypes';
import type { MusicContextSnapshot } from '../agent/types';
import { musicalAnalysisKey } from './scoreAnalysis';
import { DEFAULT_ANALYSIS_PREFERENCES, type AnalysisDisplay, type AnalysisPreferences, type AnalysisState } from './types';

export const useScoreAnalysis = (document: FileDocument | undefined, valid: boolean, selection: AISelection | null | undefined) => {
  const bridge = window.choraleAI;
  const available = Boolean(bridge?.observeAnalysis && bridge.requestAnalysis && bridge.setAnalysisPreferences && bridge.getAnalysis);
  const [state, setState] = useState<AnalysisState | null>(null);
  const [preferences, setPreferences] = useState<AnalysisPreferences>(DEFAULT_ANALYSIS_PREFERENCES);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [display, setDisplay] = useState<AnalysisDisplay>(() => {
    try { const saved = JSON.parse(localStorage.getItem('chorale.analysis.display') || 'null');
      if (saved && ['both','symbols','roman'].includes(saved.labels) && typeof saved.functionColors === 'boolean') return saved;
    } catch { /* Display settings are optional. */ }
    return { labels: 'both', functionColors: false };
  });
  const updateDisplay = useCallback((next: AnalysisDisplay) => {
    setDisplay(next); try { localStorage.setItem('chorale.analysis.display', JSON.stringify(next)); } catch { /* Session-only display preferences still work. */ }
  }, []);
  const pendingPreferences = useRef<Promise<unknown>>(Promise.resolve());
  const last = useRef<{ documentId: string; fingerprint: string; lenses: string; selection: string; auto: boolean } | null>(null);
  const documentId = document?.id;
  const source = document?.abcSource ?? '';
  const revision = document?.revision ?? 0;
  const fileName = document?.name ?? '';
  const key = useMemo(() => {
    if (!documentId || !valid) return null;
    try { return musicalAnalysisKey(source); } catch { return null; }
  }, [source, valid, documentId]);
  const context: MusicContextSnapshot | null = useMemo(() => documentId ? {
    id: `analysis-${documentId}-${revision}`, documentId, revision,
    abc: source, fileName, capturedAt: '', annotations: [],
  } : null, [documentId, revision, source, fileName]);
  const latestContext = useRef(context);
  useLayoutEffect(() => { latestContext.current = context; }, [context]);
  useEffect(() => {
    if (!available || !documentId) return;
    let disposed = false;
    const load = async () => {
      try {
        const next = await bridge!.getAnalysis!(documentId);
        if (disposed) return;
        setState(next); setPreferences(next.preferences); setLoaded(documentId);
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Could not load analysis.'); }
    };
    void load();
    const poll = window.setInterval(() => { void bridge!.getAnalysis!(documentId).then(next => {
      if (!disposed) setState(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    }).catch(() => {}); }, 750);
    return () => { disposed = true; clearInterval(poll); void bridge!.stopAnalysis?.(documentId).catch(() => {}); };
  }, [available, bridge, documentId]);
  const selectionKey = selection ? `${selection.connectionId}/${selection.modelId}` : '';
  const lensesKey = preferences.lenses.join(',');
  const lensesCount = preferences.lenses.length;
  useEffect(() => {
    const draft = latestContext.current;
    if (!available || !draft || loaded !== draft.documentId) return;
    const context = { ...draft, capturedAt: new Date().toISOString() };
    let disposed = false, timeout: ReturnType<typeof setTimeout> | undefined;
    const previous = last.current;
    if (!key) { void bridge!.stopAnalysis?.(context.documentId); return; }
    const first = previous?.documentId !== context.documentId;
    const musicChanged = !first && previous?.fingerprint !== key;
    const lensesChanged = !first && previous?.lenses !== lensesKey;
    const setupCompleted = !first && !previous?.selection && Boolean(selectionKey);
    const autoEnabled = !first && !previous?.auto && preferences.autoRefresh;
    last.current = { documentId: context.documentId, fingerprint: key, lenses: lensesKey, selection: selectionKey, auto: preferences.autoRefresh };
    void (async () => {
      try {
        await pendingPreferences.current;
        if (disposed) return;
        const observed = await bridge!.observeAnalysis!(context);
        if (disposed) return;
        setState(observed); setError(null);
        const shouldStart = lensesCount && selectionKey && observed.status !== 'current'
          && (lensesChanged || setupCompleted || autoEnabled || (preferences.autoRefresh && (musicChanged || first)))
          && (!first || !['partial', 'stopped', 'error'].includes(observed.status));
        if (shouldStart) timeout = setTimeout(() => {
          void bridge!.requestAnalysis!({ context }).then(next => { if (!disposed) setState(next); })
            .catch(e => { if (!disposed) setError(e instanceof Error ? e.message : 'Analysis failed.'); });
        }, musicChanged ? 1500 : 350);
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Could not prepare score analysis.'); }
    })();
    return () => { disposed = true; if (timeout) clearTimeout(timeout); };
  }, [available, bridge, documentId, key, loaded, lensesKey, lensesCount, selectionKey, preferences.autoRefresh]);
  const updatePreferences = useCallback((next: AnalysisPreferences) => {
    if (!context || !available || loaded !== context.documentId) return;
    setPreferences(next); setError(null);
    pendingPreferences.current = pendingPreferences.current.catch(() => {}).then(() => bridge!.setAnalysisPreferences!(context.documentId, next))
      .then(nextState => { setState(nextState); }).catch(e => { setError(e instanceof Error ? e.message : 'Could not save analysis preferences.'); throw e; });
    void pendingPreferences.current.catch(() => {});
  }, [context, available, bridge, loaded]);
  const refresh = useCallback(async (force = true) => {
    if (!context || !key || !available) return;
    setError(null);
    try { await pendingPreferences.current; setState(await bridge!.requestAnalysis!({ context: { ...context, capturedAt: new Date().toISOString() }, force })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed.'); }
  }, [context, key, available, bridge]);
  const stop = useCallback(async () => {
    if (!context) return;
    await bridge?.stopAnalysis?.(context.documentId);
    if (bridge?.getAnalysis) setState(await bridge.getAnalysis(context.documentId));
  }, [bridge, context]);
  const currentState = state?.documentId === documentId ? state : null;
  const result = key && currentState?.result?.fingerprint === key ? currentState.result : undefined;
  const findings = useMemo(() => result?.findings.filter(f => preferences.lenses.includes(f.lens)).map(f => !result.reconciled && (currentState?.totalMeasures ?? 0) > 16 && (f.lens === 'modulation' || f.lens === 'cadences')
    ? { ...f, annotation: { ...f.annotation, body: `Provisional across analysis windows. ${f.annotation.body}` } } : f) ?? [], [result, preferences.lenses, currentState?.totalMeasures]);
  return { available, ready: Boolean(documentId && loaded === documentId), state: currentState, preferences, display, updateDisplay, error, valid: Boolean(key), fingerprint: key, result,
    findings, updatePreferences, refresh, stop };
};
export type ScoreAnalysisState = ReturnType<typeof useScoreAnalysis>;
