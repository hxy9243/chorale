import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import abcjs from 'abcjs';
import App, {
  CHAT_OPEN_KEY,
  CHAT_WIDTH_KEY,
  EDITOR_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  FILE_RAIL_COLLAPSED_KEY,
  FILE_RAIL_ACTIVE_PANEL_KEY,
  SHEET_ZOOM_KEY,
} from './App';
import * as xmlParser from './utils/xmlParser';
import { defaultFileRailWidth } from './utils/workspaceSizing';
import { storageAdapter } from './utils/storageAdapter';

vi.mock('abcjs', () => ({
  default: {
    parseOnly: vi.fn().mockReturnValue([{ getBpm: () => 120 }]),
    renderAbc: vi.fn().mockImplementation((element) => {
      if (element) {
        element.innerHTML = '<svg data-testid="sheet-svg"><path class="abcjs-note"/></svg>';
      }
      return [{ getBpm: () => 120 }];
    }),
    synth: {
      isSupported: vi.fn().mockReturnValue(true),
      SynthController: vi.fn(function () { return {
        load: vi.fn(),
        setTune: vi.fn().mockResolvedValue(true),
        play: vi.fn(),
        pause: vi.fn(),
      }; }),
      CreateSynth: vi.fn(function () { return {
        init: vi.fn().mockResolvedValue(true),
      }; }),
    },
  },
}));

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    storageAdapter.clearMemoryStore();

    vi.spyOn(xmlParser, 'extractMusicXml').mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`);

    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        text: () => Promise.resolve(`<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`),
      } as Response);
    });
  });

  it('renders the Figma workspace and opens the ABC editor on demand', async () => {
    render(<App />);

    expect(screen.getByRole('banner').textContent).not.toContain('Chorale');
    expect(document.querySelector('.rail-brand')).not.toBeNull();
    expect(screen.getByText('Import score')).toBeDefined();
    expect(screen.getByRole('tabpanel', { name: 'Files' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Tools' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    }, { timeout: 4000 });

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC display' }));
    expect(screen.getByPlaceholderText(/Parsed ABC code will appear here/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close ABC editor' }));
    expect(screen.queryByPlaceholderText(/Parsed ABC code will appear here/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeDefined();
  }, 10000);

  it('persists files reordered through the rail contract', async () => {
    await storageAdapter.saveDocuments([
      {
        id: 'drag-one',
        name: 'First.abc',
        sourceType: 'abc',
        abcSource: 'X:1\nT:First\nK:C\nCDEF|',
        revision: 1,
        annotations: [],
        chats: [],
        versions: [],
        scoreInfo: { title: 'First' },
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
      {
        id: 'drag-two',
        name: 'Second.abc',
        sourceType: 'abc',
        abcSource: 'X:1\nT:Second\nK:C\nGABc|',
        revision: 1,
        annotations: [],
        chats: [],
        versions: [],
        scoreInfo: { title: 'Second' },
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
    ]);
    localStorage.setItem('chorale.workspace.activeFileId', 'drag-one');
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText('First').length).toBeGreaterThan(0);
    });

    const saveSpy = vi.spyOn(storageAdapter, 'saveDocuments');
    saveSpy.mockClear();

    const source = screen.getByRole('button', { name: 'Open First' });
    fireEvent.keyDown(source, { key: 'ArrowDown' });

    await waitFor(() => {
      const names = [...document.querySelectorAll('.file-item-name')]
        .map((element) => element.textContent);
      expect(names).toEqual(['Second', 'First']);
    });
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'drag-two' }),
        expect.objectContaining({ id: 'drag-one' }),
      ]);
    }, { timeout: 1500 });
    saveSpy.mockRestore();
  });

  it('normalizes unsupported ABC before both visible and validation rendering', async () => {
    const abcSource = 'X:1\nT:Tuplet rest\nL:1/4\nM:2/4\nK:C\n(3x/C/E/ C |';
    await storageAdapter.saveDocuments([{
      id: 'tuplet-rest',
      name: 'tuplet-rest.abc',
      sourceType: 'abc' as const,
      abcSource,
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Tuplet rest' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    }]);
    localStorage.setItem('chorale.workspace.activeFileId', 'tuplet-rest');

    render(<App />);

    await waitFor(() => {
      const parsedSources = vi.mocked(abcjs.parseOnly).mock.calls
        .map((call) => call[0] as string)
        .filter((source) => source.includes('T:Tuplet rest'));
      const renderedSources = vi.mocked(abcjs.renderAbc).mock.calls
        .map((call) => call[1] as string)
        .filter((source) => source.includes('T:Tuplet rest'));
      const allSources = [...parsedSources, ...renderedSources];
      expect(allSources.length).toBeGreaterThanOrEqual(2);
      expect(allSources.every((source) => source.includes('(3z/C/E/'))).toBe(true);
      expect(allSources.every((source) => !source.includes('(3x/C/E/'))).toBe(true);
    });
  });



  it('supports active file switching in the session model', async () => {
    const doc1 = {
      id: 'doc-1',
      name: 'Twinkle, Twinkle, Little Star.xml',
      sourceType: 'musicxml' as const,
      abcSource: 'X:1\nT:Twinkle, Twinkle, Little Star\nK:C\nCCGG',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    const doc2 = {
      id: 'doc-2',
      name: 'Moonlight Sonata.xml',
      sourceType: 'musicxml' as const,
      abcSource: 'X:1\nT:Moonlight Sonata\nK:C#m\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Moonlight Sonata', composer: 'Beethoven' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    await storageAdapter.saveDocuments([doc1, doc2]);
    localStorage.setItem('chorale.workspace.activeFileId', 'doc-1');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    const sample2 = screen.getAllByText('Moonlight Sonata')[0];
    fireEvent.click(sample2);

    await waitFor(() => {
      expect(screen.getAllByText(/Moonlight Sonata/).length).toBeGreaterThan(0);
    });

    const sample1 = screen.getAllByText('Twinkle, Twinkle, Little Star')[0];
    fireEvent.click(sample1);

    await waitFor(() => {
      expect(screen.getAllByText(/Twinkle, Twinkle, Little Star/).length).toBeGreaterThan(0);
    });
  });

  it('allows deleting the final file and shows the empty sheet placeholder', async () => {
    const first = {
      id: 'delete-first',
      name: 'First.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:First\nK:C\nCDEF|',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'First' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    const second = {
      ...first,
      id: 'delete-second',
      name: 'Second.abc',
      abcSource: 'X:1\nT:Second\nK:C\nGABc|',
      scoreInfo: { title: 'Second' },
    };
    await storageAdapter.saveDocuments([first, second]);
    localStorage.setItem('chorale.workspace.activeFileId', first.id);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete First.abc' })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete First.abc' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Second.abc' })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Second.abc' }));

    expect(await screen.findByText('please import a music sheet to start working')).toBeDefined();
    expect(screen.queryByTestId('sheet-svg')).toBeNull();
    expect(localStorage.getItem('chorale.workspace.activeFileId')).toBeNull();
  });

  it('keeps a persistent control for reopening chat after it is closed', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    const renderOptions = vi.mocked(abcjs.renderAbc).mock.calls.at(-1)?.[2] as any;
    act(() => {
      renderOptions.clickListener(
        { startChar: 20 },
        0,
        'abcjs-note abcjs-mm0',
        { measure: 0 },
      );
    });
    expect(screen.getByText('m. 1')).toBeDefined();

    fireEvent.click(screen.getByTitle('Close assistant'));
    expect(screen.queryByLabelText('Current sheet assistant')).toBeNull();
    expect(screen.getByText('m. 1')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByLabelText('Current sheet assistant')).toBeDefined();
  });

  it('anchors the playback dock to the central workspace viewport', () => {
    render(<App />);

    const workspace = document.querySelector('.central-workspace');
    const playbackDock = document.querySelector('.playback-dock-container');
    expect(playbackDock?.parentElement).toBe(workspace);
  });

  it('uses the 25% file rail and the intended editor width when storage is empty', () => {
    render(<App />);

    const workspace = document.querySelector<HTMLElement>('.workspace-body')!;
    expect(workspace.style.gridTemplateColumns)
      .toContain(`${defaultFileRailWidth(window.innerWidth)}px`);
    expect(localStorage.getItem(FILE_RAIL_WIDTH_KEY))
      .toBe(String(defaultFileRailWidth(window.innerWidth)));
    expect(localStorage.getItem(EDITOR_WIDTH_KEY)).toBe('420');
  });

  it('restores every panel width and sheet zoom across a refresh', async () => {
    localStorage.setItem(FILE_RAIL_WIDTH_KEY, '360');
    localStorage.setItem(EDITOR_WIDTH_KEY, '520');
    localStorage.setItem(CHAT_WIDTH_KEY, '320');
    localStorage.setItem(SHEET_ZOOM_KEY, '130');
    const { unmount } = render(<App />);

    const workspace = document.querySelector<HTMLElement>('.workspace-body')!;
    expect(workspace.style.gridTemplateColumns).toContain('360px');
    expect(workspace.style.gridTemplateColumns).toContain('376px');
    expect(document.querySelector('.zoom-level-text')?.textContent).toBe('130%');

    fireEvent.click(screen.getByTitle('Zoom in'));
    await waitFor(() => expect(localStorage.getItem(SHEET_ZOOM_KEY)).toBe('140'));
    unmount();

    render(<App />);
    expect(document.querySelector<HTMLElement>('.workspace-body')!.style.gridTemplateColumns)
      .toContain('360px');
    expect(document.querySelector('.zoom-level-text')?.textContent).toBe('140%');

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC display' }));
    expect(document.querySelector<HTMLElement>('.editor-workspace-card')?.style.width)
      .toBe('456px');
    expect(localStorage.getItem(EDITOR_WIDTH_KEY)).toBe('520');
  });

  it('restores the chat open state and width across refreshes and reopens', async () => {
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([{
      id: 'chat-state-doc',
      name: 'Chat state.abc',
      sourceType: 'abc',
      abcSource: 'X:1\nT:Chat state\nK:C\nCDEF|',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Chat state' },
    }]));
    localStorage.setItem('chorale.workspace.activeFileId', 'chat-state-doc');
    localStorage.setItem(CHAT_OPEN_KEY, 'false');
    localStorage.setItem(CHAT_WIDTH_KEY, '320');
    const { unmount } = render(<App />);

    expect(screen.queryByLabelText('Current sheet assistant')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByLabelText('Current sheet assistant')).toBeDefined();
    const workspace = document.querySelector<HTMLElement>('.workspace-body')!;
    expect(workspace.style.gridTemplateColumns).toContain('376px');
    await waitFor(() => expect(localStorage.getItem(CHAT_OPEN_KEY)).toBe('true'));

    fireEvent.click(screen.getByTitle('Close assistant'));
    await waitFor(() => expect(localStorage.getItem(CHAT_OPEN_KEY)).toBe('false'));
    expect(localStorage.getItem(CHAT_WIDTH_KEY)).toBe('320');
    unmount();

    render(<App />);
    expect(screen.queryByLabelText('Current sheet assistant')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(document.querySelector<HTMLElement>('.workspace-body')!.style.gridTemplateColumns)
      .toContain('376px');
  });

  it('allows deleting files from the file rail', async () => {
    const doc1 = {
      id: 'doc-1',
      name: 'Twinkle, Twinkle, Little Star.xml',
      sourceType: 'musicxml' as const,
      abcSource: 'X:1\nT:Twinkle, Twinkle, Little Star\nK:C\nCCGG',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    const doc2 = {
      id: 'doc-2',
      name: 'Moonlight Sonata.xml',
      sourceType: 'musicxml' as const,
      abcSource: 'X:1\nT:Moonlight Sonata\nK:C#m\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Moonlight Sonata', composer: 'Beethoven' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    await storageAdapter.saveDocuments([doc1, doc2]);
    localStorage.setItem('chorale.workspace.activeFileId', 'doc-1');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    const deleteBtn = screen.getByLabelText(/Delete Twinkle, Twinkle, Little Star.xml/);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Delete Twinkle, Twinkle, Little Star.xml/)).toBeNull();
    });
  });

  it('debounces workspace persistence across rapid ABC edits', async () => {
    const mockDoc = {
      id: 'stored-doc-123',
      name: 'Persisted Score.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:Persisted Score\nK:C\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Persisted Score' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    await storageAdapter.saveDocuments([mockDoc]);
    localStorage.setItem('chorale.workspace.activeFileId', 'stored-doc-123');
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText('Persisted Score').length).toBeGreaterThan(0);
    });

    const saveSpy = vi.spyOn(storageAdapter, 'saveDocuments');
    saveSpy.mockClear();

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC display' }));
    const editor = screen.getByPlaceholderText(/Parsed ABC code will appear here/);

    for (let edit = 1; edit <= 8; edit += 1) {
      fireEvent.change(editor, {
        target: { value: `X:1\nT:Persisted Score\nK:C\nCDEF % edit ${edit}` },
      });
    }

    expect(saveSpy).not.toHaveBeenCalled();

    await waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 1200 });
    const lastSavedDocuments = saveSpy.mock.calls[saveSpy.mock.calls.length - 1][0];
    expect(lastSavedDocuments[0].abcSource).toContain('% edit 8');

    saveSpy.mockRestore();
  });

  it('surfaces storage quota failures under the score title', async () => {
    const mockDoc = {
      id: 'stored-doc-123',
      name: 'Persisted Score.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:Persisted Score\nK:C\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Persisted Score' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    await storageAdapter.saveDocuments([mockDoc]);
    localStorage.setItem('chorale.workspace.activeFileId', 'stored-doc-123');

    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText('Persisted Score').length).toBeGreaterThan(0);
    });

    const saveSpy = vi.spyOn(storageAdapter, 'saveDocuments').mockRejectedValue(
      new DOMException('Storage quota exceeded', 'QuotaExceededError'),
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC display' }));
    const editor = screen.getByPlaceholderText(/Parsed ABC code will appear here/);
    fireEvent.change(editor, { target: { value: 'X:1\nT:Persisted Score\nK:C\nCDEF G' } });

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeDefined();
    }, { timeout: 1200 });

    saveSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('restores the active file and documents from storage on page refresh', async () => {
    const mockDoc = {
      id: 'stored-doc-123',
      name: 'Persisted Score.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:Persisted Score\nK:C\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Persisted Score', composer: 'Anon', key: 'C', meter: '4/4', tempoText: '120', measures: 4 },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
      activeAnchor: null,
    };
    await storageAdapter.saveDocuments([mockDoc]);
    localStorage.setItem('chorale.workspace.activeFileId', 'stored-doc-123');

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Persisted Score').length).toBeGreaterThan(0);
    });
  });

  it('collapses and expands the left sidebar when clicking the active tab icon and persists state', async () => {
    render(<App />);

    const filesTab = screen.getByRole('tab', { name: 'Files' });
    const workspaceBody = document.querySelector<HTMLElement>('.workspace-body')!;

    // Initially sidebar is expanded (rail-collapsed is not present)
    expect(workspaceBody.classList.contains('rail-collapsed')).toBe(false);
    expect(workspaceBody.style.gridTemplateColumns).not.toMatch(/^56px\b/);
    expect(localStorage.getItem(FILE_RAIL_COLLAPSED_KEY)).toBe('false');

    // Clicking the already active 'Files' tab collapses the left sidebar content panel
    fireEvent.click(filesTab);
    expect(workspaceBody.classList.contains('rail-collapsed')).toBe(true);
    expect(workspaceBody.style.gridTemplateColumns).toMatch(/^56px\b/);
    expect(localStorage.getItem(FILE_RAIL_COLLAPSED_KEY)).toBe('true');

    // The persistent rail tabs are still visible
    expect(screen.getByRole('tab', { name: 'Files' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Tools' })).toBeDefined();

    // Clicking 'Files' tab again expands the left sidebar
    fireEvent.click(filesTab);
    expect(workspaceBody.classList.contains('rail-collapsed')).toBe(false);
    expect(workspaceBody.style.gridTemplateColumns).not.toMatch(/^56px\b/);
    expect(localStorage.getItem(FILE_RAIL_COLLAPSED_KEY)).toBe('false');
  });

  it('restores the file rail collapsed state across page refreshes', async () => {
    localStorage.setItem(FILE_RAIL_COLLAPSED_KEY, 'true');
    const { unmount } = render(<App />);

    const workspaceBody = document.querySelector<HTMLElement>('.workspace-body')!;
    expect(workspaceBody.classList.contains('rail-collapsed')).toBe(true);
    expect(workspaceBody.style.gridTemplateColumns).toMatch(/^56px\b/);

    unmount();

    localStorage.setItem(FILE_RAIL_COLLAPSED_KEY, 'false');
    render(<App />);

    const freshWorkspaceBody = document.querySelector<HTMLElement>('.workspace-body')!;
    expect(freshWorkspaceBody.classList.contains('rail-collapsed')).toBe(false);
    expect(freshWorkspaceBody.style.gridTemplateColumns).not.toMatch(/^56px\b/);
  });

  it('toggle icon collapses and re-expands the rail to the last focused panel', async () => {
    render(<App />);

    const workspaceBody = document.querySelector<HTMLElement>('.workspace-body')!;
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });

    // Focus the Tools panel, then collapse via the dedicated toggle icon.
    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(toggle);
    expect(workspaceBody.classList.contains('rail-collapsed')).toBe(true);
    expect(localStorage.getItem(FILE_RAIL_ACTIVE_PANEL_KEY)).toBe('tools');

    // Re-expanding restores the last focused icon (Tools).
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(workspaceBody.classList.contains('rail-collapsed')).toBe(false);
    expect(screen.getByRole('tabpanel', { name: 'Tools' }).hasAttribute('hidden')).toBe(false);
  });

  it('persists the last focused rail panel across page refreshes', async () => {
    localStorage.setItem(FILE_RAIL_ACTIVE_PANEL_KEY, 'tools');
    const { unmount } = render(<App />);

    expect(screen.getByRole('tabpanel', { name: 'Tools' }).hasAttribute('hidden')).toBe(false);

    unmount();
    localStorage.setItem(FILE_RAIL_ACTIVE_PANEL_KEY, 'files');
    render(<App />);

    expect(screen.getByRole('tabpanel', { name: 'Files' }).hasAttribute('hidden')).toBe(false);
  });

  it('updates ABC source and auto-saves when editing metadata from the score header', async () => {
    const mockDoc = {
      id: 'meta-doc-1',
      name: 'Editable Score.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:Editable Score\nC:Original Artist\nM:4/4\nQ:1/4=100\nK:C\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Editable Score', composer: 'Original Artist', key: 'C', meter: '4/4', tempoText: '♩ = 100' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    await storageAdapter.saveDocuments([mockDoc]);
    localStorage.setItem('chorale.workspace.activeFileId', 'meta-doc-1');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Editable Score');
    });

    const saveSpy = vi.spyOn(storageAdapter, 'saveDocuments');
    saveSpy.mockClear();

    // Double click title to edit
    const titleButton = screen.getByRole('button', { name: /Score title: Editable Score/i });
    fireEvent.doubleClick(titleButton);

    const input = screen.getByRole('textbox', { name: 'Edit score title' });
    fireEvent.change(input, { target: { value: 'Renamed Score' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Renamed Score');
    });

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'meta-doc-1',
          abcSource: expect.stringContaining('T:Renamed Score'),
        }),
      ]);
    });

    saveSpy.mockRestore();
  });

  it('supports undo and redo in headbar and history popup reverting', async () => {
    const mockDoc = {
      id: 'hist-app-doc',
      name: 'History Test.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:Original Piece\nC:Composer A\nM:4/4\nK:C\nCDEF',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Original Piece', composer: 'Composer A', key: 'C', meter: '4/4' },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    await storageAdapter.saveDocuments([mockDoc]);
    localStorage.setItem('chorale.workspace.activeFileId', 'hist-app-doc');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Original Piece');
    });

    const undoBtn = screen.getByRole('button', { name: 'Undo last edit' }) as HTMLButtonElement;
    const redoBtn = screen.getByRole('button', { name: 'Redo edit' }) as HTMLButtonElement;

    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);

    // Edit score title
    const titleButton = screen.getByRole('button', { name: /Score title: Original Piece/i });
    fireEvent.doubleClick(titleButton);
    const titleInput = screen.getByRole('textbox', { name: 'Edit score title' });
    fireEvent.change(titleInput, { target: { value: 'Modified Piece' } });
    fireEvent.keyDown(titleInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Modified Piece');
    });

    // Undo button should now be enabled
    expect(undoBtn.disabled).toBe(false);

    // Click Undo in headbar
    fireEvent.click(undoBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Original Piece');
    });
    expect(redoBtn.disabled).toBe(false);

    // Click Redo in headbar
    fireEvent.click(redoBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Modified Piece');
    });

    // Open tools panel and editing history modal
    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    const historyToolBtn = screen.getByRole('button', { name: 'Open file editing history popup' });
    fireEvent.click(historyToolBtn);

    // History dialog should be visible
    expect(screen.getByRole('dialog', { name: 'Editing History' })).toBeDefined();
    expect(screen.getAllByText('Origin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Metadata · title')).toBeDefined();

    // Revert to origin step
    const revertBtn = screen.getByRole('button', { name: /Revert score to step #1/i });
    fireEvent.click(revertBtn);

    // Score title is restored to Original Piece
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Original Piece');
    });

    // Close history modal
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Editing History' })).toBeNull();
  });

  it('persists historyIndex across reloads', async () => {
    const mockDoc = {
      id: 'hist-persist-doc',
      name: 'Persist Test.abc',
      sourceType: 'abc' as const,
      abcSource: 'X:1\nT:Initial\nK:C\nC',
      revision: 1,
      annotations: [],
      chats: [],
      versions: [],
      scoreInfo: { title: 'Initial' },
      history: [
        {
          id: 'hist-1',
          revision: 1,
          timestamp: '2026-08-01T00:00:00.000Z',
          category: 'origin' as const,
          actionType: 'initial' as const,
          summary: 'Initial score: Initial',
          abcSource: 'X:1\nT:Initial\nK:C\nC',
          scoreInfo: { title: 'Initial' },
          annotations: [],
        },
        {
          id: 'hist-2',
          revision: 2,
          timestamp: '2026-08-01T00:01:00.000Z',
          category: 'metadata' as const,
          actionType: 'edit' as const,
          summary: 'Title → "Updated Title"',
          abcSource: 'X:1\nT:Updated Title\nK:C\nC',
          scoreInfo: { title: 'Updated Title' },
          annotations: [],
        },
      ],
      historyIndex: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };

    await storageAdapter.saveDocuments([mockDoc]);
    localStorage.setItem('chorale.workspace.activeFileId', 'hist-persist-doc');

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Initial');
    });

    const undoBtn = screen.getByRole('button', { name: 'Undo last edit' }) as HTMLButtonElement;
    const redoBtn = screen.getByRole('button', { name: 'Redo edit' }) as HTMLButtonElement;

    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(false);

    unmount();
  });
});
