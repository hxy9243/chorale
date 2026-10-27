import './mockSharedStorage';
import type abcjs from 'abcjs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { storageAdapter } from '../utils/storageAdapter';

vi.mock('abcjs', async () => {
  const actual = await vi.importActual<{ default: typeof abcjs }>('abcjs');
  return { default: { ...actual.default, synth: {
    isSupported: () => true,
    CreateSynth: function () { return { init: vi.fn().mockResolvedValue(true) }; },
    SynthController: function () { return { load: vi.fn(), setTune: vi.fn().mockResolvedValue(true), play: vi.fn(), pause: vi.fn() }; },
  } } };
});

describe('staff instrument document editing', () => {
  it('updates all staff voices in ABC, persists, and supports undo/redo and direct source edits', async () => {
    localStorage.clear();
    storageAdapter.resetSession();
    window.history.replaceState({}, '', '/');
    const abc = 'X:1\nT:Staff sound test\nM:4/4\nL:1/4\n%%score (S A) B\nV:S name="Upper"\nV:A\nV:B name="Lower" clef=bass\nK:C\n[V:S] C4 | D4 |\n[V:A] E4 | F4 |\n[V:B] C,4 | G,,4 |';
    await storageAdapter.saveDocuments([{
      id: 'staff-sound-test', name: 'Staff sound test', sourceType: 'abc', abcSource: abc,
      revision: 1, annotations: [], chats: [], versions: [],
      scoreInfo: { title: 'Staff sound test', key: 'C', meter: '4/4' },
      createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z',
    }]);
    localStorage.setItem('chorale.workspace.activeFileId', 'staff-sound-test');
    const view = render(<App />);
    await screen.findByText('Synth Ready', {}, { timeout: 5000 });
    expect(screen.getAllByRole('button', { name: 'Upper: staff sounds' })).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Upper: staff sounds' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Instrument for Staff 1' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Search instruments/ }), { target: { value: 'violin' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Search instruments/ }), { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Instrument for Staff 1' }).textContent).toContain('Violin'));
    expect(screen.getByRole('button', { name: 'Lower: staff sounds' }).textContent).toBe('Lower');
    fireEvent.click(screen.getByRole('button', { name: 'Close staff sound' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Upper: staff sounds' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC code' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Source' }));
    const editor = screen.getByPlaceholderText(/Parsed ABC code/) as HTMLTextAreaElement;
    const changed = editor.value;
    expect(changed.match(/I:MIDI=program 40/g)).toHaveLength(2);
    expect(changed).toContain('[V:B] C,4 | G,,4 |');
    await waitFor(async () => expect((await storageAdapter.getDocuments())[0].abcSource).toBe(changed));
    fireEvent.click(screen.getByRole('button', { name: 'Undo last edit' }));
    await waitFor(() => expect(editor.value).toBe(abc));
    expect(screen.getByRole('button', { name: 'Upper: staff sounds' }).textContent).toBe('Upper');
    fireEvent.click(screen.getByRole('button', { name: 'Redo edit' }));
    await waitFor(() => expect(editor.value).toBe(changed));
    fireEvent.change(editor, { target: { value: changed.replaceAll('program 40', 'program 73') } });
    await screen.findByText('Synth Ready');
    fireEvent.click(screen.getByRole('button', { name: 'Upper: staff sounds' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Instrument for Staff 1' }).textContent).toContain('Flute'));
    view.unmount();
  });
});
