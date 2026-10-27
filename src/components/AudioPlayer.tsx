import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { Play, Pause, Square, Volume2, VolumeX, Music2 } from 'lucide-react';

import { VoicesPanel } from './VoicesPanel';
import { describeMixerVoices, mixVoiceSequence, readVoiceMix, writeVoiceMix, type VoiceMixSettings } from '../music/voiceMixer';
import type { ScoreAnchor } from '../types/document';
import { formatAnchorLabel } from '../utils/anchor';
import type { PlaybackPosition } from '../utils/repeatPlayback';
import type { PlaybackSourceRanges } from '../music/abcPresentation';
import { initAbcjsSynth } from '../utils/abcAudio';
import { isFirstMeasurePickup } from '../music/scoreSnapshot';
import { computeScoreMeasureMapping } from '../../shared/score-timing.mjs';
import { collectPreparedMeasureOccurrences, selectMeasureWithRepeats } from '../utils/repeatPlayback';
import { readWaterfallPosition, rebindSynthTimingTarget, secondsPerWholeNote, seekSynthExactly, synchronizeSynthTimingTempo, waterfallNotesFromNoteMap, waterfallNotesFromSequence } from '../music/waterfallPlayback';
import type { SynthSequenceNote, WaterfallPlayback } from '../music/waterfallPlayback';

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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('chorale-playback-cursor', { detail: event }));
  }
};

export interface MeasurePreviewRequest {
  sourceKey: string;
  measure: number;
  stop?: boolean;
  continuous?: boolean;
}

