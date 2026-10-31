import { RefreshCw } from 'lucide-react';
import type { AIProviderState } from '../agent/useAIProviders';
import { ANALYSIS_LENSES, type AnalysisLens } from '../analysis/types';
import type { ScoreAnalysisState } from '../analysis/useScoreAnalysis';
import './analysis.css';

const LABELS: Record<AnalysisLens, [string, string]> = {
  chords: ['Chords', 'Symbols and Roman numerals'], modulation: ['Modulation', 'Key areas and turning points'],
  cadences: ['Cadences & phrases', 'Endings and phrase structure'], 'non-chord-tones': ['Non-chord tones', 'Passing, neighbor, suspension'],
  'voice-leading': ['Voice-leading', 'Parallels, crossing, spacing'],
};
export const AnalysisPanel = ({ analysis, ai, hasScore, onSettings }: {
  analysis: ScoreAnalysisState; ai: AIProviderState; hasScore: boolean; onSettings(): void;
}) => {
  const selection = ai.analysisSelection;
  const connection = ai.connections.find(c => c.id === selection?.connectionId);
  const model = selection && ai.modelsByConnection[selection.connectionId]?.find(m => m.id === selection.modelId);
  const previousModel = analysis.result && selection && (analysis.result.selection.connectionId !== selection.connectionId || analysis.result.selection.modelId !== selection.modelId);
  const matching = analysis.state?.fingerprint === analysis.fingerprint;
  const status = matching ? analysis.state?.status : 'idle';
  const statusText = !hasScore ? 'Open a score to analyze.'
    : !analysis.available ? 'Automatic analysis requires the updated desktop app.'
    : !analysis.ready ? 'Loading saved analysis preferences…'
    : !analysis.valid ? 'Fix the score to resume analysis.'
    : !selection ? 'Choose a default analysis model.'
    : !analysis.preferences.lenses.length ? 'Choose an analysis to show.'
    : previousModel ? 'Previous model · Refresh to update'
    : status === 'running' ? analysis.state?.message || 'Analyzing the score…'
    : status === 'current' ? `Up to date · ${analysis.state?.completedMeasures} of ${analysis.state?.totalMeasures} measures`
    : status === 'partial' ? `Analyzed ${analysis.state?.completedMeasures} of ${analysis.state?.totalMeasures} measures`
    : status === 'stopped' ? 'Stopped · Refresh when ready'
    : analysis.state?.message || (analysis.preferences.autoRefresh ? 'Waiting to analyze…' : 'Score changed · Refresh to update');
  return <div className="analysis-panel" aria-busy={analysis.available && hasScore && !analysis.ready}>
    <h3>Sheet analysis</h3>
    <div className="analysis-model-notice"><span className="analysis-eyebrow">Default analysis model</span>
      <div><strong>{model?.name || selection?.modelId || 'Not configured'}</strong><button type="button" onClick={onSettings}>{selection ? 'Change' : 'Set up'}</button></div>
      {connection && <small>{connection.name}</small>}
    </div>
    <p className="analysis-status" role="status" aria-live="polite" data-state={status}>{statusText}</p>
    <fieldset disabled={!hasScore || !analysis.available || !analysis.ready} className="analysis-lenses"><legend className="sr-only">Analysis lenses</legend>
      {ANALYSIS_LENSES.map(lens => <label className="analysis-switch-row" key={lens}><span><strong>{LABELS[lens][0]}</strong><small>{LABELS[lens][1]}</small></span>
        <input type="checkbox" role="switch" aria-label={LABELS[lens][0]} checked={analysis.preferences.lenses.includes(lens)}
          onChange={e => analysis.updatePreferences({ ...analysis.preferences, lenses: e.target.checked ? [...analysis.preferences.lenses, lens].sort() : analysis.preferences.lenses.filter(l => l !== lens) })} /></label>)}
    </fieldset>
    <label className="analysis-switch-row analysis-auto"><span><strong>Update after edits</strong><small>Runs when you pause editing</small></span><input type="checkbox" role="switch" aria-label="Update analysis after edits"
      disabled={!hasScore || !analysis.available || !analysis.ready} checked={analysis.preferences.autoRefresh} onChange={e => analysis.updatePreferences({ ...analysis.preferences, autoRefresh: e.target.checked })} /></label>
    <div className="analysis-actions"><button type="button" disabled={!analysis.valid || !selection || !analysis.available || !analysis.ready || !analysis.preferences.lenses.length || status === 'running'}
      onClick={() => void analysis.refresh(status !== 'partial')}><RefreshCw size={13} />{status === 'partial' ? 'Continue analysis' : 'Refresh analysis'}</button>
      {status === 'running' && <button type="button" onClick={() => void analysis.stop()}>Stop</button>}</div>
    <p className="analysis-usage">Enabled lenses use this model. Provider usage limits and charges may apply.</p>
    <details className="analysis-diagnostics"><summary>Display options</summary>
      <label className="analysis-labels">Chord labels<select aria-label="Chord labels" value={analysis.display?.labels ?? 'both'}
        onChange={e => analysis.updateDisplay({ functionColors: analysis.display?.functionColors ?? false, labels: e.target.value as 'both' | 'symbols' | 'roman' })}>
        <option value="both">Symbols + Roman numerals</option><option value="symbols">Symbols</option><option value="roman">Roman numerals</option></select></label>
      <label className="analysis-switch-row"><span><strong>Function colors</strong><small>Tint the existing chord labels</small></span><input type="checkbox" role="switch" aria-label="Function colors"
        checked={analysis.display?.functionColors ?? false} onChange={e => analysis.updateDisplay({ labels: analysis.display?.labels ?? 'both', functionColors: e.target.checked })} /></label>
    </details>
    {(analysis.error || (status === 'error' && analysis.state?.message)) && <p role="alert" className="analysis-error">{analysis.error || analysis.state?.message}</p>}
    {analysis.result?.diagnostics.length ? <details className="analysis-diagnostics"><summary>Analysis notes</summary><ul>{analysis.result.diagnostics.map((d,i) => <li key={i}>{d}</li>)}</ul></details> : null}
  </div>;
};
