import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoreScanModal } from '../ScoreScanModal';
import abcjs from 'abcjs';
import * as xmlParser from '../../utils/xmlParser';
import { exportToMusicXml } from '../../music/musicXmlExport';
import { inspectScorePages } from '../../utils/scorePageInspection';
import type { ScoreScanResult } from '../../types/scoreScan';

vi.mock('../../utils/scorePageInspection', () => ({ inspectScorePages: vi.fn().mockResolvedValue([{ page: 1, kind: 'music' }]) }));

const abc = 'X:1\nT:Scan test\nM:4/4\nL:1/4\nK:C\nC D E F|G A B c|]';
const result: ScoreScanResult = { jobId: '00000000-0000-4000-8000-000000000000', sourceName: 'Source.pdf', sourceFolder: '/tmp/scan-test', musicXml: exportToMusicXml({abcSource:abc}), pages:[1],images:[],warnings:[],elapsedMs:1000 };

const setup = (scan = vi.fn().mockResolvedValue(result)) => {
  window.choraleScan = { status: vi.fn().mockResolvedValue({ available:true,message:'Local scanner ready.' }),scan,cancel:vi.fn().mockResolvedValue(undefined),openSourceFolder:vi.fn().mockResolvedValue(undefined) };
  const onImport=vi.fn();
  const view=render(<ScoreScanModal onClose={vi.fn()} onImport={onImport}/>);
  return { ...view, onImport, scan };
};
const choose = async () => {
  const file = new File(['%PDF-1.4'], 'Source.pdf',{type:'application/pdf'});
  Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode('%PDF-1.4').buffer});
  fireEvent.change(screen.getByLabelText('Sheet music file'),{target:{files:[file]}});
  await waitFor(()=>expect((screen.getByRole('button',{name:'Scan selected pages'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Scan selected pages'}));
};
beforeEach(() => { vi.mocked(inspectScorePages).mockResolvedValue([{ page: 1, kind: 'music' }]); });
afterEach(()=>{ cleanup(); vi.restoreAllMocks(); delete window.choraleScan; });

describe('scan review acceptance',()=>{
  it('reviews invisible-rest triplets with the workspace renderer and preserves the source', async () => {
    const source = 'X:1\nT:Triplet compatibility probe\nM:4/4\nL:1/8\nK:E\n(3xAB c6 |]';
    vi.spyOn(xmlParser, 'parseMusicXmlForImport').mockReturnValue({ abc: source, warnings: [] });
    const { onImport, container } = setup();
    await choose();
    await screen.findByRole('button', { name: 'Import recognized score' });
    await waitFor(() => expect(container.querySelector('.scan-notation .abcjs-triplet')).not.toBeNull());
    expect(container.querySelectorAll('.scan-notation .abcjs-rest[visibility="hidden"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Import recognized score' }));
    expect(onImport.mock.calls[0][0]).toContain(source);
    expect(onImport.mock.calls[0][0]).not.toContain('(3zAB');
  });

  it.each(['validation', 'preview'])('contains %s rendering errors and allows retry', async (stage) => {
    const original = abcjs.renderAbc;
    let calls = 0;
    vi.spyOn(abcjs, 'renderAbc').mockImplementation((...args) => {
      calls++;
      if (calls === (stage === 'validation' ? 1 : 2)) {
        (args[0] as HTMLElement).innerHTML = '<svg data-partial-score="true" />';
        throw new Error('Unsupported notation');
      }
      return original(...args);
    });
    const { onImport, container } = setup();
    await choose();
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Import recognized score' })).toBeNull();
    expect(container.querySelector('[data-partial-score]')).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Scan selected pages' }));
    await screen.findByRole('button', { name: 'Import recognized score' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('requires review and explicit acceptance before creating a document',async()=>{
    const {onImport,scan}=setup();
    await choose();
    await screen.findByRole('button',{name:'Import recognized score'});
    expect(scan).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByText('2 measures · 1 voice · 8 notes')).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'Import recognized score'}));
    expect(onImport).toHaveBeenCalledWith(expect.stringContaining('% Chorale scan source: /tmp/scan-test'),'Source.abc');
  });

  it('cancels on close and ignores a late recognition result',async()=>{
    let resolve!: (result:ScoreScanResult)=>void;
    const {unmount,onImport}=setup(vi.fn(()=>new Promise<ScoreScanResult>((done)=>{resolve=done;})));
    const cancel=window.choraleScan!.cancel;
    await choose();
    await waitFor(()=>expect(resolve).toBeDefined());
    unmount(); resolve(result);
    expect(cancel).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('shows recognition failures and allows a retry without importing',async()=>{
    const {onImport}=setup(vi.fn().mockRejectedValue(new Error('No editable music was recognized.')));
    await choose();
    expect((await screen.findByRole('alert')).textContent).toContain('No editable music');
    expect(onImport).not.toHaveBeenCalled();
    expect((screen.getByRole('button',{name:'Scan selected pages'}) as HTMLButtonElement).disabled).toBe(false);
  });

  it('skips a cover and blank page, preserving original page numbers and manual override', async () => {
    vi.mocked(inspectScorePages).mockResolvedValue([
      { page: 1, kind: 'no-staves' }, { page: 2, kind: 'music' },
      { page: 3, kind: 'no-staves' }, { page: 4, kind: 'unknown' },
    ]);
    const { scan } = setup();
    await choose();
    await screen.findByRole('button', { name: 'Import recognized score' });
    expect(scan).toHaveBeenCalledWith(expect.objectContaining({ pages: '2' }));
    expect((screen.getByLabelText('Include page 1') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Include page 2') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Include page 4'));
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('2, 4');
    fireEvent.click(screen.getByRole('button', { name: 'Scan selected pages' }));
    await waitFor(() => expect(scan).toHaveBeenLastCalledWith(expect.objectContaining({ pages: '2, 4' })));
  });

  it('requires a manual selection when no staves are found', async () => {
    vi.mocked(inspectScorePages).mockResolvedValue([{ page: 1, kind: 'no-staves' }]);
    setup();
    const file = new File(['test'], 'Blank.pdf');
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [file] } });
    await screen.findByText('No staves detected');
    expect((screen.getByRole('button', { name: 'Scan selected pages' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Include page 1'));
    expect((screen.getByRole('button', { name: 'Scan selected pages' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('allows manual page numbers after inspection fails', async () => {
    vi.mocked(inspectScorePages).mockRejectedValue(new Error('PDF preview failed.'));
    setup();
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [new File(['test'], 'Broken.pdf')] } });
    await screen.findByText(/PDF preview failed/);
    expect((screen.getByRole('button', { name: 'Scan selected pages' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Pages to scan'), { target: { value: '3' } });
    expect((screen.getByRole('button', { name: 'Scan selected pages' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('selects at most five music pages and lets the user choose later pages', async () => {
    vi.mocked(inspectScorePages).mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ page: i + 1, kind: 'music' })));
    setup();
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [new File(['test'], 'Long.pdf')] } });
    await screen.findByText(/More than 5 pages contain music/);
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('1, 2, 3, 4, 5');
    expect((screen.getByLabelText('Include page 6') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Include page 1'));
    fireEvent.click(screen.getByLabelText('Include page 6'));
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('2, 3, 4, 5, 6');
  });

  it('ignores stale inspection results after selecting another file', async () => {
    let finish!: (pages: { page: number; kind: 'music' }[]) => void;
    vi.mocked(inspectScorePages).mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    setup();
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [new File(['first'], 'First.pdf')] } });
    fireEvent.change(screen.getByLabelText('Sheet music file'), { target: { files: [new File(['next'], 'Next.pdf')] } });
    await screen.findByText('Staves detected');
    finish([{ page: 1, kind: 'music' }, { page: 2, kind: 'music' }]);
    await waitFor(() => expect(screen.queryByLabelText('Include page 2')).toBeNull());
    expect((screen.getByLabelText('Pages to scan') as HTMLInputElement).value).toBe('1');
  });

  it('does not enable scanning when the engine is missing',async()=>{
    window.choraleScan={status:vi.fn().mockResolvedValue({available:false,message:'Install Audiveris.'}),scan:vi.fn(),cancel:vi.fn().mockResolvedValue(undefined),openSourceFolder:vi.fn()};
    render(<ScoreScanModal onClose={vi.fn()} onImport={vi.fn()}/>);
    await screen.findByText('Install Audiveris.');
    expect((screen.getByRole('button',{name:'Scan selected pages'}) as HTMLButtonElement).disabled).toBe(true);
  });
});
