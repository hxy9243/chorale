import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioPlayer } from '../AudioPlayer';
import abcjs from 'abcjs';

const mockSynthControl = {
  load: vi.fn(),
  setTune: vi.fn().mockResolvedValue(true),
  play: vi.fn(),
  pause: vi.fn(),
  restart: vi.fn(),
};

const mockCreateSynth = {
  init: vi.fn().mockResolvedValue(true),
};

vi.mock('abcjs', () => ({
  default: {
    synth: {
      isSupported: vi.fn().mockReturnValue(true),
      SynthController: vi.fn(function () { return mockSynthControl; }),
      CreateSynth: vi.fn(function () { return mockCreateSynth; }),
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

  it('initializes synth with base volume and calls setWarp on tempo changes', async () => {
    const instanceControl = {
      ...mockSynthControl,
      setWarp: vi.fn(),
    };
    const synthApi = (abcjs as any).synth;
    vi.mocked(synthApi.SynthController).mockImplementationOnce(function () { return instanceControl; });

    render(<AudioPlayer tunes={[mockTune]} />);

    await waitFor(() => {
      expect(instanceControl.setTune).toHaveBeenLastCalledWith(mockTune, false, expect.any(Object));
      expect(instanceControl.setTune.mock.lastCall?.[2].soundFontVolumeMultiplier).toBeCloseTo(0.4);
    });

    const tempoSlider = screen.getAllByRole('slider')[0];
    fireEvent.change(tempoSlider, { target: { value: '140' } });

    await waitFor(() => {
      expect(instanceControl.setWarp).toHaveBeenCalledWith(140);
    });
  });

  it('pauses and rewinds playback when stopped', async () => {
    render(<AudioPlayer tunes={[mockTune]} />);

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Stop & Reset'));

    expect(mockSynthControl.pause).toHaveBeenCalled();
    expect(mockSynthControl.restart).toHaveBeenCalledOnce();
  });

  it('ignores an obsolete synth initialization that finishes late', async () => {
    let resolveFirstInit: (() => void) | undefined;
    const firstInit = new Promise<void>((resolve) => {
      resolveFirstInit = resolve;
    });
    const firstControl = {
      ...mockSynthControl,
      setTune: vi.fn().mockResolvedValue(true),
      pause: vi.fn(),
    };
    const secondControl = {
      ...mockSynthControl,
      setTune: vi.fn().mockResolvedValue(true),
      pause: vi.fn(),
    };
    const synthApi = (abcjs as any).synth;

    vi.mocked(synthApi.SynthController)
      .mockImplementationOnce(function () { return firstControl; })
      .mockImplementationOnce(function () { return secondControl; });
    vi.mocked(synthApi.CreateSynth)
      .mockImplementationOnce(function () { return { init: vi.fn(() => firstInit) }; })
      .mockImplementationOnce(function () { return { init: vi.fn().mockResolvedValue(true) }; });

    const firstTune = { getBpm: vi.fn().mockReturnValue(100) } as any;
    const secondTune = { getBpm: vi.fn().mockReturnValue(140) } as any;
    const { rerender } = render(<AudioPlayer tunes={[firstTune]} />);

    await waitFor(() => expect(synthApi.CreateSynth).toHaveBeenCalledTimes(1));
    rerender(<AudioPlayer tunes={[secondTune]} />);
    await waitFor(() => expect(secondControl.setTune).toHaveBeenCalledWith(
      secondTune,
      false,
      expect.any(Object),
    ));

    resolveFirstInit?.();
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());

    expect(firstControl.pause).toHaveBeenCalled();
    expect(firstControl.setTune).not.toHaveBeenCalled();
    expect(secondControl.setTune).toHaveBeenCalledOnce();
  });

  it('resets internal isStarted flag on pause so subsequent play click works immediately', async () => {
    const instanceControl: any = {
      ...mockSynthControl,
      isStarted: true,
      play: vi.fn(),
      pause: vi.fn(),
    };
    const synthApi = (abcjs as any).synth;
    vi.mocked(synthApi.SynthController).mockImplementationOnce(function () { return instanceControl; });

    render(<AudioPlayer tunes={[mockTune]} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());

    // Play -> Pause -> Play
    const playBtn = screen.getByTitle('Play Piano Synthesizer');
    fireEvent.click(playBtn);
    expect(instanceControl.play).toHaveBeenCalledTimes(1);

    const pauseBtn = screen.getByTitle('Pause Audio');
    fireEvent.click(pauseBtn);
    expect(instanceControl.pause).toHaveBeenCalledTimes(1);
    expect(instanceControl.isStarted).toBe(false);

    const replayBtn = screen.getByTitle('Play Piano Synthesizer');
    fireEvent.click(replayBtn);
    expect(instanceControl.isStarted).toBe(false); // reset prior to call
    expect(instanceControl.play).toHaveBeenCalledTimes(2);
  });
});
