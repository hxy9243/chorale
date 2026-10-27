import React, { useState } from 'react';
import type { ScoreImportJob } from '../types/scoreScan';

export const BackgroundImportStage: React.FC<{
  job: ScoreImportJob;
  onCancel(): Promise<void>;
  onRemove(): Promise<void>;
  onImportAnother(): void;
}> = ({ job, onCancel, onRemove, onImportAnother }) => {
  const [error, setError] = useState('');
  const pending = ['queued', 'importing', 'recognized'].includes(job.state);
  const act = (callback: () => Promise<void>) => { void callback().catch((failure) => setError(failure instanceof Error ? failure.message : 'This action could not be completed.')); };
  return <main className="central-workspace background-import-stage" aria-label="Background score import">
    <section className="background-import-card">
      <h2>{job.title}{pending && <span className="scan-importing-label"> (importing...)</span>}</h2>
      {pending ? <div role="status"><p>This score is still being imported in the background.</p><p>You can keep working on other scores.</p><p className="scan-help">{job.state === 'queued' ? 'Waiting for the current import to finish.' : job.state === 'recognized' ? 'Preparing the editable score…' : `Reading ${job.pages.length} ${job.pages.length === 1 ? 'page' : 'pages'} with ${job.engine === 'copisteria' ? 'Copisteria' : 'Audiveris'}…`}</p></div>
        : <p role="alert">{job.error || 'This import could not be completed.'}</p>}
      {error && <p className="scan-error" role="alert">{error}</p>}
      <div className="background-import-actions">
        {pending ? <button type="button" onClick={() => act(onCancel)}>Cancel import</button> : <button type="button" onClick={() => act(onRemove)}>Remove entry</button>}
        {job.sourceAvailable && <button type="button" onClick={() => act(() => window.choraleScan!.openSourceFolder(job.id))}>Open source folder</button>}
        {!pending && <button type="button" onClick={onImportAnother}>Import another file</button>}
      </div>
    </section>
  </main>;
};
