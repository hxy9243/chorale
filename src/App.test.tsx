import { render, screen, waitFor, fireEvent, createEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import abcjs from 'abcjs';
import App, {
  CHAT_OPEN_KEY,
  CHAT_WIDTH_KEY,
  EDITOR_WIDTH_KEY,
  FILE_RAIL_WIDTH_KEY,
  SHEET_ZOOM_KEY,
} from './App';
import * as xmlParser from './utils/xmlParser';
import { defaultFileRailWidth } from './utils/workspaceSizing';

vi.mock('abcjs', () => ({
  default: {
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

    expect(screen.getByRole('banner').textContent).toContain('Chorale');
    expect(screen.getByText('Import score')).toBeDefined();
    expect(screen.getByRole('tabpanel', { name: 'Files' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Tools' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC display' }));
    expect(screen.getByPlaceholderText(/Parsed ABC code will appear here/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close ABC editor' }));
    expect(screen.queryByPlaceholderText(/Parsed ABC code will appear here/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeDefined();
  });

  it('reorders persisted files through the drag-and-drop rail contract', async () => {
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([
      {
        id: 'drag-one',
        name: 'First.abc',
        sourceType: 'abc',
        abcSource: 'X:1\nT:First\nK:C\nCDEF|',
        revision: 1,
        versions: [],
        scoreInfo: { title: 'First' },
      },
      {
        id: 'drag-two',
        name: 'Second.abc',
        sourceType: 'abc',
        abcSource: 'X:1\nT:Second\nK:C\nGABc|',
        revision: 1,
        versions: [],
        scoreInfo: { title: 'Second' },
      },
    ]));
    localStorage.setItem('chorale.workspace.activeFileId', 'drag-one');
    render(<App />);

    const source = screen.getByRole('button', { name: 'Open First' });
    const target = screen.getByRole('button', { name: 'Open Second' }).closest<HTMLElement>('.file-item')!;
    const fileList = target.closest<HTMLElement>('.file-list')!;
    const rows = [...fileList.querySelectorAll<HTMLElement>('.file-item')];
    rows.forEach((row) => {
      row.getBoundingClientRect = () => {
        const index = [...fileList.querySelectorAll('.file-item')].indexOf(row);
        const top = 100 + index * 72;
        return {
          top,
          bottom: top + 64,
          left: 0,
          right: 240,
          width: 240,
          height: 64,
          x: 0,
          y: top,
        } as DOMRect;
      };
    });
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      setDragImage: vi.fn(),
      getData: vi.fn(() => 'drag-one'),
    };
    const dragStart = createEvent.dragStart(source, { dataTransfer });
    Object.defineProperty(dragStart, 'clientY', { value: 132 });
    const dragOver = createEvent.dragOver(target, { dataTransfer });
    Object.defineProperty(dragOver, 'clientY', { value: 220 });
    const drop = createEvent.drop(target, { dataTransfer });
    Object.defineProperty(drop, 'clientY', { value: 220 });

    fireEvent(source, dragStart);
    fireEvent(target, dragOver);
    fireEvent(target, drop);

    await waitFor(() => {
      const names = [...document.querySelectorAll('.file-item-name')]
        .map((element) => element.textContent);
      expect(names).toEqual(['Second', 'First']);
    });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('chorale.workspace.documents') || '[]');
      expect(saved.map((document: { id: string }) => document.id)).toEqual(['drag-two', 'drag-one']);
    });
  });

  it('normalizes unsupported ABC before both visible and validation rendering', async () => {
    const abcSource = 'X:1\nT:Tuplet rest\nL:1/4\nM:2/4\nK:C\n(3x/C/E/ C |';
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([{
      id: 'tuplet-rest',
      name: 'tuplet-rest.abc',
      sourceType: 'abc',
      abcSource,
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Tuplet rest' },
    }]));
    localStorage.setItem('chorale.workspace.activeFileId', 'tuplet-rest');

    render(<App />);

    await waitFor(() => {
      const renderedSources = vi.mocked(abcjs.renderAbc).mock.calls
        .map((call) => call[1] as string)
        .filter((source) => source.includes('T:Tuplet rest'));
      expect(renderedSources).toHaveLength(2);
      expect(renderedSources.every((source) => source.includes('(3z/C/E/'))).toBe(true);
      expect(renderedSources.every((source) => !source.includes('(3x/C/E/'))).toBe(true);
    });
  });



  it('supports active file switching in the session model', async () => {
    const doc1 = {
      id: 'doc-1',
      name: 'Twinkle, Twinkle, Little Star.xml',
      sourceType: 'musicxml',
      abcSource: 'X:1\nT:Twinkle, Twinkle, Little Star\nK:C\nCCGG',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional' },
    };
    const doc2 = {
      id: 'doc-2',
      name: 'Moonlight Sonata.xml',
      sourceType: 'musicxml',
      abcSource: 'X:1\nT:Moonlight Sonata\nK:C#m\nCDEF',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Moonlight Sonata', composer: 'Beethoven' },
    };
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([doc1, doc2]));
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

  it('keeps a persistent control for reopening chat after it is closed', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    fireEvent.click(screen.getByTitle('Close assistant'));
    expect(screen.queryByLabelText('Current sheet assistant')).toBeNull();

    fireEvent.click(screen.getByTitle('Show score chat'));
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
    expect(workspace.style.gridTemplateColumns).toContain('320px');
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
    fireEvent.click(screen.getByTitle('Show score chat'));
    expect(screen.getByLabelText('Current sheet assistant')).toBeDefined();
    const workspace = document.querySelector<HTMLElement>('.workspace-body')!;
    expect(workspace.style.gridTemplateColumns).toContain('320px');
    await waitFor(() => expect(localStorage.getItem(CHAT_OPEN_KEY)).toBe('true'));

    fireEvent.click(screen.getByTitle('Close assistant'));
    await waitFor(() => expect(localStorage.getItem(CHAT_OPEN_KEY)).toBe('false'));
    expect(localStorage.getItem(CHAT_WIDTH_KEY)).toBe('320');
    unmount();

    render(<App />);
    expect(screen.queryByLabelText('Current sheet assistant')).toBeNull();
    fireEvent.click(screen.getByTitle('Show score chat'));
    expect(document.querySelector<HTMLElement>('.workspace-body')!.style.gridTemplateColumns)
      .toContain('320px');
  });

  it('allows deleting files from the file rail', async () => {
    const doc1 = {
      id: 'doc-1',
      name: 'Twinkle, Twinkle, Little Star.xml',
      sourceType: 'musicxml',
      abcSource: 'X:1\nT:Twinkle, Twinkle, Little Star\nK:C\nCCGG',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional' },
    };
    const doc2 = {
      id: 'doc-2',
      name: 'Moonlight Sonata.xml',
      sourceType: 'musicxml',
      abcSource: 'X:1\nT:Moonlight Sonata\nK:C#m\nCDEF',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Moonlight Sonata', composer: 'Beethoven' },
    };
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([doc1, doc2]));
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
      sourceType: 'abc',
      abcSource: 'X:1\nT:Persisted Score\nK:C\nCDEF',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Persisted Score' },
    };
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([mockDoc]));
    localStorage.setItem('chorale.workspace.activeFileId', 'stored-doc-123');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'ABC display' }));
    const editor = screen.getByPlaceholderText(/Parsed ABC code will appear here/);

    for (let edit = 1; edit <= 8; edit += 1) {
      fireEvent.change(editor, {
        target: { value: `X:1\nT:Persisted Score\nK:C\nCDEF % edit ${edit}` },
      });
    }

    const documentWrites = () => setItemSpy.mock.calls.filter(
      ([key]) => key === 'chorale.workspace.documents',
    );
    expect(documentWrites()).toHaveLength(0);

    await waitFor(() => expect(documentWrites()).toHaveLength(1), { timeout: 1200 });
    const savedDocuments = JSON.parse(String(documentWrites()[0][1]));
    expect(savedDocuments[0].abcSource).toContain('% edit 8');

    setItemSpy.mockRestore();
  });

  it('surfaces localStorage quota failures under the score title', async () => {
    const mockDoc = {
      id: 'stored-doc-123',
      name: 'Persisted Score.abc',
      sourceType: 'abc',
      abcSource: 'X:1\nT:Persisted Score\nK:C\nCDEF',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Persisted Score' },
    };
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([mockDoc]));
    localStorage.setItem('chorale.workspace.activeFileId', 'stored-doc-123');

    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === 'chorale.workspace.documents') {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Save failed');
    }, { timeout: 1200 });

    setItemSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('restores the active file and documents from localStorage on page refresh', async () => {
    const mockDoc = {
      id: 'stored-doc-123',
      name: 'Persisted Score.abc',
      sourceType: 'abc',
      abcSource: 'X:1\nT:Persisted Score\nK:C\nCDEF',
      revision: 1,
      versions: [],
      scoreInfo: { title: 'Persisted Score', composer: 'Anon', key: 'C', meter: '4/4', tempoText: '120', measures: 4 },
      activeAnchor: null,
    };
    localStorage.setItem('chorale.workspace.documents', JSON.stringify([mockDoc]));
    localStorage.setItem('chorale.workspace.activeFileId', 'stored-doc-123');

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Persisted Score').length).toBeGreaterThan(0);
    });
  });
});
