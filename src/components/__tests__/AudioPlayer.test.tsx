import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioPlayer } from '../AudioPlayer';

const mockSynthControl = {
  load: vi.fn(),
  setTune: vi.fn().mockResolvedValue(true),
  play: vi.fn(),
  pause: vi.fn(),
};

const mockCreateSynth = {
  init: vi.fn().mockResolvedValue(true),
};

vi.mock('abcjs', () => ({
  default: {
    synth: {
      isSupported: vi.fn().mockReturnValue(true),
      SynthController: vi.fn().mockImplementation(() => mockSynthControl),
      CreateSynth: vi.fn().mockImplementation(() => mockCreateSynth),
    },
  },
}));

describe('AudioPlayer Component', () => {
  const mockTune = {
    getBpm: vi.fn().mockReturnValue(120),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays "No Score Loaded" status when tunes prop is null', () => {
    render(<AudioPlayer tunes={null} />);

    expect(screen.getByText('Piano Audio Synthesizer')).toBeDefined();
    expect(screen.getByText('No Score Loaded')).toBeDefined();
  });

  it('initializes audio synth when tunes prop is provided', async () => {
    render(<AudioPlayer tunes={[mockTune]} />);

    expect(screen.getByText('Buffering Audio...')).toBeDefined();
  });

  it('renders tempo and volume controls', () => {
    render(<AudioPlayer tunes={null} />);

    expect(screen.getByText('Tempo:')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText('80%')).toBeDefined();
  });

  it('updates tempo slider state on change', () => {
    render(<AudioPlayer tunes={null} />);

    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    const tempoSlider = sliders[0];

    fireEvent.change(tempoSlider, { target: { value: '140' } });
    expect(screen.getByText('140%')).toBeDefined();
  });

  it('toggles mute state when mute button is clicked', () => {
    render(<AudioPlayer tunes={null} />);

    const muteBtn = screen.getByTitle('Mute');
    fireEvent.click(muteBtn);

    expect(screen.getByTitle('Unmute')).toBeDefined();
    expect(screen.getByText('0%')).toBeDefined();
  });
});
