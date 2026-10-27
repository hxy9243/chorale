import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoicesPanel } from '../VoicesPanel';
import type { VoiceMixSettings } from '../../music/voiceMixer';

const synth = vi.hoisted(() => ({ init: vi.fn(), prime: vi.fn(), start: vi.fn(), stop: vi.fn(), resume: vi.fn() }));
vi.mock('abcjs', () => ({ default: { synth: {
  CreateSynth: vi.fn(function () { return synth; }),
  activeAudioContext: () => ({ resume: synth.resume }),
} } }));
const voices = [
  { id: 'S', label: 'Soprano', index: 0, program: 0 },
  { id: 'B', label: 'Bass', index: 1, program: 42 },
];
function Panel({ disabled = false, onBeforePreview = vi.fn(), stopSignal = 0, volume = 0.8 }) {
  const [settings, setSettings] = useState<VoiceMixSettings>({});
  return <VoicesPanel voices={voices} settings={settings} onChange={setSettings} onClose={vi.fn()}
    onBeforePreview={onBeforePreview} disabled={disabled} stopSignal={stopSignal} mainPlaying={false} volume={volume} />;
}

describe('Voices panel', () => {
  beforeEach(() => { vi.clearAllMocks(); synth.init.mockResolvedValue({}); synth.prime.mockResolvedValue({}); synth.resume.mockResolvedValue(undefined); });
  it('searches readable names and families and selects a sound with the keyboard', () => {
    render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: 'Instrument for Soprano' }));
    const search = screen.getByRole('combobox', { name: 'Search instruments for Soprano' });
    fireEvent.change(search, { target: { value: 'violin' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Violin/ })).toBeDefined();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Instrument for Soprano' }).textContent).toContain('Violin');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Instrument for Bass' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'brass' } });
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'no match abc' } });
    expect(screen.getByText('No matching instruments.')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('shows mute, multiple solo and reset state per voice', () => {
    render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: 'Solo Soprano' }));
    expect(within(screen.getByRole('group', { name: 'Bass' })).getByText('Silenced by solo')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Solo Bass' }));
    expect(screen.getAllByText('Solo', { selector: 'small' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bass' }));
    expect(within(screen.getByRole('group', { name: 'Bass' })).getByText('Muted')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reset voices' }));
    expect(screen.getAllByText('Audible')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Mute Bass' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('auditions the selected instrument without changing mute/solo and cancels samples on stop or close', async () => {
    const onBeforePreview = vi.fn();
    const view = render(<Panel onBeforePreview={onBeforePreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Instrument for Soprano' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'flute' } });
    fireEvent.click(screen.getByRole('option', { name: /^Flute\s*Pipe$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute Soprano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Soprano' }));
    await waitFor(() => expect(synth.start).toHaveBeenCalledTimes(1));
    expect(synth.init.mock.lastCall?.[0].sequence.tracks[0][0].instrument).toBe(73);
    expect(onBeforePreview).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Mute Soprano' }).getAttribute('aria-pressed')).toBe('true');
    view.rerender(<Panel onBeforePreview={onBeforePreview} stopSignal={1} />);
    expect(synth.stop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Bass' }));
    await waitFor(() => expect(synth.start).toHaveBeenCalledTimes(2));
    view.unmount();
    expect(synth.stop).toHaveBeenCalledTimes(2);
  });
  it('shows both staff rows for a shared label and dismisses on outside pointer, focus, or window blur', () => {
    const onClose = vi.fn();
    const view = render(<><button>Outside</button><svg><text className="staff-sound-label">Other staff</text></svg>
      <VoicesPanel voices={voices} settings={{}} activeStaffId="S" visibleStaffIds={['S', 'B']} title="Piano"
        onChange={vi.fn()} onClose={onClose} onBeforePreview={vi.fn()} disabled={false}
        volume={0.8} stopSignal={0} mainPlaying={false} /></>);
    expect(screen.getByRole('heading', { name: 'Piano' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Instrument for Bass' })).toBeDefined();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Instrument for Soprano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Instrument for Soprano' }));
    const search = screen.getByRole('combobox');
    fireEvent.pointerDown(search);
    fireEvent.focusIn(search);
    fireEvent.mouseLeave(screen.getByRole('dialog', { name: 'Staff sound' }));
    fireEvent.pointerDown(screen.getByText('Other staff'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(onClose).toHaveBeenLastCalledWith(false);
    onClose.mockClear();
    fireEvent.focusIn(screen.getByRole('button', { name: 'Outside' }));
    expect(onClose).toHaveBeenCalledWith(false);
    onClose.mockClear();
    fireEvent(window, new Event('blur'));
    expect(onClose).toHaveBeenCalledWith(false);
    view.unmount();
    onClose.mockClear();
    fireEvent(window, new Event('blur'));
    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('cancels a loading preview and reports failures without getting stuck', async () => {
    let resolve!: () => void;
    synth.init.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const view = render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Soprano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Soprano' }));
    await act(async () => resolve());
    expect(synth.start).not.toHaveBeenCalled();
    synth.init.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Bass' }));
    await waitFor(() => expect(screen.getByText('Could not load this sound. Try Preview again.')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Preview Bass' }).textContent).toBe('Preview');
    view.rerender(<Panel disabled />);
    expect(screen.getByRole('button', { name: 'Mute Bass' }).hasAttribute('disabled')).toBe(true);
  });
});
