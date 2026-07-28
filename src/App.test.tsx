import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import abcjs from 'abcjs';
import App from './App';
import * as xmlParser from './utils/xmlParser';

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
    expect(screen.getByText('FILES')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'ABC code' }));
    expect(screen.getByPlaceholderText(/Parsed ABC code will appear here/)).toBeDefined();
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
    fireEvent.click(screen.getByRole('button', { name: 'ABC code' }));
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

  it('surfaces localStorage quota failures in the header', async () => {
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
      expect(screen.getByRole('status').textContent).toBe('Save failed');
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
