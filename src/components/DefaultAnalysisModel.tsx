import { useState } from 'react';
import type { AIProviderState } from '../agent/useAIProviders';
import './analysis.css';

export const DefaultAnalysisModel = ({ ai }: { ai: AIProviderState }) => {
  const selectionKey = JSON.stringify(ai.analysisSelection ?? null);
  const [draft, setDraft] = useState<{ key: string; connectionId: string; modelId: string } | null>(null);
  const connectionId = draft?.key === selectionKey ? draft.connectionId : ai.analysisSelection?.connectionId ?? '';
  const modelId = draft?.key === selectionKey ? draft.modelId : ai.analysisSelection?.modelId ?? '';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const connection = ai.connections.find(c => c.id === connectionId);
  const models = ai.modelsByConnection[connectionId] ?? [];
  const valid = !connectionId || (connection?.status === 'ready' && models.some(m => m.id === modelId));
  return <section className="default-analysis-model" aria-labelledby="default-analysis-heading"><h3 id="default-analysis-heading">Default sheet analysis model</h3>
    <p>Used by the switches in Analysis. Your chat model can be different.</p>
    <form onSubmit={async e => { e.preventDefault(); if (!ai.setAnalysisSelection || !valid || ai.loading) return; setSaving(true); setMessage(''); setError('');
      try { await ai.setAnalysisSelection(connectionId ? { connectionId, modelId } : null); setMessage('Default saved. Used for the next analysis.'); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the default model.'); } finally { setSaving(false); }
    }}><div className="analysis-model-fields"><label>Analysis provider<select aria-label="Analysis provider" value={connectionId} onChange={e => { setDraft({ key: selectionKey, connectionId: e.target.value, modelId: '' }); setMessage(''); }} disabled={saving || ai.loading || !ai.setAnalysisSelection}>
      <option value="">No default provider</option>{ai.connections.map(c => <option key={c.id} value={c.id} disabled={c.status !== 'ready'}>{c.name}{c.status !== 'ready' ? ' (unavailable)' : ''}</option>)}</select></label>
      <label>Analysis model<select aria-label="Analysis model" value={modelId} onChange={e => { setDraft({ key: selectionKey, connectionId, modelId: e.target.value }); setMessage(''); }} disabled={!connectionId || saving || ai.loading || !ai.setAnalysisSelection}>
        <option value="">Choose a model</option>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>
      <p className="analysis-usage">Enabled analyses send score content to this provider. Provider usage limits and charges may apply. Analysis runs only for enabled lenses.</p>
      <button type="submit" disabled={!valid || saving || ai.loading || !ai.setAnalysisSelection}>{saving ? 'Saving…' : 'Save analysis default'}</button>
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    </form></section>;
};
