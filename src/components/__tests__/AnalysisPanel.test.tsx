import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DefaultAnalysisModel } from '../DefaultAnalysisModel';
import { AnalysisPanel } from '../AnalysisPanel';
import { FileRail } from '../FileRail';
import type { AIProviderState } from '../../agent/useAIProviders';
import type { ScoreAnalysisState } from '../../analysis/useScoreAnalysis';

const ai = { desktopAvailable: true, connections: [{ id: 'one', name: 'My provider', status: 'ready' }], analysisSelection: null,
  modelsByConnection: { one: [{ id: 'model', name: 'Study model' }] }, setAnalysisSelection: vi.fn(async () => {}) } as unknown as AIProviderState;
describe('Analysis navigation and settings', () => {
  it('saves an explicit analysis default and never changes the chat selection', async () => {
    const setSelection = vi.fn(); render(<DefaultAnalysisModel ai={{ ...ai, setSelection }} />);
    fireEvent.change(screen.getByLabelText('Analysis provider'), { target: { value: 'one' } });
    expect((screen.getByRole('button', { name: 'Save analysis default' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Analysis model'), { target: { value: 'model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save analysis default' }));
    await waitFor(() => expect(ai.setAnalysisSelection).toHaveBeenCalledWith({ connectionId: 'one', modelId: 'model' }));
    expect(setSelection).not.toHaveBeenCalled();
  });
  it('lets a user request lenses before setup and exposes the setup action', () => {
    const updatePreferences = vi.fn(), onSettings = vi.fn();
    const analysis = { available: true, ready: true, valid: true, fingerprint: 'f', preferences: { lenses: [], autoRefresh: true }, findings: [],
      display: { labels: 'both', functionColors: false }, updateDisplay: vi.fn(),
      updatePreferences, refresh: vi.fn(), stop: vi.fn(), state: null, result: undefined, error: null } as ScoreAnalysisState;
    render(<AnalysisPanel analysis={analysis} ai={ai} hasScore onSettings={onSettings} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Chords' }));
    expect(updatePreferences).toHaveBeenCalledWith({ lenses: ['chords'], autoRefresh: true });
    fireEvent.click(screen.getByRole('button', { name: 'Set up' })); expect(onSettings).toHaveBeenCalledOnce();
  });
  it('moves history to its own rail action and renames the Tools panel', () => {
    const onHistory = vi.fn(); render(<FileRail documents={[]} activeFileId="" onSelectDocument={vi.fn()} onFileLoaded={vi.fn()}
      onOpenHistory={onHistory} analysisPanel={<p>Analysis controls</p>} />);
    expect(screen.queryByRole('tab', { name: 'Tools' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Analysis' })); expect(screen.getByText('Analysis controls')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'History' })); expect(onHistory).toHaveBeenCalledOnce();
  });
});
