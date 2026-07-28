import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Play, Pause, Square, Volume2, VolumeX, Music2 } from 'lucide-react';

import type { ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';
import type { PlaybackPosition } from '../utils/repeatPlayback';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PLAYBACK_CURSOR_SELECTOR = '.abcjs-playback-cursor';

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const removePlaybackCursor = () => {
  document.querySelectorAll(PLAYBACK_CURSOR_SELECTOR).forEach((element) => element.remove());
  document.querySelectorAll('.abcjs-highlight').forEach((element) => {
    element.classList.remove('abcjs-highlight');
  });
};

const updatePlaybackCursor = (event: abcjs.NoteTimingEvent) => {
  const eventElements = event.elements?.flat() || [];
  const scoreElement = eventElements.find((element) => (
    Boolean((element as unknown as SVGElement).ownerSVGElement)
  )) as unknown as SVGElement | undefined;
  const svg = scoreElement?.ownerSVGElement
    || document.querySelector<SVGSVGElement>('#paper svg');
  if (!svg || !isFiniteNumber(event.left) || !isFiniteNumber(event.top) || !isFiniteNumber(event.height)) {
    return;
  }

  document.querySelectorAll('.abcjs-highlight').forEach((element) => {
    element.classList.remove('abcjs-highlight');
  });

  let cursor = svg.querySelector<SVGLineElement>(PLAYBACK_CURSOR_SELECTOR);
  if (!cursor) {
    removePlaybackCursor();
    cursor = document.createElementNS(SVG_NAMESPACE, 'line');
    cursor.classList.add('abcjs-playback-cursor');
    cursor.setAttribute('aria-hidden', 'true');
    svg.appendChild(cursor);
  }

  cursor.setAttribute('x1', String(event.left));
  cursor.setAttribute('x2', String(event.left));
  cursor.setAttribute('y1', String(event.top));
  cursor.setAttribute('y2', String(event.top + event.height));
};

interface AudioPlayerProps {
  tunes: abcjs.TuneObject[] | null;
  activeAnchor?: ScoreAnchor | null;
  onPlaybackPositionChange?: (position: PlaybackPosition) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  tunes,
  activeAnchor,
  onPlaybackPositionChange,
}) => {

  const soundFontBaseVolume = 0.4;
  const synthControllerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const playbackProgressRef = useRef(0);
  const totalDurationMsRef = useRef(0);
  const isPlayingRef = useRef(false);

  const audioContainerRef = useRef<HTMLDivElement>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const effectiveVolume = isMuted ? 0 : volume;

  const updatePlaybackPosition = React.useCallback((next: {
    progress?: number;
    durationMs?: number;
    playing?: boolean;
  }) => {
    const progress = next.progress ?? playbackProgressRef.current;
    const durationMs = next.durationMs ?? totalDurationMsRef.current;
    const playing = next.playing ?? isPlayingRef.current;

    playbackProgressRef.current = progress;
    totalDurationMsRef.current = durationMs;
    isPlayingRef.current = playing;
    setPlaybackProgress(progress);
    setTotalDurationMs(durationMs);
    setIsPlaying(playing);
    onPlaybackPositionChange?.({
      currentSeconds: durationMs > 0 ? progress * durationMs / 1000 : 0,
      isPlaying: playing,
    });
  }, [onPlaybackPositionChange]);

  // Master volume control using WebAudio GainNode
  useEffect(() => {
    const synthApi = (abcjs as any).synth;
    if (!synthApi || typeof synthApi.activeAudioContext !== 'function') return;

    try {
      const audioCtx = synthApi.activeAudioContext();
      if (!audioCtx || typeof audioCtx.createGain !== 'function') return;

      if (!masterGainRef.current || masterGainRef.current.context !== audioCtx) {
        const gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);

        const originalConnect = AudioNode.prototype.connect;
        (AudioNode.prototype as any).connect = function (this: AudioNode, destination: any, output?: number, input?: number) {
          if (destination === audioCtx.destination) {
            return (originalConnect as any).call(this, gainNode, output, input);
          }
          return (originalConnect as any).call(this, destination, output, input);
        };

        masterGainRef.current = gainNode;
      }

      masterGainRef.current?.gain.setValueAtTime(effectiveVolume, audioCtx.currentTime);
    } catch (err) {
      console.error('Error setting master volume gain:', err);
    }
  }, [effectiveVolume]);

  const lastInitTuneRef = useRef<abcjs.TuneObject | null>(null);

  // Primary synth initialization on tune change
  useEffect(() => {
    const currentTune = tunes?.[0] || null;
    removePlaybackCursor();
    if (!currentTune) {
      setIsReady(false);
      updatePlaybackPosition({ progress: 0, durationMs: 0, playing: false });
      lastInitTuneRef.current = null;
      return;
    }

    if (lastInitTuneRef.current === currentTune) {
      return;
    }
    lastInitTuneRef.current = currentTune;

    const synthApi = (abcjs as any).synth;
    if (!synthApi || (synthApi.isSupported && !synthApi.isSupported())) {
      setAudioError('WebAudio is not supported in this browser environment.');
      return;
    }

    let synthControl: any;
    let cancelled = false;

    const initSynth = async () => {
      try {
        setAudioError(null);
        setIsReady(false);

        // Create audio synth controller
        synthControl = new synthApi.SynthController();
        synthControllerRef.current = synthControl;

        if (audioContainerRef.current) {
          audioContainerRef.current.innerHTML = '';
          synthControl.load(
            audioContainerRef.current,
            {
              onEvent: (event: abcjs.NoteTimingEvent) => {
                if (event) updatePlaybackCursor(event);
              },
              onBeat: (beatNumber: number, totalBeats: number, totalTime: number) => {
                updatePlaybackPosition({
                  progress: totalBeats > 0 ? beatNumber / totalBeats : 0,
                  durationMs: totalTime,
                });
              },
              onFinished: () => {
                updatePlaybackPosition({ progress: 0, playing: false });
                if (synthControllerRef.current) {
                  synthControllerRef.current.isStarted = false;
                }
                removePlaybackCursor();
              },
            },
            {
              displayLoop: true,
              displayRestart: true,
              displayPlay: true,
              displayProgress: true,
              displayWarp: false,
            }
          );
        }

        const createSynth = new synthApi.CreateSynth();
        try {
          await createSynth.init({
            visualObj: currentTune,
            options: {
              soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
              soundFontVolumeMultiplier: soundFontBaseVolume,
              pan: [0],
            },
          });
        } catch (sfErr) {
          console.warn('SoundFont remote init failed, using built-in synth:', sfErr);
          await createSynth.init({
            visualObj: currentTune,
            options: {
              soundFontVolumeMultiplier: soundFontBaseVolume,
            },
          });
        }

        if (cancelled) return;

        try {
          await synthControl.setTune(currentTune, false, {
            chordsOff: false,
            soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
            soundFontVolumeMultiplier: soundFontBaseVolume,
          });
        } catch (sfErr) {
          console.warn('SoundFont setTune failed, using built-in synth:', sfErr);
          await synthControl.setTune(currentTune, false, {
            chordsOff: false,
            soundFontVolumeMultiplier: soundFontBaseVolume,
          });
        }

        if (cancelled) return;
        const totalTime = currentTune.getTotalTime?.();
        if (Number.isFinite(totalTime) && totalTime > 0) {
          updatePlaybackPosition({ durationMs: totalTime * 1000 });
        }
        setIsReady(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Error initializing audio synth:', err);
        setAudioError('Could not initialize audio synthesizer.');
      }
    };

    initSynth();

    return () => {
      cancelled = true;
      if (synthControl) {
        try {
          synthControl.pause();
          synthControl.isStarted = false;
        } catch {}
      }
      if (synthControllerRef.current === synthControl) {
        synthControllerRef.current = null;
      }
      removePlaybackCursor();
    };
  }, [tunes, updatePlaybackPosition]);

  const applyAnchorSeek = React.useCallback((anchor: ScoreAnchor) => {
    const tune = tunes?.[0];
    if (!synthControllerRef.current || !tune) return;

    if (anchor.playbackSeconds !== undefined) {
      synthControllerRef.current.seek?.(anchor.playbackSeconds, 'seconds');
      const totalTime = tune.getTotalTime?.() || 0;
      if (totalTime > 0) {
        updatePlaybackPosition({
          progress: Math.max(0, Math.min(1, anchor.playbackSeconds / totalTime)),
        });
      }
      return;
    }

    if (anchor.playbackFraction !== undefined) {
      const percent = Math.max(0, Math.min(1, anchor.playbackFraction));
      synthControllerRef.current.seek?.(percent);
      updatePlaybackPosition({ progress: percent });
      return;
    }

    const totalBeats = tune.getTotalBeats?.() || 0;
    const beatsPerMeasure = tune.getBeatsPerMeasure?.() || 0;
    if (totalBeats > 0 && beatsPerMeasure > 0) {
      const selectedBeat = Math.max(0, (anchor.measure - 1) * beatsPerMeasure + (anchor.beat || 1) - 1);
      const percent = Math.max(0, Math.min(1, selectedBeat / totalBeats));
      synthControllerRef.current.seek?.(percent);
      updatePlaybackPosition({ progress: percent });
    }
  }, [tunes, updatePlaybackPosition]);

  useEffect(() => {
    if (!isReady || !activeAnchor) return;
    applyAnchorSeek(activeAnchor);
  }, [activeAnchor, applyAnchorSeek, isReady]);

  const handlePlayToggle = async () => {
    if (!synthControllerRef.current) return;
    const synthControl = synthControllerRef.current;

    const synthApi = (abcjs as any).synth;
    if (synthApi && typeof synthApi.activeAudioContext === 'function') {
      try {
        const audioCtx = synthApi.activeAudioContext();
        if (audioCtx && audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
      } catch {}
    }

    if (isPlaying) {
      synthControl.pause();
      synthControl.isStarted = false;
      updatePlaybackPosition({ playing: false });
    } else {
      const currentAnchor = activeAnchor;
      const currentProgress = playbackProgress;

      updatePlaybackPosition({ playing: true });
      const playPromise = synthControl.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }

      if (currentAnchor) {
        applyAnchorSeek(currentAnchor);
      } else if (currentProgress > 0) {
        synthControl.seek?.(currentProgress);
      }
    }
  };

  const handleStop = () => {
    if (!synthControllerRef.current) return;
    synthControllerRef.current.pause();
    synthControllerRef.current.restart?.();
    synthControllerRef.current.isStarted = false;
    synthControllerRef.current.seek?.(0);
    updatePlaybackPosition({ progress: 0, playing: false });
    removePlaybackCursor();
  };

  const handleSeekTrackClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!synthControllerRef.current || !isReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clickRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

    updatePlaybackPosition({ progress: clickRatio });
    synthControllerRef.current.seek?.(clickRatio);
  };

  const formatTime = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentMs = playbackProgress * totalDurationMs;

  return (
    <div className="audio-player-card glass-panel">
      <div className="player-header">
        <h3 className="section-title">
          <Music2 className="w-4 h-4 inline mr-2 text-emerald-400" />
          Piano Audio Synthesizer
        </h3>
        {audioError ? (
          <span className="status-pill error">{audioError}</span>
        ) : !tunes ? (
          <span className="status-pill loading">No Score Loaded</span>
        ) : !isReady ? (
          <span className="status-pill loading">Buffering Audio...</span>
        ) : (
          <span className="status-pill ready">Synth Ready</span>
        )}
      </div>

      <div ref={audioContainerRef} className="abcjs-synth-container hidden-synth" />

      <div className="player-controls-bar">
        <div className="main-play-buttons">
          <button
            className={`btn btn-primary btn-circle ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handlePlayToggle}
            disabled={!isReady}
            title={isPlaying ? 'Pause Audio' : 'Play Piano Synthesizer'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            className="btn btn-secondary btn-circle"
            onClick={handleStop}
            disabled={!isReady && !isPlaying}
            title="Stop & Reset"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          <div className="playback-progress" aria-label="Playback position">
            <div>
              <strong>{formatTime(currentMs)}</strong>
              <span>/ {totalDurationMs > 0 ? formatTime(totalDurationMs) : '--:--'}</span>
            </div>
            <button
              type="button"
              className="playback-progress-track"
              onClick={handleSeekTrackClick}
              aria-label="Seek playback"
              disabled={!isReady}
            >
              <span style={{ width: `${playbackProgress * 100}%` }} />
            </button>
          </div>
          {activeAnchor && (
            <div className="playback-loop-pill">
              <span>Selected {formatAnchorLabel(activeAnchor)}</span>
            </div>
          )}
        </div>

        <div className="control-slider-group">
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="audio-slider"
          />
          <span className="slider-value">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
        </div>
      </div>
    </div>
  );
};
