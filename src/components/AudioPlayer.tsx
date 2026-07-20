import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Play, Pause, Square, Volume2, VolumeX, Gauge, Music2 } from 'lucide-react';

interface AudioPlayerProps {
  tunes: abcjs.TuneObject[] | null;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ tunes }) => {
  const soundFontBaseVolume = 0.4;
  const synthControllerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [tempo, setTempo] = useState<number>(100); // % of default tempo
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const audioContainerRef = useRef<HTMLDivElement>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const isTempoInitialMount = useRef<boolean>(true);
  const tempoRef = useRef<number>(tempo);
  tempoRef.current = tempo;
  const effectiveVolume = isMuted ? 0 : volume;

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

  // Tempo adjustment using setWarp
  useEffect(() => {
    if (isTempoInitialMount.current) {
      isTempoInitialMount.current = false;
      return;
    }
    if (synthControllerRef.current && typeof synthControllerRef.current.setWarp === 'function') {
      synthControllerRef.current.setWarp(tempo);
    }
  }, [tempo]);

  // Primary synth initialization on tune change
  useEffect(() => {
    if (!tunes || tunes.length === 0) {
      setIsReady(false);
      setIsPlaying(false);
      return;
    }

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
              onEvent: (event: any) => {
                if (event && event.elements) {
                  // Highlight active note elements in SVG score
                  document.querySelectorAll('.abcjs-highlight').forEach((el) => el.classList.remove('abcjs-highlight'));
                  event.elements.forEach((group: any[]) => {
                    group.forEach((el: Element) => el.classList.add('abcjs-highlight'));
                  });
                }
              },
              onFinished: () => {
                setIsPlaying(false);
                if (synthControllerRef.current) {
                  synthControllerRef.current.isStarted = false;
                }
                document.querySelectorAll('.abcjs-highlight').forEach((el) => el.classList.remove('abcjs-highlight'));
              },
            },
            {
              displayLoop: true,
              displayRestart: true,
              displayPlay: true,
              displayProgress: true,
              displayWarp: true,
            }
          );
        }

        const createSynth = new synthApi.CreateSynth();
        await createSynth.init({
          visualObj: tunes[0],
          options: {
            soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
            soundFontVolumeMultiplier: soundFontBaseVolume,
            pan: [0],
          },
        });

        if (cancelled) return;

        const defaultBpm = typeof tunes[0].getBpm === 'function' ? tunes[0].getBpm() || 120 : 120;
        await synthControl.setTune(tunes[0], false, {
          chordsOff: false,
          qpm: Math.round(defaultBpm * (tempoRef.current / 100)),
          soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
          soundFontVolumeMultiplier: soundFontBaseVolume,
        });

        if (cancelled) return;
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
        } catch (_e) {}
      }
      if (synthControllerRef.current === synthControl) {
        synthControllerRef.current = null;
      }
    };
  }, [tunes]);

  const handlePlayToggle = () => {
    if (!synthControllerRef.current) return;
    if (isPlaying) {
      synthControllerRef.current.pause();
      synthControllerRef.current.isStarted = false;
      setIsPlaying(false);
    } else {
      synthControllerRef.current.isStarted = false;
      synthControllerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (!synthControllerRef.current) return;
    synthControllerRef.current.pause();
    synthControllerRef.current.restart();
    synthControllerRef.current.isStarted = false;
    setIsPlaying(false);
    document.querySelectorAll('.abcjs-highlight').forEach((el) => el.classList.remove('abcjs-highlight'));
  };

  return (
    <div className="audio-player-card glass-panel">
      <div className="player-header">
        <h3 className="section-title">
          <Music2 className="w-4 h-4 inline mr-2 text-emerald-400" />
          Piano Audio Synthesizer
        </h3>
        <span className={`status-pill ${isReady ? 'ready' : 'loading'}`}>
          {isReady ? 'Synth Ready' : tunes ? 'Buffering Audio...' : 'No Score Loaded'}
        </span>
      </div>

      {audioError && (
        <div className="error-banner">
          <span>{audioError}</span>
        </div>
      )}

      {/* Hidden container for standard abcjs synth UI fallback */}
      <div ref={audioContainerRef} className="abcjs-synth-container hidden-synth" />

      <div className="player-controls-bar">
        <div className="main-play-buttons">
          <button
            className={`btn btn-primary btn-circle ${isPlaying ? 'playing' : ''}`}
            onClick={handlePlayToggle}
            disabled={!isReady}
            title={isPlaying ? 'Pause Audio' : 'Play Piano Synthesizer'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <button
            className="btn btn-secondary btn-circle"
            onClick={handleStop}
            disabled={!isReady}
            title="Stop & Reset"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        </div>

        <div className="control-slider-group">
          <Gauge className="w-4 h-4 text-emerald-400" />
          <span className="slider-label">Tempo:</span>
          <input
            type="range"
            min="50"
            max="180"
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            className="audio-slider"
          />
          <span className="slider-value">{tempo}%</span>
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
