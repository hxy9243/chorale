import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioPlayer } from '../AudioPlayer';
import abcjs from 'abcjs';

const mockSynthControl = {
  load: vi.fn(),
  setTune: vi.fn().mockResolvedValue(true),
  play: vi.fn(),
  pause: vi.fn(),
  restart: vi.fn(),
  seek: vi.fn(),
};

const mockCreateSynth = {
  init: vi.fn().mockResolvedValue(true),
};

vi.mock('abcjs', () => ({
  default: {
    parseOnly: vi.fn().mockImplementation((_abc: string) => [{
      getBpm: () => 120,
      getTotalBeats: () => 16,
      getBeatsPerMeasure: () => 4,
      getTotalTime: () => 8,
      setTiming: () => {},
    }]),
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
    getTotalBeats: vi.fn().mockReturnValue(16),
    getBeatsPerMeasure: vi.fn().mockReturnValue(4),
    getTotalTime: vi.fn().mockReturnValue(8),
    setTiming: vi.fn(),
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

  it('renders volume controls', () => {
    render(<AudioPlayer tunes={null} />);

    expect(screen.getByText('80%')).toBeDefined();
    expect(screen.getByText('/ --:--')).toBeDefined();
  });

  it('toggles mute state when mute button is clicked', () => {
    render(<AudioPlayer tunes={null} />);

    const muteBtn = screen.getByTitle('Mute');
    fireEvent.click(muteBtn);

    expect(screen.getByTitle('Unmute')).toBeDefined();
    expect(screen.getByText('0%')).toBeDefined();
  });

  it('initializes synth with base volume', async () => {
    const instanceControl = {
      ...mockSynthControl,
    };
    const synthApi = (abcjs as any).synth;
    vi.mocked(synthApi.SynthController).mockImplementationOnce(function () { return instanceControl; });

    render(<AudioPlayer tunes={[mockTune]} />);

    await waitFor(() => {
      expect(instanceControl.setTune).toHaveBeenLastCalledWith(mockTune, false, expect.any(Object));
      expect(instanceControl.setTune.mock.lastCall?.[2].soundFontVolumeMultiplier).toBeCloseTo(0.4);
    });
  });

  it('pauses and rewinds playback when stopped', async () => {
    render(<AudioPlayer tunes={[mockTune]} />);

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Stop & Reset'));

    expect(mockSynthControl.pause).toHaveBeenCalled();
    expect(mockSynthControl.restart).toHaveBeenCalledOnce();
  });

  it('shows live abcjs timing and seeks from the progress track', async () => {
    const onPlaybackPositionChange = vi.fn();
    render(
      <AudioPlayer
        tunes={[mockTune]}
        onPlaybackPositionChange={onPlaybackPositionChange}
      />,
    );

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    const cursorControl = mockSynthControl.load.mock.calls.at(-1)?.[1];
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    act(() => cursorControl.onBeat(30, 120, 120_000));

    expect(screen.getByText('0:30')).toBeDefined();
    expect(screen.getByText('/ 2:00')).toBeDefined();
    expect(onPlaybackPositionChange).toHaveBeenLastCalledWith({
      currentSeconds: 30,
      isPlaying: true,
    });

    const progress = screen.getByRole('button', { name: 'Seek playback' });
    vi.spyOn(progress, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 200,
    } as DOMRect);
    fireEvent.click(progress, { clientX: 100 });

    expect(mockSynthControl.seek).toHaveBeenCalledWith(0.5);
    expect(onPlaybackPositionChange).toHaveBeenLastCalledWith({
      currentSeconds: 60,
      isPlaying: true,
    });
  });

  it('draws a playback needle instead of bolding the active note', async () => {
    const { container, unmount } = render(
      <>
        <svg data-testid="score-svg">
          <g data-testid="playing-note" />
        </svg>
        <AudioPlayer tunes={[mockTune]} />
      </>,
    );

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    const cursorControl = mockSynthControl.load.mock.calls.at(-1)?.[1];
    const playingNote = screen.getByTestId('playing-note');

    act(() => cursorControl.onEvent({
      left: 42,
      top: 12,
      height: 36,
      elements: [[playingNote]],
    }));

    const needle = container.querySelector('.abcjs-playback-cursor');
    expect(playingNote.classList.contains('abcjs-highlight')).toBe(false);
    expect(needle?.tagName).toBe('line');
    expect(needle?.getAttribute('x1')).toBe('42');
    expect(needle?.getAttribute('x2')).toBe('42');
    expect(needle?.getAttribute('y1')).toBe('12');
    expect(needle?.getAttribute('y2')).toBe('48');

    act(() => cursorControl.onEvent({
      left: 64,
      top: 16,
      height: 40,
      elements: [[playingNote]],
    }));
    expect(container.querySelectorAll('.abcjs-playback-cursor')).toHaveLength(1);
    expect(needle?.getAttribute('x1')).toBe('64');
    expect(needle?.getAttribute('y2')).toBe('56');

    unmount();
    expect(document.querySelector('.abcjs-playback-cursor')).toBeNull();
  });

  it('seeks playback to the selected measure and beat', async () => {
    render(
      <AudioPlayer
        tunes={[mockTune]}
        activeAnchor={{ measure: 3, beat: 2, label: 'm. 3, beat 2' }}
      />,
    );

    await waitFor(() => {
      expect(mockSynthControl.seek).toHaveBeenCalledWith(9 / 16);
    });
    expect(screen.getByText('Selected m. 3, beat 2')).toBeDefined();
  });

  it('uses the anchor playback time when score selection resolves it', async () => {
    render(
      <AudioPlayer
        tunes={[mockTune]}
        activeAnchor={{ measure: 2, playbackSeconds: 2, label: 'm. 2' }}
      />,
    );

    await waitFor(() => {
      expect(mockSynthControl.seek).toHaveBeenCalledWith(2, 'seconds');
    });
  });

  it('uses normalized measure progress when absolute timing is unavailable', async () => {
    render(
      <AudioPlayer
        tunes={[mockTune]}
        activeAnchor={{ measure: 2, playbackFraction: 0.5, label: 'm. 2' }}
      />,
    );

    await waitFor(() => {
      expect(mockSynthControl.seek).toHaveBeenCalledWith(0.5);
    });
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
    expect(instanceControl.play).toHaveBeenCalledTimes(2);
  });

  it('seeks to activeAnchor when play toggle is hit', async () => {
    const instanceControl: any = {
      ...mockSynthControl,
      play: vi.fn(),
      seek: vi.fn(),
    };
    const synthApi = (abcjs as any).synth;
    vi.mocked(synthApi.SynthController).mockImplementationOnce(function () { return instanceControl; });

    render(
      <AudioPlayer
        tunes={[mockTune]}
        activeAnchor={{ measure: 3, playbackSeconds: 5, label: 'm. 3' }}
      />
    );

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());

    const playBtn = screen.getByTitle('Play Piano Synthesizer');
    fireEvent.click(playBtn);

    expect(instanceControl.seek).toHaveBeenCalledWith(5, 'seconds');
    expect(instanceControl.play).toHaveBeenCalledTimes(1);
  });
});
