import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import type { ScoreScanEngine, ScoreScanRequest, ScoreScanStatus } from '../types/scoreScan';
import { inspectScorePages, type InspectedScorePage } from '../utils/scorePageInspection';
import { scanImportError } from '../utils/prepareScanImport';
import '../styles/score-scan.css';

export const ScoreScanModal: React.FC<{
  onClose(): void;
  onImport(request: ScoreScanRequest): Promise<void>;
}> = ({ onClose, onImport }) => {
  const [status, setStatus] = useState<ScoreScanStatus | null>(null);
  const [engine, setEngine] = useState<ScoreScanEngine>('copisteria');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [inspection, setInspection] = useState<InspectedScorePage[] | null>(null);
  const [inspectionError, setInspectionError] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(true);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    liveRef.current = true;
    const previous = document.activeElement as HTMLElement | null;
    void window.choraleScan?.status().then((value) => { if (liveRef.current) setStatus(value); }).catch(() => {
      if (liveRef.current) setStatus({ available: false, message: 'The local scanner could not be reached. Reopen Chorale and try again.' });
    });
    dialogRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary') || [])].filter((element) => element.getClientRects().length > 0);
      if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === dialogRef.current)) {
        event.preventDefault(); elements.at(-1)?.focus();
      } else if (!event.shiftKey && (document.activeElement === elements.at(-1) || document.activeElement === dialogRef.current)) {
        event.preventDefault(); elements[0]?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => { liveRef.current = false; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    void inspectScorePages(file, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setInspection(result);
      setPages(result.length === 1 ? '1' : `1-${result.length}`);
      setInspecting(false);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setInspectionError(`${failure instanceof Error ? failure.message : 'Could not inspect this file.'} Enter the pages you want to import.`);
      setInspecting(false);
    });
    return () => controller.abort();
  }, [file]);
  const selectedPages = (() => {
    if (!pages.trim() || !/^[\d,\s-]+$/.test(pages) || pages.length > 500) return [];
    const selected = new Set<number>();
    for (const section of pages.split(',')) {
      const match = section.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) return [];
      const first = Number(match[1]); const last = Number(match[2] || match[1]);
      if (first < 1 || last < first || last - first >= 60 || last > (inspection?.length || (/\.png$/i.test(file?.name || '') ? 1 : 10000))) return [];
      for (let page = first; page <= last; page++) selected.add(page);
      if (selected.size > 60) return [];
    }
    return [...selected].sort((a, b) => a - b);
  })();
  const activeEngine = status?.engines?.find((item) => item.id === engine) || status;
  const submit = async () => {
    if (!file || !selectedPages.length || inspecting || submitting) return;
    setSubmitting(true); setError('');
    try {
      const bytes = await file.arrayBuffer();
      if (!liveRef.current) return;
      // Only queueing is awaited. Recognition belongs to the background job.
      await onImport({ name: file.name, bytes, pages, engine });
      if (liveRef.current) onClose();
    } catch (failure) { if (liveRef.current) { setError(scanImportError(failure)); setSubmitting(false); } }
  };
  return <div className="scan-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title" tabIndex={-1}>
      <header className="scan-modal-header"><ScanLine size={22} aria-hidden="true" />
        <div><h2 id="scan-title">Import sheet music (experimental)</h2><p>Choose pages, then continue working while your score imports.</p></div>
        <button type="button" onClick={onClose} aria-label="Close scan"><X size={18} /></button>
      </header>
      <div className="scan-modal-body">
        <p className={`scan-engine-status ${activeEngine && !activeEngine.available ? 'scan-warning' : ''}`} role="status">{activeEngine?.message || 'Checking local scanner…'}</p>
        <label className="scan-engine-choice">Recognition engine<select value={engine} disabled={submitting} onChange={(event) => setEngine(event.target.value as ScoreScanEngine)}><option value="copisteria">Copisteria (default)</option><option value="audiveris">Audiveris</option></select></label>
        <div className="scan-inputs">
          <label>Sheet music file<input type="file" accept=".pdf,.png" disabled={submitting} onChange={(event) => {
            const next = event.target.files?.[0] || null;
            setFile(next); setPages(''); setInspection(null); setInspectionError(''); setError(''); setInspecting(Boolean(next));
          }} /></label>
          <label>Pages to scan<input type="text" value={pages} placeholder="All pages" disabled={inspecting || submitting} onChange={(event) => setPages(event.target.value)} /></label>
        </div>
        <p className="scan-help">All pages selected by default · Up to 60 pages · 20 MB maximum</p>
        {selectedPages.length > 5 && <p className="scan-time-notice" role="note">More than 5 pages are selected. Importing may take a while; it will continue in the background.</p>}
        {inspecting && <p role="status">Checking pages…</p>}
        {inspectionError && <p className="scan-warning">{inspectionError}</p>}
        {inspection && <section className="scan-page-selection" aria-label="Choose music pages">
          <p className="scan-help">All pages are included. Uncheck any covers, blank pages or pages you want to skip.</p>
          <details><summary>Page previews and selection</summary><div className="scan-page-grid">{inspection.map((page) => <label key={page.page} className={`scan-page-card ${selectedPages.includes(page.page) ? 'selected' : ''}`}>
            {page.thumbnail ? <img src={page.thumbnail} alt={`Source page ${page.page} preview`} /> : <span className="scan-page-placeholder">Preview unavailable</span>}
            <span><input type="checkbox" aria-label={`Include page ${page.page}`} checked={selectedPages.includes(page.page)} disabled={submitting} onChange={() => {
              const selected = new Set(selectedPages);
              if (selected.has(page.page)) selected.delete(page.page); else selected.add(page.page);
              setPages([...selected].sort((a, b) => a - b).join(', '));
            }} /> Page {page.page}</span>
            <small>{page.kind === 'music' ? 'Staves detected' : page.kind === 'no-staves' ? 'No staves detected' : 'Check page'}</small>
          </label>)}</div></details>
          <p className="scan-help">{selectedPages.length} {selectedPages.length === 1 ? 'page' : 'pages'} selected.</p>
        </section>}
        {pages && !selectedPages.length && !inspecting && <p className="scan-warning">Choose 1–60 valid page numbers.</p>}
        {error && <p className="scan-error" role="alert">{error}</p>}
      </div>
      <footer className="scan-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="scan-primary" disabled={!file || !activeEngine?.available || inspecting || submitting || !selectedPages.length} onClick={() => { void submit(); }}>{submitting ? 'Adding import…' : 'Import'}</button></footer>
    </div>
  </div>;
};
