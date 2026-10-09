import { StrictMode } from 'react';
import type { WaterfallPlayback } from '../../music/waterfallPlayback';
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
    synth: {
      isSupported: vi.fn().mockReturnValue(true),
      activeAudioContext: vi.fn().mockReturnValue(null),
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
    (abcjs as any).synth.activeAudioContext.mockReturnValue(null);
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

  it('shows the current and total measure count in a fixed transport slot', () => {
    render(<AudioPlayer tunes={[mockTune]} totalMeasures={12} />);

    expect(screen.getByLabelText('Current measure').textContent).toBe('m. — / 12');
    expect(screen.getByLabelText('Playback selection').textContent).toBe('No selection');
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
    expect(screen.getByLabelText('Current measure').textContent).toBe('m. 8 / 4');
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

    expect(mockSynthControl.seek).toHaveBeenCalledWith(60, 'seconds');
    expect(onPlaybackPositionChange).toHaveBeenLastCalledWith({
      currentSeconds: 60,
      isPlaying: true,
    });
  });

  it('draws a playback needle instead of bolding the active note', async () => {
    const onPlaybackSourceRangesChange = vi.fn();
    const { container, unmount } = render(
      <>
        <svg data-testid="score-svg">
          <g data-testid="playing-note" />
        </svg>
        <AudioPlayer tunes={[mockTune]} onPlaybackSourceRangesChange={onPlaybackSourceRangesChange} />
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
      startCharArray: [40, 84],
      endCharArray: [41, 86],
    }));

    expect(onPlaybackSourceRangesChange).toHaveBeenLastCalledWith({ starts: [40, 84], ends: [41, 86] });

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
        activeAnchor={{ startMeasure: 3, endMeasure: 3, beat: 2, label: 'm. 3, beat 2' }}
      />,
    );

    await waitFor(() => {
      expect(mockSynthControl.seek).toHaveBeenCalledWith(4.5, 'seconds');
    });
    expect(screen.getByText('Selected m. 3, beat 2')).toBeDefined();
  });

  it('uses the anchor playback time when score selection resolves it', async () => {
    render(
      <AudioPlayer
        tunes={[mockTune]}
        activeAnchor={{ startMeasure: 2, endMeasure: 2, playbackSeconds: 2, label: 'm. 2' }}
      />,
    );

    await waitFor(() => {
      expect(mockSynthControl.seek).toHaveBeenCalledWith(2, 'seconds');
    });
    expect(mockSynthControl.play).not.toHaveBeenCalled();
  });

  it('uses normalized measure progress when absolute timing is unavailable', async () => {
    render(
      <AudioPlayer
        tunes={[mockTune]}
        activeAnchor={{ startMeasure: 2, endMeasure: 2, playbackFraction: 0.5, label: 'm. 2' }}
      />,
    );

    await waitFor(() => {
      expect(mockSynthControl.seek).toHaveBeenCalledWith(4, 'seconds');
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
        activeAnchor={{ startMeasure: 3, endMeasure: 3, playbackSeconds: 5, label: 'm. 3' }}
      />
    );

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());

    const playBtn = screen.getByTitle('Play Piano Synthesizer');
    fireEvent.click(playBtn);

    expect(instanceControl.seek).toHaveBeenCalledWith(5, 'seconds');
    expect(instanceControl.play).toHaveBeenCalledTimes(1);
  });

  it('resets playing state to paused when switching to a different tune while playing', async () => {
    const tuneOne = { ...mockTune };
    const tuneTwo = { ...mockTune };
    const onPlaybackPositionChange = vi.fn();

    const { rerender } = render(
      <AudioPlayer
        tunes={[tuneOne]}
        onPlaybackPositionChange={onPlaybackPositionChange}
      />
    );

    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());

    const playBtn = screen.getByTitle('Play Piano Synthesizer');
    fireEvent.click(playBtn);
    expect(screen.getByTitle('Pause Audio')).toBeDefined();

    // Switch to tuneTwo
    rerender(
      <AudioPlayer
        tunes={[tuneTwo]}
        onPlaybackPositionChange={onPlaybackPositionChange}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTitle('Pause Audio')).toBeNull();
      expect(screen.getByTitle('Play Piano Synthesizer')).toBeDefined();
    });

    expect(onPlaybackPositionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ isPlaying: false })
    );
  });
  function installClockController() {
    const context = { currentTime: 100, state: 'running' };
    const buffer = {
      isRunning: false,
      startTimeSec: undefined as number | undefined,
      pausedTimeSec: undefined as number | undefined,
      millisecondsPerMeasure: 2000,
      meterSize: 1,
      duration: 8.2,
      fadeLength: 200,
    };
    const controller: any = {
      load: vi.fn(),
      setTune: vi.fn().mockResolvedValue(true),
      restart: vi.fn(),
      destroy: vi.fn(),
      midiBuffer: buffer,
      isStarted: false,
      play: vi.fn(() => {
        buffer.isRunning = true;
        buffer.startTimeSec = context.currentTime - (buffer.pausedTimeSec ?? 0);
        buffer.pausedTimeSec = undefined;
        controller.isStarted = true;
      }),
      pause: vi.fn(() => {
        if (buffer.isRunning) buffer.pausedTimeSec = context.currentTime - buffer.startTimeSec!;
        buffer.isRunning = false;
      }),
      seek: vi.fn((value: number, units?: string) => {
        buffer.pausedTimeSec = units === 'seconds' ? value : value * (buffer.duration - 0.2);
        // Deliberately reproduce abcjs's running-seek clock bug.
      }),
      setWarp: vi.fn(async (warp: number) => {
        buffer.millisecondsPerMeasure = 2000 / (warp / 100);
        buffer.duration = 8 / (warp / 100) + 0.2;
        buffer.startTimeSec = undefined;
        buffer.pausedTimeSec = undefined;
        controller.setTune.mock.lastCall[2].sequenceCallback([[{ pitch: 60, start: 0, end: 1, volume: 90 }]]);
      }),
    };
    const synth = (abcjs as any).synth;
    synth.activeAudioContext.mockReturnValue(context);
    synth.SynthController.mockImplementationOnce(function () { return controller; });
    return { controller, context, buffer };
  }

  it('publishes the existing preloader stream and replaces it with the actual audio note map', async () => {
    const { controller } = installClockController();
    (abcjs as any).synth.CreateSynth.mockImplementationOnce(function () {
      return {
        init: vi.fn().mockResolvedValue(true), millisecondsPerMeasure: 2000, meterSize: 1,
        flattened: { tracks: [[{ cmd: 'note', pitch: 60, start: 0.5, duration: 0.25, volume: 90 }]] },
      };
    });
    const onWaterfallPlaybackChange = vi.fn();
    render(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={onWaterfallPlaybackChange} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    expect(onWaterfallPlaybackChange.mock.lastCall?.[0].notes[0]).toMatchObject({ midiPitch: 60, onsetSeconds: 1, durationSeconds: 0.5 });
    act(() => controller.setTune.mock.lastCall[2].sequenceCallback([[{ pitch: 67, start: 0.165, end: 0.25, volume: 90 }]]));
    expect(onWaterfallPlaybackChange.mock.lastCall?.[0].notes[0]).toMatchObject({ midiPitch: 67, onsetSeconds: 0.33 });
    expect((abcjs as any).synth.CreateSynth).toHaveBeenCalledTimes(1);
  });

  it('samples exact audio time through play, selected-anchor resume, seek, stop, and finish', async () => {
    const { context, controller } = installClockController();
    let playback: WaterfallPlayback | null = null;
    render(<AudioPlayer tunes={[mockTune]} activeAnchor={{ startMeasure: 2, endMeasure: 2, playbackSeconds: 2 }}
      onWaterfallPlaybackChange={(value) => { playback = value; }} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    context.currentTime += 0.125;
    expect(playback!.getPosition()).toEqual({ currentSeconds: 2.125, isPlaying: true });
    fireEvent.click(screen.getByTitle('Pause Audio'));
    context.currentTime += 20;
    expect(playback!.getPosition()).toEqual({ currentSeconds: 2.125, isPlaying: false });
    const seeksBeforeResume = controller.seek.mock.calls.length;
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    expect(controller.seek).toHaveBeenCalledTimes(seeksBeforeResume);
    context.currentTime += 0.25;
    expect(playback!.getPosition()).toEqual({ currentSeconds: 2.375, isPlaying: true });
    const track = screen.getByRole('button', { name: 'Seek playback' });
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 } as DOMRect);
    fireEvent.click(track, { clientX: 100 });
    context.currentTime += 0.125;
    expect(playback!.getPosition()).toEqual({ currentSeconds: 4.125, isPlaying: true });
    fireEvent.click(screen.getByTitle('Stop & Reset'));
    expect(playback!.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
    act(() => controller.load.mock.lastCall[1].onFinished());
    expect(playback!.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
  });

  it('resumes notation timing at the exact paused audio position instead of the last beat', async () => {
    const { context, controller } = installClockController();
    render(<AudioPlayer tunes={[mockTune]} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    // abcjs saves controller.percent at beat callbacks and passes it to
    // TimingCallbacks.start on every resume, separately from the audio offset.
    controller.percent = 2 / 8;
    context.currentTime += 2.02;
    fireEvent.click(screen.getByTitle('Pause Audio'));
    expect(controller.percent).toBeCloseTo(2.02 / 8, 6);
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    context.currentTime += 0.01;
    fireEvent.click(screen.getByTitle('Pause Audio'));
    expect(controller.percent).toBeCloseTo(2.03 / 8, 6);
  });

  it('reinitializes correctly in StrictMode and clears obsolete getters on unmount', async () => {
    const onWaterfallPlaybackChange = vi.fn();
    const { unmount } = render(<StrictMode><AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={onWaterfallPlaybackChange} /></StrictMode>);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    expect((abcjs as any).synth.SynthController).toHaveBeenCalledTimes(2);
    const playback = onWaterfallPlaybackChange.mock.lastCall?.[0] as WaterfallPlayback;
    expect(playback).toBeTruthy();
    unmount();
    expect(onWaterfallPlaybackChange).toHaveBeenLastCalledWith(null);
    expect(playback.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
  });

  it('keeps audio and the stable getter alive when a consumer callback changes', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={first} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    const playback = first.mock.lastCall?.[0];
    rerender(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={second} onPlaybackPositionChange={() => {}} />);
    expect(second).toHaveBeenLastCalledWith(playback);
    expect((abcjs as any).synth.SynthController).toHaveBeenCalledTimes(1);
  });

  it('changes shared audio speed at the exact score position and keeps canonical note timing', async () => {
    const { context, controller } = installClockController();
    let playback: WaterfallPlayback | null = null;
    render(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={(value) => { playback = value; }} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    context.currentTime += 1.125;
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByTitle('Pause Audio')).toBeDefined());
    expect(controller.setWarp).toHaveBeenCalledWith(200);
    expect(playback!.notes[0].durationSeconds).toBe(2);
    expect(playback!.getPosition()).toEqual({ currentSeconds: 1.125, isPlaying: true });
    context.currentTime += 0.25;
    expect(playback!.getPosition()).toEqual({ currentSeconds: 1.625, isPlaying: true });
  });

  it('corrects the rounded notation tempo when the real synth becomes ready', async () => {
    const { controller, buffer } = installClockController();
    const timer = { qpm: 51, replaceTarget: vi.fn() };
    controller.timer = timer;
    buffer.millisecondsPerMeasure = 4 / 50.5 * 60_000;
    render(<AudioPlayer tunes={[mockTune]} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    act(() => controller.load.mock.lastCall[1].onReady());
    expect(timer.qpm).toBeCloseTo(50.5, 10);
    expect(timer.replaceTarget).toHaveBeenCalledWith(mockTune);
  });

  it('keeps an arbitrary initial seek exact when readiness rounds the last beat', async () => {
    const { controller, buffer } = installClockController();
    controller.seek.mockImplementation((seconds: number) => {
      buffer.pausedTimeSec = seconds;
      controller.percent = Math.floor(seconds * 32) / 32 / 8;
    });
    render(<AudioPlayer tunes={[mockTune]} activeAnchor={{ startMeasure: 1, endMeasure: 1, playbackSeconds: 1.137 }} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    act(() => controller.load.mock.lastCall[1].onReady());
    expect(controller.percent).toBeCloseTo(1.137 / 8, 10);
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    expect(controller.percent).toBeCloseTo(1.137 / 8, 10);
  });

  it.each([false, true])('preserves position and speed on a presentation-only rebind (paused: %s)', async (paused) => {
    const { controller, context } = installClockController();
    const changed = vi.fn();
    const { rerender } = render(<AudioPlayer tunes={[mockTune]} sourceKey="doc-one:original" onWaterfallPlaybackChange={changed} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    context.currentTime += 1.125;
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByTitle('Pause Audio')).toBeDefined());
    if (paused) fireEvent.click(screen.getByTitle('Pause Audio'));
    const playback = changed.mock.lastCall![0] as WaterfallPlayback;
    const pauseCalls = controller.pause.mock.calls.length;
    const replacement = { ...mockTune };
    rerender(<AudioPlayer tunes={[replacement]} sourceKey="doc-one:original" onWaterfallPlaybackChange={changed} />);
    expect(controller.visualObj).toBe(replacement);
    expect(controller.pause).toHaveBeenCalledTimes(pauseCalls);
    expect((abcjs as any).synth.SynthController).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('combobox', { name: 'Playback speed' }) as HTMLSelectElement).value).toBe('2');
    expect(playback.getPosition()).toEqual({ currentSeconds: 1.125, isPlaying: !paused });
    context.currentTime += 0.25;
    expect(playback.getPosition().currentSeconds).toBe(paused ? 1.125 : 1.625);
    // A different document must invalidate even identical source/tune objects.
    rerender(<AudioPlayer tunes={[mockTune]} sourceKey="doc-two:original" onWaterfallPlaybackChange={changed} />);
    await waitFor(() => expect((abcjs as any).synth.SynthController).toHaveBeenCalledTimes(2));
    expect(controller.destroy).toHaveBeenCalled();
    expect(playback.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
  });

  it.each([false, true])('replaces a real abcjs controller after a rejected speed rebuild (stopped: %s)', async (stopped) => {
    const realAbcjs = await vi.importActual<{ default: typeof abcjs }>('abcjs');
    const originalContext = (window as any).abcjsAudioContext;
    const context = { currentTime: 100, state: 'running', resume: vi.fn().mockResolvedValue(undefined) };
    (window as any).abcjsAudioContext = context;
    (abcjs as any).synth.activeAudioContext.mockReturnValue(context);
    const failed: any = new realAbcjs.default.synth.SynthController();
    failed.load = vi.fn((_element, callbacks) => { failed.cursorControl = callbacks; });
    const replacement = {
      ...mockSynthControl, setTune: vi.fn().mockResolvedValue(true), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
    };
    (abcjs as any).synth.SynthController
      .mockImplementationOnce(function () { return failed; })
      .mockImplementationOnce(function () { return replacement; });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const changed = vi.fn();
    const tune = { ...mockTune, millisecondsPerMeasure: () => 2000 };
    try {
      render(<AudioPlayer tunes={[tune]} activeAnchor={{ startMeasure: 1, endMeasure: 1, playbackSeconds: 0.5 }} onWaterfallPlaybackChange={changed} />);
      await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
      const buffer: any = {
        duration: 8.2, fadeLength: 200, isRunning: false, pausedTimeSec: 0,
        start: () => { buffer.startTimeSec = context.currentTime - buffer.pausedTimeSec; buffer.isRunning = true; },
        pause: () => { buffer.pausedTimeSec = context.currentTime - buffer.startTimeSec; buffer.isRunning = false; },
        stop: () => { buffer.isRunning = false; },
        seek: (seconds: number) => { buffer.pausedTimeSec = seconds; },
      };
      failed.midiBuffer = buffer;
      failed.timer = { lastMoment: 8000, pause: vi.fn(), start: vi.fn(), reset: vi.fn(), stop: vi.fn(), setProgress: vi.fn() };
      failed.isLoaded = true;
      await act(async () => { fireEvent.click(screen.getByTitle('Play Piano Synthesizer')); });
      context.currentTime += 1.125;
      let rejectResume!: (reason: Error) => void;
      context.resume.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectResume = reject; }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
      expect(failed.isLoading).toBe(true);
      expect(failed.timer).toBeNull();
      if (stopped) fireEvent.click(screen.getByTitle('Stop & Reset'));
      await act(async () => { rejectResume(new Error('AudioContext resume failed')); });
      await waitFor(() => expect(replacement.setTune).toHaveBeenCalled());
      expect(failed.isLoading).toBe(true); // The actual library leaves this poisoned.
      expect((screen.getByRole('combobox', { name: 'Playback speed' }) as HTMLSelectElement).value).toBe('1');
      expect(screen.getByText(/Playback is paused at 1×; try again/)).toBeDefined();
      expect(changed.mock.lastCall![0].getPosition()).toEqual({ currentSeconds: stopped ? 0 : 1.625, isPlaying: false });
      fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
      expect(replacement.play).toHaveBeenCalledOnce();
      expect(replacement.seek).toHaveBeenLastCalledWith(stopped ? 0 : 1.625, 'seconds');
      expect(screen.getByTitle('Pause Audio')).toBeDefined();
    } finally {
      (window as any).abcjsAudioContext = originalContext;
      errorLog.mockRestore();
    }
  });

  it('pauses an obsolete asynchronous play instead of restarting after Stop', async () => {
    const { controller, buffer } = installClockController();
    let finishPlay: (() => void) | undefined;
    controller.play.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishPlay = () => { buffer.isRunning = true; buffer.startTimeSec = 100; resolve(); };
    }));
    let playback: WaterfallPlayback | null = null;
    render(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={(value) => { playback = value; }} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    fireEvent.click(screen.getByTitle('Stop & Reset'));
    await act(async () => { finishPlay?.(); });
    expect(screen.getByTitle('Play Piano Synthesizer')).toBeDefined();
    expect(playback!.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
    expect(controller.isStarted).toBe(false);
  });

  it('keeps Stop at zero when an earlier speed rebuild finishes late', async () => {
    const { controller, context, buffer } = installClockController();
    let finishWarp: (() => void) | undefined;
    controller.setWarp.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishWarp = () => {
        buffer.duration = 4.2;
        controller.load.mock.lastCall[1].onReady();
        buffer.pausedTimeSec = 1; // abcjs restores the pre-rebuild progress internally.
        resolve();
      };
    }));
    let playback: WaterfallPlayback | null = null;
    render(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={(value) => { playback = value; }} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    context.currentTime += 2;
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
    fireEvent.click(screen.getByTitle('Stop & Reset'));
    await act(async () => { finishWarp?.(); });
    expect(playback!.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
    expect(controller.play).toHaveBeenCalledTimes(1);
  });

  it('clears old visual notes and invalidates their getter when a tune is removed', async () => {
    const { context } = installClockController();
    const changed = vi.fn();
    const { rerender } = render(<AudioPlayer tunes={[mockTune]} onWaterfallPlaybackChange={changed} />);
    await waitFor(() => expect(screen.getByText('Synth Ready')).toBeDefined());
    const playback = changed.mock.lastCall?.[0] as WaterfallPlayback;
    fireEvent.click(screen.getByTitle('Play Piano Synthesizer'));
    context.currentTime += 1;
    expect(playback.getPosition().isPlaying).toBe(true);
    rerender(<AudioPlayer tunes={null} onWaterfallPlaybackChange={changed} />);
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(playback.getPosition()).toEqual({ currentSeconds: 0, isPlaying: false });
  });

});
