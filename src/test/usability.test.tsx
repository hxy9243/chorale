import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { NewScoreModal } from '../components/NewScoreModal';
import { storageAdapter } from '../utils/storageAdapter';

vi.mock('abcjs', async () => {
  const actual = await vi.importActual<typeof import('abcjs')>('abcjs');
  return {
    default: {
      parseOnly: actual.parseOnly,
      renderAbc: vi.fn().mockImplementation((element) => {
        if (element) element.innerHTML = '<svg data-testid="sheet-svg" />';
        return [{ getBpm: () => 120 }];
      }),
      synth: {
        isSupported: vi.fn().mockReturnValue(true),
        SynthController: vi.fn(function () {
          return {
            load: vi.fn(),
            setTune: vi.fn().mockResolvedValue(true),
            play: vi.fn(),
            pause: vi.fn(),
          };
        }),
        CreateSynth: vi.fn(function () {
          return { init: vi.fn().mockResolvedValue(true) };
        }),
      },
    },
  };
});

describe('release usability gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    storageAdapter.clearMemoryStore();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      text: () => Promise.resolve(''),
    } as Response);
  });

  it('lets a first-run user import or create a score and keeps the created score visibly active', async () => {
    vi.spyOn(storageAdapter, 'getDocuments').mockResolvedValue([]);
    render(<App />);

    const emptyState = await screen.findByRole('region', { name: 'Start a score' });
    const importButton = within(emptyState).getByRole('button', { name: 'Import Score' });
    const newScoreButton = within(emptyState).getByRole('button', { name: 'New Score' });
    const fileInput = document.querySelector<HTMLInputElement>('.file-rail input[type="file"]');
    const inputClick = vi.fn();
    fileInput?.addEventListener('click', inputClick);

    expect(fileInput?.accept).toBe('.xml,.musicxml,.mxl,.abc');
    fireEvent.click(importButton);
    expect(inputClick).toHaveBeenCalledOnce();

    newScoreButton.focus();
    fireEvent.click(newScoreButton);
    const titleInput = screen.getByRole('textbox', { name: 'Title' });
    await waitFor(() => expect(document.activeElement).toBe(titleInput));

    fireEvent.change(titleInput, { target: { value: 'Release Prelude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create score' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Score' })).toBeNull());
    await waitFor(() => {
      expect(screen.getByLabelText('Current score').textContent).toContain('Release Prelude');
    });
    expect(screen.getByRole('button', { name: 'Open Release Prelude' }).getAttribute('aria-current'))
      .toBe('page');
  });

  it('focuses and identifies invalid New Score fields while preserving other errors', async () => {
    render(<NewScoreModal open onClose={() => undefined} onCreate={() => undefined} />);

    const title = screen.getByRole('textbox', { name: 'Title' });
    const tempo = screen.getByRole('spinbutton', { name: /^Tempo/ });
    fireEvent.change(title, { target: { value: '' } });
    fireEvent.change(tempo, { target: { value: '301' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create score' }));

    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(tempo.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toContain('new-score-errors');
    expect(screen.getByRole('alert').textContent).toContain('Title is required.');
    expect(screen.getByRole('alert').textContent).toContain('Tempo must be between 20 and 300.');

    fireEvent.change(title, { target: { value: 'Fixed title' } });
    expect(title.hasAttribute('aria-invalid')).toBe(false);
    expect(tempo.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).not.toContain('Title is required.');
    expect(screen.getByRole('alert').textContent).toContain('Tempo must be between 20 and 300.');
  });

  it('maps key and meter validation to their fields without relying on error wording', async () => {
    render(<NewScoreModal open onClose={() => undefined} onCreate={() => undefined} />);

    const key = screen.getByRole('textbox', { name: /^Key/ });
    const meter = screen.getByRole('textbox', { name: /^Meter/ });
    fireEvent.change(key, { target: { value: 'H' } });
    fireEvent.change(meter, { target: { value: 'wat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create score' }));

    await waitFor(() => expect(document.activeElement).toBe(key));
    expect(key.getAttribute('aria-invalid')).toBe('true');
    expect(meter.getAttribute('aria-invalid')).toBe('true');
    expect(key.getAttribute('aria-describedby')).toContain('new-score-errors');
    expect(meter.getAttribute('aria-describedby')).toContain('new-score-errors');

    fireEvent.change(key, { target: { value: 'C' } });
    expect(key.hasAttribute('aria-invalid')).toBe(false);
    expect(meter.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Invalid meter format');

    fireEvent.click(screen.getByRole('button', { name: 'Create score' }));
    await waitFor(() => expect(document.activeElement).toBe(meter));
    fireEvent.change(meter, { target: { value: '3/4' } });
    expect(meter.hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('wraps Tab inside New Score and restores focus to its trigger on Escape', async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open New Score</button>
          <NewScoreModal open={open} onClose={() => setOpen(false)} onCreate={() => undefined} />
        </>
      );
    };
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open New Score' });
    trigger.focus();
    fireEvent.click(trigger);
    const title = screen.getByRole('textbox', { name: 'Title' });
    await waitFor(() => expect(document.activeElement).toBe(title));

    const close = screen.getByRole('button', { name: 'Close New Score' });
    const create = screen.getByRole('button', { name: 'Create score' });
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(create);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    title.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps the active-score title in the narrow-column layout contract', () => {
    const themeCss = readFileSync(resolve(process.cwd(), 'src/chorale-theme.css'), 'utf8');

    expect(themeCss).toMatch(/\.central-column\s*{[^}]*container-type:\s*inline-size;/s);
    expect(themeCss).toMatch(
      /\.header-breadcrumb strong\s*{[^}]*overflow:\s*hidden;[^}]*white-space:\s*nowrap;[^}]*text-overflow:\s*ellipsis;/s,
    );
    expect(themeCss).toMatch(
      /@container\s*\(max-width:\s*34rem\)\s*{[\s\S]*?\.header-status-group\s*{[^}]*display:\s*none;[\s\S]*?\.header-history-btn span\s*{[^}]*display:\s*none;/s,
    );
  });
});
