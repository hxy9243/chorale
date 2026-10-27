import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoreScanModal } from '../ScoreScanModal';
import { inspectScorePages } from '../../utils/scorePageInspection';
import type { ScoreScanBridge } from '../../types/scoreScan';

vi.mock('../../utils/scorePageInspection', () => ({ inspectScorePages: vi.fn() }));
const bridge = (): ScoreScanBridge => ({ status: vi.fn().mockResolvedValue({ available: true, message: 'Scanner ready.' }),
  scan: vi.fn(), start: vi.fn(), listJobs: vi.fn().mockResolvedValue([]), result: vi.fn(), fail: vi.fn(), dismiss: vi.fn(), cancel: vi.fn(), openSourceFolder: vi.fn() });
const setup = (onImport = vi.fn().mockResolvedValue(undefined)) => {
  window.choraleScan ||= bridge();
  const onClose = vi.fn();
  return { ...render(<ScoreScanModal onClose={onClose} onImport={onImport} />), onClose, onImport };
};
const choose = async (name = 'Source.pdf') => {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-1.4').buffer });
  fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [file] } });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false));
};
beforeEach(() => { vi.mocked(inspectScorePages).mockResolvedValue([{ page: 1, kind: 'music' }]); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.choraleScan; });

describe('background import setup', () => {
  it('selects every page including blank and uncertain pages and warns in red above five', async () => {
    vi.mocked(inspectScorePages).mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ page: i + 1, kind: i === 0 ? 'no-staves' : i === 6 ? 'unknown' : 'music' })));
    const { onImport, onClose } = setup();
    await choose();
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('1-7');
    expect(screen.getByRole('note').className).toBe('scan-time-notice');
    expect(screen.getByRole('note').textContent).toContain('may take a while');
    for (let i = 1; i <= 7; i++) expect((screen.getByLabelText(`Include page ${i}`) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ name: 'Source.pdf', pages: '1-7', engine: 'copisteria' }));
    expect(window.choraleScan!.scan).not.toHaveBeenCalled();
  });
  it('lets users skip pages and removes the notice when five remain', async () => {
    vi.mocked(inspectScorePages).mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ page: i + 1, kind: 'music' })));
    setup(); await choose();
    fireEvent.click(screen.getByLabelText('Include page 1'));
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('2, 3, 4, 5, 6');
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.change(screen.getByLabelText('Pages to scan'), { target: { value: '1-61' } });
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('closes after queueing without waiting for recognition and never cancels on unmount', async () => {
    let finish!: () => void;
    const { onClose, unmount } = setup(vi.fn(() => new Promise<void>((done) => { finish = done; })));
    await choose(); fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByRole('button', { name: 'Adding import…' });
    expect(onClose).not.toHaveBeenCalled();
    unmount(); finish();
    await Promise.resolve();
    expect(window.choraleScan!.cancel).not.toHaveBeenCalled();
  });
  it('surfaces a queueing failure and allows retry', async () => {
    const { onClose, onImport } = setup(vi.fn().mockRejectedValueOnce(new Error('Queue is full.')).mockResolvedValue(undefined));
    await choose(); fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Queue is full');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onImport).toHaveBeenCalledTimes(2);
  });
  it('keeps Audiveris selectable when Copisteria is unavailable', async () => {
    window.choraleScan = bridge();
    vi.mocked(window.choraleScan.status).mockResolvedValue({ available: false, message: 'Install Copisteria.', engines: [
      { id: 'copisteria', available: false, message: 'Install Copisteria.' }, { id: 'audiveris', available: true, message: 'Audiveris ready.' },
    ] });
    const { onImport } = setup();
    await screen.findByText('Install Copisteria.');
    fireEvent.change(screen.getByLabelText('Recognition engine'), { target: { value: 'audiveris' } });
    await choose(); fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ engine: 'audiveris' })));
  });
  it('requires manual pages only if inspection fails', async () => {
    vi.mocked(inspectScorePages).mockRejectedValue(new Error('PDF preview failed.'));
    setup();
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [new File(['broken'], 'Broken.pdf')] } });
    await screen.findByText(/PDF preview failed/);
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Pages to scan'), { target: { value: '3' } });
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('ignores stale page inspection from a previous file', async () => {
    let finish!: (pages: { page: number; kind: 'music' }[]) => void;
    vi.mocked(inspectScorePages).mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    setup();
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [new File(['first'], 'First.pdf')] } });
    await choose('Next.pdf');
    finish([{ page: 1, kind: 'music' }, { page: 2, kind: 'music' }]);
    await waitFor(() => expect(screen.queryByLabelText('Include page 2')).toBeNull());
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('1');
  });
});
