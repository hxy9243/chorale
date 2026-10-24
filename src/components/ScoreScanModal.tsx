import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import type { ScoreScanResult } from '../types/scoreScan';
import { extractScore } from '../music/scoreSnapshot';
import { parseMusicXmlForImport } from '../utils/xmlParser';
import { parseAbcHeaderMetadata, updateAbcHeaderMetadata } from '../utils/abcMetadata';
import '../styles/score-scan.css';
import { inspectScorePages, type InspectedScorePage } from '../utils/scorePageInspection';
import { renderPlaybackScore } from '../utils/abcAudio';

type Review = {
  result: ScoreScanResult;
  abc: string;
  warnings: string[];
  notes: number;
  measures: number;
  voices: number;
};

export const ScoreScanModal: React.FC<{
  onClose(): void;
  onImport(abc: string, name: string): void;
}> = ({ onClose, onImport }) => {
  const bridge = window.choraleScan;
  const [engine, setEngine] = useState<{ available: boolean; message: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [inspection, setInspection] = useState<InspectedScorePage[] | null>(null);
  const [inspectionError, setInspectionError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'inspecting' | 'scanning' | 'review'>('idle');
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const notationRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    let live = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    void bridge?.status().then((status) => { if (live) setEngine(status); }).catch(() => {
      if (live) setEngine({ available: false, message: 'The local scanner could not be reached. Reopen Chorale and try again.' });
    });
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary') || [])].filter((element) => element.getClientRects().length > 0);
      if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === dialogRef.current)) {
        event.preventDefault(); elements.at(-1)?.focus();
      } else if (!event.shiftKey && (document.activeElement === elements.at(-1) || document.activeElement === dialogRef.current)) {
        event.preventDefault(); elements[0]?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      live = false;
      // This is a generation counter, not a DOM ref captured for cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestRef.current++;
      void bridge?.cancel().catch(() => {});
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [bridge]);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    void inspectScorePages(file, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setInspection(result);
      setPages(result.filter((page) => page.kind === 'music').slice(0, 5).map((page) => page.page).join(', '));
      setPhase('idle');
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setInspectionError(`${failure instanceof Error ? failure.message : 'Could not inspect this file.'} Enter the pages you want to scan.`);
      setPhase('idle');
    });
    return () => controller.abort();
  }, [file]);

  const selectedPages = (() => {
    if (!pages.trim() || !/^[\d,\s-]+$/.test(pages) || pages.length > 80) return [];
    const selected = new Set<number>();
    for (const section of pages.split(',')) {
      const match = section.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) return [];
      const start = Number(match[1]); const end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end - start > 4 || end > (inspection?.length || (file && /\.png$/i.test(file.name) ? 1 : 10000))) return [];
      for (let page = start; page <= end; page++) selected.add(page);
      if (selected.size > 5) return [];
    }
    return [...selected].sort((a, b) => a - b);
  })();
  const busy = phase === 'inspecting' || phase === 'scanning';
  const togglePage = (page: number) => {
    const selected = new Set(selectedPages);
    if (selected.has(page)) selected.delete(page); else selected.add(page);
    setPages([...selected].sort((a, b) => a - b).join(', '));
    setReview(null); setPhase('idle'); setError('');
  };

  useEffect(() => {
    if (phase !== 'scanning') return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!review || !notationRef.current) return;
    const container = notationRef.current;
    const request = requestRef.current;
    try {
      renderPlaybackScore(container, review.abc, { responsive: 'resize', staffwidth: 520, add_classes: true });
    } catch {
      container.replaceChildren();
      queueMicrotask(() => {
        if (request !== requestRef.current) return;
        setError('The recognized score could not be displayed. Try another page.');
        setReview(null);
        setPhase('idle');
      });
    }
  }, [review]);

  const scan = async () => {
    if (!file || !bridge || !selectedPages.length || busy) return;
    const request = ++requestRef.current;
    setError(''); setReview(null); setElapsed(0); setPhase('scanning');
    try {
      const bytes = await file.arrayBuffer();
      if (request !== requestRef.current) return;
      const result = await bridge.scan({ name: file.name, bytes, pages });
      if (request !== requestRef.current) return;
      const converted = parseMusicXmlForImport(result.musicXml);
      const title = parseAbcHeaderMetadata(converted.abc).title;
      const abc = !title || /^(Title|Untitled(?: score)?|source)$/i.test(title)
        ? updateAbcHeaderMetadata(converted.abc, { title: result.sourceName.replace(/\.(pdf|png)$/i, '') }) : converted.abc;
      const score = extractScore(abc);
      const notes = score.measures.flatMap((measure) => measure.events).reduce((sum, event) => sum + (event.type === 'note' ? event.pitches?.length || 0 : 0), 0);
      if (!notes) throw new Error('No playable notes were recognized. Try a clearer printed page.');
      const rendered = renderPlaybackScore(document.createElement('div'), abc);
      if (!rendered.length) throw new Error('No notation could be displayed. Try another page.');
      const renderingWarnings = rendered.flatMap((tune) => tune.warnings || []).map((warning) => warning.replace(/<[^>]*>/g, ''));
      const sourceNotes = new DOMParser().parseFromString(result.musicXml, 'application/xml').querySelectorAll('note > pitch').length;
      const conversionWarnings = sourceNotes !== notes ? [`The scan contains ${sourceNotes} written notes; conversion produced ${notes}. Check for missing or split notes.`] : [];
      setReview({ result, abc, warnings: [...result.warnings, ...converted.warnings, ...conversionWarnings, ...renderingWarnings], notes, measures: score.measures.length, voices: score.voices.length });
      setPreviewIndex(0); setPhase('review');
    } catch (failure) {
      if (request !== requestRef.current) return;
      const message = failure instanceof Error ? failure.message : 'Scanning failed. Please try again.';
      setError(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''));
      setPhase('idle');
    }
  };

  const accept = () => {
    if (!review) return;
    // This survives normal daemon persistence and retains the source provenance.
    const folder = review.result.sourceFolder.replace(/[\r\n]/g, ' ');
    const name = review.result.sourceName.replace(/\.(pdf|png)$/i, '');
    onImport(`% Chorale scan source: ${folder}\n${review.abc}`, `${name}.abc`);
    onClose();
  };

  return <div className="scan-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title" aria-describedby="scan-description" tabIndex={-1}>
      <header className="scan-modal-header">
        <ScanLine size={22} aria-hidden="true" />
        <div><h2 id="scan-title">Scan sheet music</h2><p id="scan-description">Turn a printed PDF or PNG into an editable score.</p></div>
        <button type="button" onClick={onClose} aria-label="Close scan"><X size={18} /></button>
      </header>
      <div className="scan-modal-body">
        <p className={`scan-engine-status ${engine && !engine.available ? 'scan-warning' : ''}`} role="status">{engine?.message || 'Checking local scanner…'}</p>
        <div className="scan-inputs">
          <label>Sheet music file<input type="file" accept=".pdf,.png" disabled={phase === 'scanning'} onChange={(event) => {
            const next = event.target.files?.[0] || null;
            requestRef.current++; setFile(next); setPages(''); setInspection(null); setInspectionError('');
            setReview(null); setError(''); setPhase(next ? 'inspecting' : 'idle');
          }} /></label>
          <label>Pages to scan<input type="text" value={pages} placeholder="e.g. 2 or 2-4" disabled={busy} onChange={(event) => { setPages(event.target.value); setReview(null); setPhase('idle'); }} aria-describedby="scan-limits" /></label>
        </div>
        <p id="scan-limits" className="scan-help">Up to 5 selected pages · 20 MB maximum · Printed notation</p>
        {phase === 'inspecting' && <p role="status">Checking pages for music…</p>}
        {inspectionError && <p className="scan-warning">{inspectionError}</p>}
        {inspection && <section className="scan-page-selection" aria-label="Choose music pages">
          <p className="scan-help">Pages with staves are selected automatically, up to 5. Check the previews; you can include or skip any page.</p>
          {inspection.filter((page) => page.kind === 'music').length > 5 && <p className="scan-warning">More than 5 pages contain music. The first 5 are selected for this trial; scan the remaining pages in another job.</p>}
          <details open={phase === 'idle'}><summary>Page previews and selection</summary><div className="scan-page-grid">{inspection.map((page) => <label key={page.page} className={`scan-page-card ${selectedPages.includes(page.page) ? 'selected' : ''}`}>
            {page.thumbnail ? <img src={page.thumbnail} alt={`Source page ${page.page} preview`} /> : <span className="scan-page-placeholder">Preview unavailable</span>}
            <span><input type="checkbox" aria-label={`Include page ${page.page}`} checked={selectedPages.includes(page.page)} disabled={busy || (!selectedPages.includes(page.page) && selectedPages.length >= 5)} onChange={() => togglePage(page.page)} /> Page {page.page}</span>
            <small>{page.kind === 'music' ? 'Staves detected' : page.kind === 'no-staves' ? 'No staves detected' : 'Check page'}</small>
          </label>)}</div></details>
          <p className="scan-help" role="status">{selectedPages.length ? `Will scan original pages: ${selectedPages.join(', ')}.` : 'No pages selected. Choose up to 5 music pages.'} {inspection.some((page) => !selectedPages.includes(page.page)) && `Omitted pages: ${inspection.filter((page) => !selectedPages.includes(page.page)).map((page) => page.page).join(', ')}.`}</p>
        </section>}
        {pages && !selectedPages.length && !busy && <p className="scan-warning">Choose 1–5 valid page numbers{inspection ? ` between 1 and ${inspection.length}` : ''}.</p>}
        {error && <p className="scan-error" role="alert">{error}</p>}
        {phase === 'scanning' && <div className="scan-progress" role="status"><strong>Reading the music… {elapsed}s</strong><p>This can take a minute or two. You can close this window to cancel.</p></div>}
        {review && <>
          <div className="scan-review-heading"><h3>Review the recognized score</h3><span>{review.measures} measures · {review.voices} {review.voices === 1 ? 'voice' : 'voices'} · {review.notes} notes</span></div>
          <p className="scan-warning">Check accidentals, rhythms, ties and voice assignments against the original. You can play and correct the score after importing.</p>
          {review.warnings.filter((warning) => warning.startsWith('Some measures have unresolved') || warning.startsWith('The scan contains')).map((warning) => <p key={warning} className="scan-warning">{warning}</p>)}
          <div className="scan-comparison">
            <section aria-label="Scanned source"><h4>Scanned source</h4>
              {review.result.images.length > 1 && <div className="scan-page-buttons">{review.result.images.map((image, index) => <button type="button" key={image.page} aria-pressed={index === previewIndex} onClick={() => setPreviewIndex(index)}>Page {image.page}</button>)}</div>}
              {review.result.images[previewIndex] ? <img src={review.result.images[previewIndex].dataUrl} alt={`Scanned source page ${review.result.images[previewIndex].page}`} /> : <p>Open the source folder to view the original.</p>}
            </section>
            <section aria-label="Recognized notation"><h4>Recognized notation</h4><div ref={notationRef} className="scan-notation" /></section>
          </div>
          {review.warnings.length > 0 && <details className="scan-diagnostics"><summary>Scanner and conversion notes ({review.warnings.length})</summary><ul>{review.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
          <p className="scan-help">The original file and recognition output are saved on this computer.</p>
        </>}
      </div>
      <footer className="scan-modal-footer">
        <button type="button" onClick={onClose}>{phase === 'scanning' ? 'Cancel scan' : 'Cancel'}</button>
        {review && <button type="button" onClick={() => { void bridge?.openSourceFolder(review.result.jobId).catch(() => setError('Could not open the source folder.')); }}>Open source folder</button>}
        {review ? <button type="button" className="scan-primary" onClick={accept}>Import recognized score</button>
          : <button type="button" className="scan-primary" disabled={!file || !engine?.available || busy || !selectedPages.length} onClick={() => { void scan(); }}>Scan selected pages</button>}
      </footer>
    </div>
  </div>;
};
