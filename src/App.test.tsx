import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('allows selecting preset samples from the file rail', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    const sampleButton = screen.getAllByText('Twinkle, Twinkle, Little Star')[0];
    fireEvent.click(sampleButton);

    await waitFor(() => {
      expect(screen.getAllByText(/Twinkle, Twinkle, Little Star/).length).toBeGreaterThan(0);
    });
  });

  it('supports active file switching in the session model', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    const sample2 = screen.getAllByText('Moonlight Sonata (MusicXML)')[0];
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
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
    });

    const sampleBtn = screen.getAllByText('Twinkle, Twinkle, Little Star')[0];
    fireEvent.click(sampleBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/Delete Twinkle, Twinkle, Little Star/)).toBeDefined();
    });

    const deleteBtn = screen.getByLabelText(/Delete Twinkle, Twinkle, Little Star/);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Delete Twinkle, Twinkle, Little Star/)).toBeNull();
    });
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
