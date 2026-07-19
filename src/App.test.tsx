import { render, screen, waitFor } from '@testing-library/react';
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
      SynthController: vi.fn().mockImplementation(() => ({
        load: vi.fn(),
        setTune: vi.fn().mockResolvedValue(true),
        play: vi.fn(),
        pause: vi.fn(),
      })),
      CreateSynth: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(true),
      })),
    },
  },
}));

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
        text: () => Promise.resolve(''),
      } as Response);
    });
  });

  it('renders application header, file uploader, sheet music, and ABC editor', async () => {
    render(<App />);

    expect(screen.getByText('Chorale Player')).toBeDefined();
    expect(screen.getByText('MusicXML Source')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('sheet-svg')).toBeDefined();
      expect(screen.getByPlaceholderText(/Parsed ABC code will appear here/)).toBeDefined();
    });
  });
});
