import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileDocument } from '../types/document';
import type { ScoreImportJob, ScoreScanRequest } from '../types/scoreScan';
import { prepareScanImport, scanImportError } from '../utils/prepareScanImport';

const SELECTED_IMPORT = 'chorale.scan.selectedImport';

type Options = {
  documents: FileDocument[];
  persistedDocumentIds: Set<string>;
  hydrationStatus: string;
  createDocument(abc: string, title: string, options: { id: string; activate: boolean }): string;
  selectDocument(id: string): void;
};

export function useBackgroundScoreImports(options: Options) {
  const bridge = window.choraleScan;
  const [jobs, setJobs] = useState<ScoreImportJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => sessionStorage.getItem(SELECTED_IMPORT));
  const selectedRef = useRef(selectedId);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const processing = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const cancelled = useRef(new Set<string>());
  const [connectionError, setConnectionError] = useState('');
  const select = useCallback((id: string | null) => {
    selectedRef.current = id; setSelectedId(id);
    if (id) sessionStorage.setItem(SELECTED_IMPORT, id); else sessionStorage.removeItem(SELECTED_IMPORT);
  }, []);
  useEffect(() => {
    if (!bridge?.listJobs) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const fresh = await bridge.listJobs();
        if (!live) return;
        setConnectionError('');
        setJobs((old) => JSON.stringify(old) === JSON.stringify(fresh) ? old : fresh);
        if (optionsRef.current.hydrationStatus === 'ready') for (const job of fresh) {
          const current = optionsRef.current;
          if (current.persistedDocumentIds.has(job.id) && job.state === 'recognized') {
            await bridge.dismiss(job.id);
            if (selectedRef.current === job.id) { current.selectDocument(job.id); select(null); }
            continue;
          }
          if (cancelled.current.has(job.id) || job.state !== 'recognized' || current.documents.some((document) => document.id === job.id) || processing.current.has(job.id) || completed.current.has(job.id)) continue;
          processing.current.add(job.id);
          try {
            const result = await bridge.result(job.id);
            if (!live) return;
            if (cancelled.current.has(job.id)) continue;
            const prepared = prepareScanImport(result);
            optionsRef.current.createDocument(prepared.abc, prepared.title, { id: job.id, activate: selectedRef.current === job.id });
            completed.current.add(job.id);
            if (selectedRef.current === job.id) select(null);
          } catch (failure) {
            if (!live) return;
            if (cancelled.current.has(job.id)) continue;
            const message = scanImportError(failure);
            await bridge.fail(job.id, message);
            setJobs((old) => old.map((item) => item.id === job.id ? { ...item, state: 'failed', error: message } : item));
          } finally { processing.current.delete(job.id); }
        }
      } catch (failure) { if (live) setConnectionError(scanImportError(failure)); }
      finally { if (live) timer = setTimeout(() => { void poll(); }, 1000); }
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [bridge, select]);
  const start = useCallback(async (request: ScoreScanRequest) => {
    if (!bridge?.start) throw new Error('Reopen Chorale to enable background imports.');
    const job = await bridge.start(request);
    setJobs((old) => [job, ...old.filter((item) => item.id !== job.id)]);
    select(job.id);
  }, [bridge, select]);
  const cancel = useCallback(async (id: string) => {
    cancelled.current.add(id);
    try { await bridge?.cancel(id); } catch (failure) { cancelled.current.delete(id); throw failure; }
    setJobs((old) => old.map((job) => job.id === id ? { ...job, state: 'cancelled', error: 'Import cancelled. Your original file is preserved.' } : job));
  }, [bridge]);
  const remove = useCallback(async (id: string) => {
    await bridge?.dismiss(id);
    setJobs((old) => old.filter((job) => job.id !== id));
    if (selectedRef.current === id) select(null);
  }, [bridge, select]);
  const visibleJobs = jobs.filter((job) => !options.documents.some((document) => document.id === job.id));
  return { jobs: visibleJobs, activeJob: visibleJobs.find((job) => job.id === selectedId), select, start, cancel, remove, connectionError };
}
