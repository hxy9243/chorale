import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScoreExport } from '../useScoreExport';
import type { FileDocument } from '../../types/document';
import { createDocumentFromAbc } from '../../utils/fileSession';

vi.mock('../../utils/fileSave', () => ({
  saveTextFile: vi.fn(),
}));

import { saveTextFile } from '../../utils/fileSave';

const mockSaveTextFile = vi.mocked(saveTextFile);

const buildDocument = (): FileDocument => createDocumentFromAbc('Waltz', 'abc', 'X:1\nT:Waltz\nM:3/4\nL:1/4\nK:G\nG A B|c3|]');

describe('useScoreExport', () => {
  beforeEach(() => {
    mockSaveTextFile.mockReset();
  });

  it('converts the document and saves it as MusicXML', async () => {
    mockSaveTextFile.mockResolvedValue({ saved: true, path: '/tmp/Waltz.musicxml' });
    const { result } = renderHook(() => useScoreExport());

    let saved: unknown;
    await act(async () => {
      saved = await result.current.exportDocument(buildDocument(), 'musicxml');
    });

    expect(mockSaveTextFile).toHaveBeenCalledTimes(1);
    const request = mockSaveTextFile.mock.calls[0][0];
    expect(request.suggestedName).toBe('Waltz.musicxml');
    expect(request.contents).toContain('<score-partwise');
    expect(request.contents).toContain('Waltz');
    expect(saved).toEqual({ saved: true, path: '/tmp/Waltz.musicxml' });
    await waitFor(() => {
      expect(result.current.exportState.status).toBe('success');
    });
  });

  it('returns to idle without a message when the save dialog is cancelled', async () => {
    mockSaveTextFile.mockResolvedValue({ saved: false });
    const { result } = renderHook(() => useScoreExport());

    await act(async () => {
      await result.current.exportDocument(buildDocument(), 'musicxml');
    });

    expect(result.current.exportState.status).toBe('idle');
    expect(result.current.exportState.message).toBeNull();
  });

  it('reports an error state when conversion fails', async () => {
    mockSaveTextFile.mockResolvedValue({ saved: true });
    const { result } = renderHook(() => useScoreExport());
    const brokenDocument = {
      ...buildDocument(),
      abcSource: '',
    };

    await act(async () => {
      await result.current.exportDocument(brokenDocument, 'musicxml');
    });

    expect(mockSaveTextFile).not.toHaveBeenCalled();
    expect(result.current.exportState.status).toBe('error');
    expect(result.current.exportState.message).toContain('empty');
  });

  it('clears the status via dismissStatus', async () => {
    mockSaveTextFile.mockResolvedValue({ saved: true, path: '/tmp/Waltz.musicxml' });
    const { result } = renderHook(() => useScoreExport());

    await act(async () => {
      await result.current.exportDocument(buildDocument(), 'musicxml');
    });
    await waitFor(() => {
      expect(result.current.exportState.status).toBe('success');
    });

    act(() => {
      result.current.dismissStatus();
    });

    expect(result.current.exportState.status).toBe('idle');
  });
});