interface AudioPlayerProps {
  tunes: abcjs.TuneObject[] | null;
  sourceKey?: string | null;
  documentId?: string;
  abcCode?: string;
  totalMeasures?: number;
  activeAnchor?: ScoreAnchor | null;
  measurePreviewRequest?: MeasurePreviewRequest | null;
  onPlaybackPositionChange?: (position: PlaybackPosition) => void;
  onPlaybackSourceRangesChange?: (ranges: PlaybackSourceRanges | null) => void;
  onWaterfallPlaybackChange?: (playback: WaterfallPlayback | null) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  tunes,
  sourceKey,
  documentId,
  abcCode = '',
  totalMeasures,
  activeAnchor,
  measurePreviewRequest,
  onPlaybackPositionChange,
  onPlaybackSourceRangesChange,
  onWaterfallPlaybackChange,
}) => {

  const soundFontBaseVolume = 0.4;
  const synthControllerRef = useRef<any>(null);
  const renderedTune = tunes?.[0] || null;
  const sourceIdentity = renderedTune ? (sourceKey ?? renderedTune) : null;
  const [transport, setTransport] = useState({ identity: sourceIdentity, tune: renderedTune });
  if (transport.identity !== sourceIdentity) {
    setTransport({ identity: sourceIdentity, tune: renderedTune });
  }
  const currentTune = transport.tune;
  // abcjs rewrites noteTimings when the transport changes speed. Keep preview
  // boundaries in the original score-time coordinates used by seekTo.
  const previewTiming = React.useMemo(() => {
    if (!currentTune) return null;
    try {
      return {
        occurrences: collectPreparedMeasureOccurrences(currentTune, computeScoreMeasureMapping(currentTune)),
        duration: currentTune.getTotalTime(),
      };
    } catch { return null; }
  }, [currentTune]);
  const renderedTuneRef = useRef(renderedTune);
  useLayoutEffect(() => { renderedTuneRef.current = renderedTune; }, [renderedTune]);
  const mixerVoices = React.useMemo(() => {
    try { return currentTune ? describeMixerVoices(currentTune, abcCode) : []; } catch { return []; }
  }, [currentTune, abcCode]);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const [previewStopSignal, setPreviewStopSignal] = useState(0);
  const voicesButtonRef = useRef<HTMLButtonElement>(null);
  const dismissVoices = React.useCallback(() => setVoicesOpen(false), []);
  const closeVoices = React.useCallback(() => {
    setVoicesOpen(false);
    voicesButtonRef.current?.focus();
  }, []);
  const [mixerState, setMixerState] = useState(() => ({ documentId, settings: readVoiceMix(documentId) }));
  const mixerSettings = mixerState.documentId === documentId ? mixerState.settings : readVoiceMix(documentId);
  if (mixerState.documentId !== documentId) setMixerState({ documentId, settings: mixerSettings });
  const mixerRef = useRef({ voices: mixerVoices, settings: mixerSettings });
  useLayoutEffect(() => { mixerRef.current = { voices: mixerVoices, settings: mixerSettings }; }, [mixerVoices, mixerSettings]);
  const mixedTunes = useRef(new WeakMap<abcjs.TuneObject, abcjs.TuneObject>());
  const mixedTune = React.useCallback((tune: abcjs.TuneObject): abcjs.TuneObject => {
    if (typeof tune.setUpAudio !== 'function') return tune;
    let mixed = mixedTunes.current.get(tune);
    if (!mixed) {
      mixed = Object.create(tune) as abcjs.TuneObject;
      mixed.setUpAudio = (options) => mixVoiceSequence(tune.setUpAudio(options), mixerRef.current.voices, mixerRef.current.settings);
      mixedTunes.current.set(tune, mixed);
    }
    return mixed;
  }, []);
  const [loadedTransport, setLoadedTransport] = useState<typeof transport | null>(null);
  const isReady = Boolean(currentTune && loadedTransport === transport);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [currentMeasure, setCurrentMeasure] = useState<number | null>(null);
  const playbackProgressRef = useRef(0);
  const totalDurationMsRef = useRef(0);
  const isPlayingRef = useRef(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isChangingSpeed, setIsChangingSpeed] = useState(false);
  const pendingMixerFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (isChangingSpeed) return;
    const control = pendingMixerFocusRef.current;
    pendingMixerFocusRef.current = null;
    if (document.activeElement === document.body && control?.isConnected) control.focus({ preventScroll: true });
  }, [isChangingSpeed, mixerSettings]);
  const [isStarting, setIsStarting] = useState(false);
  const playbackSpeedRef = useRef(1);
  const pendingSeekRef = useRef<number | null>(0);
  const latestSeekSecondsRef = useRef(0);
  const operationRef = useRef(0);
  const measurePreviewRef = useRef<{ start: number; end: number } | null>(null);
  const handledPreviewRef = useRef<MeasurePreviewRequest | null>(null);
  const [synthGeneration, setSynthGeneration] = useState(0);
  const recoveryRef = useRef<{ transport: typeof transport; seconds: number; duration: number } | null>(null);
  const waterfallRef = useRef<WaterfallPlayback | null>(null);
  // Callback identity changes must not tear down the current audio transport.
  const callbacksRef = useRef({ onPlaybackPositionChange, onPlaybackSourceRangesChange, onWaterfallPlaybackChange });
  useLayoutEffect(() => {
    callbacksRef.current = { onPlaybackPositionChange, onPlaybackSourceRangesChange, onWaterfallPlaybackChange };
  }, [onPlaybackPositionChange, onPlaybackSourceRangesChange, onWaterfallPlaybackChange]);

  const getAudioContext = React.useCallback(() => {
    return (abcjs as any).synth?.activeAudioContext?.() ?? null;
  }, []);

  const getExactPosition = React.useCallback(() => readWaterfallPosition(
    synthControllerRef.current?.midiBuffer,
    getAudioContext(),
    playbackSpeedRef.current,
    pendingSeekRef.current ?? playbackProgressRef.current * totalDurationMsRef.current / 1000 * playbackSpeedRef.current,
  ), [getAudioContext]);

  useEffect(() => {
    onWaterfallPlaybackChange?.(waterfallRef.current);
  }, [onWaterfallPlaybackChange]);

  const [prevSourceIdentity, setPrevSourceIdentity] = useState(sourceIdentity);
  if (sourceIdentity !== prevSourceIdentity) {
    setPrevSourceIdentity(sourceIdentity);
    setPlaybackProgress(0);
    setTotalDurationMs(0);
    setCurrentMeasure(null);
    setIsPlaying(false);
    setAudioError(null);
    setPlaybackSpeed(1);
    setIsChangingSpeed(false);
    setIsStarting(false);
  }

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
    callbacksRef.current.onPlaybackPositionChange?.({
      currentSeconds: durationMs > 0 ? progress * durationMs / 1000 * playbackSpeedRef.current : 0,
      isPlaying: playing,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chorale-playback-state', { detail: { isPlaying: playing } }));
    }
    if (!playing) callbacksRef.current.onPlaybackSourceRangesChange?.(null);
  }, []);

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

  // Primary synth initialization on tune change
  useEffect(() => {
    removePlaybackCursor();
    measurePreviewRef.current = null;
    operationRef.current += 1;
    const recovery = recoveryRef.current?.transport === transport ? recoveryRef.current : null;
    recoveryRef.current = null;
    const initialSeconds = recovery?.seconds ?? 0;
    pendingSeekRef.current = initialSeconds;
    latestSeekSecondsRef.current = initialSeconds;
    playbackSpeedRef.current = 1;
    waterfallRef.current = null;
    callbacksRef.current.onWaterfallPlaybackChange?.(null);
    callbacksRef.current.onPlaybackSourceRangesChange?.(null);
    callbacksRef.current.onPlaybackPositionChange?.({ currentSeconds: initialSeconds, isPlaying: false });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chorale-playback-state', { detail: { isPlaying: false } }));
    }

    if (!currentTune) {
      playbackProgressRef.current = 0;
      totalDurationMsRef.current = 0;
      isPlayingRef.current = false;
      return;
    }

    playbackProgressRef.current = 0;
    totalDurationMsRef.current = 0;
    isPlayingRef.current = false;

    let synthControl: any;
    let cancelled = false;
    const publishNotes = (notes: WaterfallPlayback['notes']) => {
      if (cancelled) return;
      const playback = {
        notes,
        getPosition: () => cancelled ? { currentSeconds: 0, isPlaying: false } : getExactPosition(),
      };
      waterfallRef.current = playback;
      callbacksRef.current.onWaterfallPlaybackChange?.(playback);
    };

    const initSynth = async () => {
      try {
        const synthApi = (abcjs as any).synth;
        if (!synthApi || (synthApi.isSupported && !synthApi.isSupported())) {
          setAudioError('WebAudio is not supported in this browser environment.');
          setLoadedTransport(null);
          return;
        }

        if (!recovery) setAudioError(null);

        // Create audio synth controller
        synthControl = new synthApi.SynthController();
        synthControllerRef.current = synthControl;
        const isPickup = currentTune ? isFirstMeasurePickup(currentTune as any) : false;
        const firstMeasureNumber = isPickup ? 0 : 1;

        if (audioContainerRef.current) {
          audioContainerRef.current.innerHTML = '';
          synthControl.load(
            audioContainerRef.current,
            {
              onEvent: (event: abcjs.NoteTimingEvent) => {
                if (cancelled) return;
                if (event) {
                  updatePlaybackCursor(event);
                  if (isFiniteNumber(event.measureNumber)) {
                    setCurrentMeasure(event.measureNumber + firstMeasureNumber);
                  }
                  const starts = event.startCharArray || (typeof event.startChar === 'number' ? [event.startChar] : []);
                  const ends = event.endCharArray || (typeof event.endChar === 'number' ? [event.endChar] : []);
                  callbacksRef.current.onPlaybackSourceRangesChange?.(starts.length ? { starts, ends } : null);
                }
              },
              onBeat: (beatNumber: number, totalBeats: number, totalTime: number) => {
                if (cancelled) return;
                const beatsPerMeasure = currentTune.getBeatsPerMeasure?.() || 0;
                if (beatsPerMeasure > 0) {
                  setCurrentMeasure(Math.max(firstMeasureNumber, Math.floor(beatNumber / beatsPerMeasure) + firstMeasureNumber));
                }
                updatePlaybackPosition({
                  progress: totalBeats > 0 ? beatNumber / totalBeats : 0,
                  durationMs: totalTime,
                });
              },
              onReady: () => {
                if (cancelled) {
                  synthControl.destroy?.();
                  return;
                }
                synchronizeSynthTimingTempo(synthControl.timer, synthControl.midiBuffer, synthControl.visualObj ?? currentTune);
                if (pendingSeekRef.current !== null) {
                  seekSynthExactly(synthControl, getAudioContext(), pendingSeekRef.current / playbackSpeedRef.current,
                    totalDurationMsRef.current / 1000);
                  pendingSeekRef.current = null;
                }
              },
              onFinished: () => {
                if (cancelled) return;
                measurePreviewRef.current = null;
                pendingSeekRef.current = 0;
                latestSeekSecondsRef.current = 0;
                setCurrentMeasure(null);
                updatePlaybackPosition({ progress: 0, playing: false });
                if (synthControllerRef.current) {
                  synthControllerRef.current.isStarted = false;
                }
                removePlaybackCursor();
                callbacksRef.current.onPlaybackSourceRangesChange?.(null);
              },
            },
            {
              displayLoop: true,
              displayRestart: true,
              displayPlay: true,
              displayProgress: true,
              // abcjs setWarp updates this input even when our own speed control is used.
              displayWarp: true,
            }
          );
        }

        const createSynth = new synthApi.CreateSynth();
        await initAbcjsSynth(createSynth, {
          visualObj: mixedTune(currentTune),
          soundFontVolumeMultiplier: soundFontBaseVolume,
          pan: [0],
        });

        if (cancelled) return;
        publishNotes(waterfallNotesFromSequence(createSynth));
        const sequenceCallback = (tracks: SynthSequenceNote[][]) => {
          publishNotes(waterfallNotesFromNoteMap(tracks, secondsPerWholeNote(
            synthControl.midiBuffer ?? createSynth, playbackSpeedRef.current,
          )));
        };

        const visualTune = mixedTune(renderedTuneRef.current ?? currentTune);
        try {
          await synthControl.setTune(visualTune, false, {
            chordsOff: false,
            sequenceCallback,
            soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
            soundFontVolumeMultiplier: soundFontBaseVolume,
          });
        } catch (sfErr) {
          if (cancelled) return;
          console.warn('SoundFont setTune failed, using built-in synth:', sfErr);
          await synthControl.setTune(visualTune, false, {
            chordsOff: false,
            sequenceCallback,
            soundFontVolumeMultiplier: soundFontBaseVolume,
          });
        }

        if (cancelled) { synthControl.destroy?.(); return; }
        const totalTime = recovery?.duration ?? currentTune.getTotalTime?.();
        if (Number.isFinite(totalTime) && totalTime > 0) {
          updatePlaybackPosition({ durationMs: totalTime * 1000, progress: initialSeconds / totalTime });
        }
        setLoadedTransport(transport);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Error initializing audio synth:', err);
        setAudioError('Could not initialize audio synthesizer.');
        setLoadedTransport(null);
        waterfallRef.current = null;
        callbacksRef.current.onWaterfallPlaybackChange?.(null);
      }
    };

    initSynth();

    return () => {
      cancelled = true;
      operationRef.current += 1;
      waterfallRef.current = null;
      callbacksRef.current.onWaterfallPlaybackChange?.(null);
      if (synthControl) {
        try {
          synthControl.pause();
          synthControl.isStarted = false;
          synthControl.destroy?.();
        } catch {}
      }
      if (synthControllerRef.current === synthControl) {
        synthControllerRef.current = null;
      }
      removePlaybackCursor();
      callbacksRef.current.onPlaybackPositionChange?.({ currentSeconds: 0, isPlaying: false });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chorale-playback-state', { detail: { isPlaying: false } }));
      }
    };
  }, [currentTune, transport, synthGeneration, soundFontBaseVolume, getAudioContext, getExactPosition, updatePlaybackPosition, mixedTune]);

  useEffect(() => {
    const controller = synthControllerRef.current;
    if (!controller || !renderedTune || controller.visualObj === mixedTune(renderedTune)) return;
    removePlaybackCursor();
    rebindSynthTimingTarget(controller, mixedTune(renderedTune), getAudioContext());
    if (!isPlayingRef.current) callbacksRef.current.onPlaybackSourceRangesChange?.(null);
  }, [renderedTune, currentTune, getAudioContext, mixedTune]);

  const seekTo = React.useCallback((position: number, units?: 'seconds') => {
    const controller = synthControllerRef.current;
    if (!controller) return;
    const duration = totalDurationMsRef.current / 1000;
    const speed = playbackSpeedRef.current;
    const seconds = units === 'seconds' ? position / speed : position * duration;
    const sought = seekSynthExactly(controller, getAudioContext(), seconds, duration);
    pendingSeekRef.current = sought.seconds * speed;
    latestSeekSecondsRef.current = sought.seconds * speed;
    updatePlaybackPosition({ progress: sought.progress });
  }, [getAudioContext, updatePlaybackPosition]);

  const applyAnchorSeek = React.useCallback((anchor: ScoreAnchor) => {
    if (!synthControllerRef.current || !currentTune) return;
    if (anchor.playbackSeconds !== undefined) {
      seekTo(anchor.playbackSeconds, 'seconds');
    } else if (anchor.playbackFraction !== undefined) {
      seekTo(Math.max(0, Math.min(1, anchor.playbackFraction)));
    } else {
      const totalBeats = currentTune.getTotalBeats?.() || 0;
      const beatsPerMeasure = currentTune.getBeatsPerMeasure?.() || 0;
      if (totalBeats > 0 && beatsPerMeasure > 0) {
        const selectedBeat = Math.max(0, (anchor.startMeasure - 1) * beatsPerMeasure + (anchor.beat || 1) - 1);
        seekTo(Math.max(0, Math.min(1, selectedBeat / totalBeats)));
      }
    }
  }, [currentTune, seekTo]);

  const appliedAnchorRef = useRef<{ anchor: ScoreAnchor; transport: typeof transport } | null>(null);
  useEffect(() => {
    if (!activeAnchor) { appliedAnchorRef.current = null; return; }
    if (!isReady) return;
    // A replacement controller restores the latest transport position. Do not
    // overwrite that recovery (or Stop) with an unchanged earlier selection.
    if (appliedAnchorRef.current?.anchor === activeAnchor && appliedAnchorRef.current.transport === transport) return;
    applyAnchorSeek(activeAnchor);
    appliedAnchorRef.current = { anchor: activeAnchor, transport };
  }, [activeAnchor, applyAnchorSeek, isReady, transport]);

  const schedulePreviewAudioStop = React.useCallback(() => {
    const preview = measurePreviewRef.current;
    const context = getAudioContext();
    if (!preview || !context) return;
    const remaining = Math.max(0, preview.end - getExactPosition().currentSeconds) / playbackSpeedRef.current;
    // Schedule on the audio clock as well as clearing the UI at the boundary.
    // Sound must stop even when animation frames are throttled in a hidden tab.
    for (const source of synthControllerRef.current?.midiBuffer?.directSource ?? []) {
      source.stop(context.currentTime + remaining);
    }
  }, [getAudioContext, getExactPosition]);

  const handlePlayToggle = React.useCallback(async (preview?: { start: number; end: number }) => {
    measurePreviewRef.current = preview ?? null;
    const controller = synthControllerRef.current;
    if (!controller) return;
    const operation = ++operationRef.current;
    if (isPlayingRef.current) {
      controller.pause();
      controller.isStarted = false;
      const position = getExactPosition();
      pendingSeekRef.current = null;
      latestSeekSecondsRef.current = position.currentSeconds;
      const { progress } = seekSynthExactly(controller, getAudioContext(),
        position.currentSeconds / playbackSpeedRef.current, totalDurationMsRef.current / 1000);
      updatePlaybackPosition({
        playing: false,
        progress,
      });
      return;
    }

    updatePlaybackPosition({ playing: true });
    setIsStarting(true);
    setAudioError(null);
    try {
      const context = getAudioContext();
      if (context?.state === 'suspended') await context.resume();
      if (synthControllerRef.current !== controller || operationRef.current !== operation) return;
      const promise = controller.play();
      if (promise?.then) await promise;
      if (synthControllerRef.current !== controller || operationRef.current !== operation) {
        controller.pause();
        controller.isStarted = false;
        if (synthControllerRef.current === controller) {
          seekTo(latestSeekSecondsRef.current, 'seconds');
        }
        return;
      }
      // Selection before first Play may predate creation of the real buffer.
      // Resume otherwise keeps the engine's exact paused offset.
      if (pendingSeekRef.current !== null) {
        const seconds = pendingSeekRef.current;
        seekTo(seconds, 'seconds');
        pendingSeekRef.current = null;
      }
      schedulePreviewAudioStop();
    } catch (error) {
      if (synthControllerRef.current !== controller || operationRef.current !== operation) return;
      controller.pause?.();
      controller.isStarted = false;
      updatePlaybackPosition({ playing: false });
      setAudioError('Could not start audio playback.');
      waterfallRef.current = null;
      callbacksRef.current.onWaterfallPlaybackChange?.(null);
      console.error('Error starting audio:', error);
    } finally {
      if (synthControllerRef.current === controller) setIsStarting(false);
    }
  }, [getExactPosition, getAudioContext, seekTo, updatePlaybackPosition, schedulePreviewAudioStop]);

  const handleStop = React.useCallback(() => {
    setPreviewStopSignal((value) => value + 1);
    const controller = synthControllerRef.current;
    if (!controller) return;
    operationRef.current += 1;
    measurePreviewRef.current = null;
    controller.pause();
    controller.restart?.();
    controller.isStarted = false;
    seekTo(0);
    setCurrentMeasure(null);
    updatePlaybackPosition({ progress: 0, playing: false });
    removePlaybackCursor();
  }, [seekTo, updatePlaybackPosition]);

  // A source edit rebuilds the transport asynchronously. Consume each request
  // once, only when the synth belongs to the exact committed document/source.
  useEffect(() => {
    if (!measurePreviewRequest || handledPreviewRef.current === measurePreviewRequest) return;
    if (measurePreviewRequest.sourceKey !== sourceKey || !isReady || isChangingSpeed) return;
    handledPreviewRef.current = measurePreviewRequest;
    if (measurePreviewRequest.stop || isPlayingRef.current) {
      handleStop();
      return;
    }
    if (!currentTune) return;
    try {
      const occurrences = previewTiming?.occurrences ?? [];
      const occurrence = selectMeasureWithRepeats(measurePreviewRequest.measure, occurrences, getExactPosition().currentSeconds);
      if (!occurrence) throw new Error('Measure timing is unavailable.');
      const index = occurrences.indexOf(occurrence);
      const end = occurrences[index + 1]?.startTimeSec ?? previewTiming?.duration ?? 0;
      if (!(end > occurrence.startTimeSec)) throw new Error('Measure timing is unavailable.');
      if (synthControllerRef.current?.isLooping) synthControllerRef.current.toggleLoop();
      seekTo(occurrence.startTimeSec, 'seconds');
      void handlePlayToggle(measurePreviewRequest.continuous ? undefined : { start: occurrence.startTimeSec, end });
    } catch {
      setAudioError('Could not preview this measure: playback timing is unavailable.');
    }
  }, [measurePreviewRequest, sourceKey, isReady, isChangingSpeed, currentTune, previewTiming, getExactPosition, seekTo, handlePlayToggle, handleStop]);

  // Follow the audio clock so pauses, tempo changes, and tab throttling cannot
  // turn a single-measure preview into continuous score playback.
  useEffect(() => {
    if (!isPlaying) return;
    let frame: number;
    const checkBoundary = () => {
      const preview = measurePreviewRef.current;
      if (preview && getExactPosition().currentSeconds >= preview.end) {
        const controller = synthControllerRef.current;
        operationRef.current += 1;
        controller?.pause();
        if (controller) controller.isStarted = false;
        measurePreviewRef.current = null;
        seekTo(preview.start, 'seconds');
        updatePlaybackPosition({ playing: false });
        setCurrentMeasure(null);
        removePlaybackCursor();
        return;
      }
      frame = window.requestAnimationFrame(checkBoundary);
    };
    frame = window.requestAnimationFrame(checkBoundary);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, getExactPosition, seekTo, updatePlaybackPosition]);

  const handleSpeedChange = async (speed: number, reason: 'speed' | 'voices' = 'speed') => {
    const controller = synthControllerRef.current;
    if (!controller?.setWarp || !Number.isFinite(speed) || speed <= 0) return;
    const operation = ++operationRef.current;
    const position = getExactPosition();
    const wasPlaying = isPlayingRef.current;
    const duration = totalDurationMsRef.current / 1000 * playbackSpeedRef.current;
    const progress = duration > 0 ? position.currentSeconds / duration : 0;
    controller.pause();
    controller.isStarted = false;
    seekSynthExactly(controller, getAudioContext(), position.currentSeconds / playbackSpeedRef.current,
      totalDurationMsRef.current / 1000);
    playbackSpeedRef.current = speed;
    pendingSeekRef.current = position.currentSeconds;
    latestSeekSecondsRef.current = position.currentSeconds;
    setPlaybackSpeed(speed);
    setIsChangingSpeed(true);
    setAudioError(null);
    updatePlaybackPosition({ playing: false, progress, durationMs: duration / speed * 1000 });
    try {
      // Pause first so abcjs cannot asynchronously restart an obsolete request.
      await controller.setWarp(speed * 100);
      if (synthControllerRef.current !== controller || operationRef.current !== operation) {
        controller.pause();
        controller.isStarted = false;
        if (synthControllerRef.current === controller) {
          seekTo(latestSeekSecondsRef.current, 'seconds');
        }
        return;
      }
      seekTo(latestSeekSecondsRef.current, 'seconds');
      if (wasPlaying) {
        const promise = controller.play();
        if (promise?.then) await promise;
        if (synthControllerRef.current !== controller || operationRef.current !== operation) {
          controller.pause();
          controller.isStarted = false;
          if (synthControllerRef.current === controller) seekTo(latestSeekSecondsRef.current, 'seconds');
          return;
        }
        pendingSeekRef.current = null;
        updatePlaybackPosition({ playing: true });
        schedulePreviewAudioStop();
      }
    } catch (error) {
      if (synthControllerRef.current !== controller || !currentTune) return;
      // A rejected abcjs go() leaves isLoading stuck after destroying the old
      // timer. Replace that controller instead of letting Play poll forever.
      recoveryRef.current = { transport, seconds: latestSeekSecondsRef.current, duration };
      setLoadedTransport(null);
      setPlaybackSpeed(1);
      playbackSpeedRef.current = 1;
      setCurrentMeasure(null);
      setIsStarting(false);
      updatePlaybackPosition({ playing: false });
      setAudioError(reason === 'voices' ? 'Could not update voice sounds. Playback is paused at 1×; try again.' : 'Could not change playback speed. Playback is paused at 1×; try again.');
      waterfallRef.current = null;
      callbacksRef.current.onWaterfallPlaybackChange?.(null);
      setSynthGeneration((generation) => generation + 1);
      console.error('Error changing audio speed:', error);
    } finally {
      if (synthControllerRef.current === controller) setIsChangingSpeed(false);
    }
  };

  const handleMixChange = async (settings: VoiceMixSettings) => {
    pendingMixerFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mixerRef.current = { voices: mixerVoices, settings };
    setMixerState({ documentId, settings });
    writeVoiceMix(documentId, settings);
    await handleSpeedChange(playbackSpeedRef.current, 'voices');
  };

  const handleSeekTrackClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!synthControllerRef.current || !isReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    measurePreviewRef.current = null;
    seekTo(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
  };

  const formatTime = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentMs = playbackProgress * totalDurationMs;
  const fallbackMeasureTotal = (() => {
    const tune = tunes?.[0];
    const totalBeats = tune?.getTotalBeats?.() || 0;
    const beatsPerMeasure = tune?.getBeatsPerMeasure?.() || 0;
    return totalBeats > 0 && beatsPerMeasure > 0
      ? Math.ceil(totalBeats / beatsPerMeasure)
      : 0;
  })();
  const displayedMeasureTotal = totalMeasures && totalMeasures > 0
    ? totalMeasures
    : fallbackMeasureTotal;

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

      {voicesOpen && <VoicesPanel key={documentId} voices={mixerVoices} settings={mixerSettings}
        disabled={!isReady || isChangingSpeed || isStarting} volume={effectiveVolume} stopSignal={previewStopSignal} mainPlaying={isPlaying}
        onChange={handleMixChange}
        onBeforePreview={() => { if (isPlayingRef.current) void handlePlayToggle(); }}
        onClose={closeVoices} onDismiss={dismissVoices} triggerRef={voicesButtonRef} />}
      <div className="player-controls-bar">
        <div className="main-play-buttons">
          <button
            className={`btn btn-primary btn-circle ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => { void handlePlayToggle(); }}
            disabled={!isReady || isChangingSpeed || (!isPlaying && isStarting)}
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
        </div>

        <div className="playback-progress" aria-label="Playback position">
          <div className="playback-progress-meta">
            <div className="playback-progress-time">
              <strong>{formatTime(currentMs)}</strong>
              <span>/ {totalDurationMs > 0 ? formatTime(totalDurationMs) : '--:--'}</span>
            </div>
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

        <div className="playback-status-stack">
          <span className="playback-measure-pill" aria-label="Current measure">
            {`m. ${currentMeasure ?? '—'} / ${displayedMeasureTotal || '—'}`}
          </span>

          <div className="playback-selection-slot" aria-label="Playback selection">
            {activeAnchor ? (
              <div className="playback-loop-pill">
                <span>Selected {formatAnchorLabel(activeAnchor)}</span>
              </div>
            ) : (
              <span className="playback-selection-empty">No selection</span>
            )}
          </div>
        </div>

        <button type="button" ref={voicesButtonRef} className="voices-toggle" aria-expanded={voicesOpen}
          onClick={() => setVoicesOpen(!voicesOpen)}>Voices</button>
        <label className="playback-speed-control">
          <span className="sr-only">Playback speed</span>
          <select
            aria-label="Playback speed"
            value={playbackSpeed}
            onChange={(event) => { void handleSpeedChange(Number(event.target.value)); }}
            disabled={!isReady || isChangingSpeed || isStarting}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
          </select>
        </label>

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
