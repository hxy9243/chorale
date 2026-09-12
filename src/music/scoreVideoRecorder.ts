/**
 * Orchestrator for extracting score systems, synthesizing count-in & music audio,
 * driving the canvas renderer, and recording via MediaRecorder.
 */

import abcjs from 'abcjs';
import { ScoreVideoTimeline, type ScoreSystemBBox, type ScoreNoteEvent } from './scoreVideoTimeline';
import {
  ScoreVideoRenderer,
  type ScoreVideoRenderOptions,
  type ScoreVideoTheme,
  type RenderableSystem,
} from './scoreVideoRenderer';
import { prepareAbcForPlayback } from '../utils/abcAudio';

export interface ScoreVideoExportProgress {
  currentSec: number;
  totalSec: number;
  percentage: number;
  phase: 'preparing' | 'rendering' | 'encoding' | 'done';
}

export interface ScoreVideoExportOptions extends ScoreVideoRenderOptions {
  introDurationSec: number;
  outroDurationSec: number;
  fps?: number;
  onProgress?: (progress: ScoreVideoExportProgress) => void;
}

export interface ExtractedScoreData {
  systems: ScoreSystemBBox[];
  noteEvents: ScoreNoteEvent[];
  systemImages: RenderableSystem[];
  totalScoreTimeSec: number;
  audioBuffer?: AudioBuffer | null;
}

function mixAudioBuffers(audioCtx: AudioContext, buffers: AudioBuffer[]): AudioBuffer | null {
  if (!buffers || buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];
  const sampleRate = buffers[0].sampleRate;
  const numberOfChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const length = Math.max(...buffers.map((b) => b.length));
  const mixed = audioCtx.createBuffer(numberOfChannels, length, sampleRate);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const mixedData = mixed.getChannelData(ch);
    for (const b of buffers) {
      const chToRead = Math.min(ch, b.numberOfChannels - 1);
      const bData = b.getChannelData(chToRead);
      for (let i = 0; i < bData.length; i++) {
        mixedData[i] += bData[i];
      }
    }
  }
  return mixed;
}

/**
 * Parses the offscreen or rendered SVG score staves and prepares
 * high-res Image slices from an ABC source or fallback SVG element.
 */
export async function extractScoreSystems(
  source: string | SVGSVGElement,
  theme: ScoreVideoTheme = 'dark',
  audioCtx?: AudioContext | null,
): Promise<ExtractedScoreData> {
  let svgElement: SVGSVGElement | null = null;
  let totalScoreTimeSec = 30;
  let audioBuffer: AudioBuffer | null = null;
  let cleanupContainer: HTMLElement | null = null;
  let activeTune: any = null;

  if (typeof source === 'string' && typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '840px';
    container.style.visibility = 'hidden';
    document.body.appendChild(container);
    cleanupContainer = container;

    try {
      const preparedAbc = prepareAbcForPlayback(source);
      const strokeColor = theme === 'dark' ? '#f8fafc' : '#1c1917';
      const tunes = abcjs.renderAbc(container, preparedAbc, {
        responsive: 'resize',
        scale: 1.2,
        staffwidth: 780,
        wrap: {
          minSpacing: 1.5,
          maxSpacing: 3,
          preferredMeasuresPerLine: 4,
        },
        add_classes: true,
        foregroundColor: strokeColor,
      });

      const tune = tunes?.[0];
      activeTune = tune;
      if (tune) {
        totalScoreTimeSec = Math.max(1, tune.getTotalTime?.() || 30);

        // Synthesize audio buffer using abcjs CreateSynth
        if (typeof window !== 'undefined' && (abcjs as any).synth?.CreateSynth) {
          try {
            const synthApi = (abcjs as any).synth;
            const createSynth = new synthApi.CreateSynth();
            try {
              await createSynth.init({
                visualObj: tune,
                audioContext: audioCtx,
                options: {
                  soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/',
                  soundFontVolumeMultiplier: 0.8,
                },
              });
            } catch {
              await createSynth.init({
                visualObj: tune,
                audioContext: audioCtx,
                options: {
                  soundFontVolumeMultiplier: 0.8,
                },
              });
            }
            await createSynth.prime();
            const rawBuffers: AudioBuffer[] = (createSynth.audioBuffers && createSynth.audioBuffers.length > 0)
              ? createSynth.audioBuffers
              : (createSynth.getAudioBuffer?.() ? [createSynth.getAudioBuffer()] : []);
            if (rawBuffers.length > 0 && audioCtx) {
              audioBuffer = mixAudioBuffers(audioCtx, rawBuffers);
            }
          } catch (synthErr) {
            console.warn('CreateSynth audio buffer generation warning:', synthErr);
          }
        }
      }

      svgElement = container.querySelector<SVGSVGElement>('svg');
    } catch (err) {
      console.error('Failed to engrave offscreen score for video:', err);
    }
  } else if (source && typeof (source as SVGSVGElement).querySelectorAll === 'function') {
    svgElement = source as SVGSVGElement;
  }

  if (!svgElement) {
    if (cleanupContainer) cleanupContainer.remove();
    return {
      systems: [],
      noteEvents: [],
      systemImages: [],
      totalScoreTimeSec: 30,
    };
  }

  const lineClassSet = new Set<string>();
  svgElement.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-l"]').forEach((el) => {
    el.classList.forEach((cls) => {
      if (/^abcjs-l\d+$/.test(cls)) {
        lineClassSet.add(cls);
      }
    });
  });

  const sortedLineClasses = Array.from(lineClassSet).sort(
    (a, b) => Number(a.slice(7)) - Number(b.slice(7)),
  );

  const viewBox = svgElement.viewBox.baseVal;
  const svgWidth = viewBox && viewBox.width > 0 ? viewBox.width : 800;

  const systems: ScoreSystemBBox[] = [];
  const systemImages: RenderableSystem[] = [];

  for (let i = 0; i < sortedLineClasses.length; i++) {
    const lineClass = sortedLineClasses[i];
    const elements = Array.from(svgElement.querySelectorAll<SVGGraphicsElement>(`.${lineClass}`));

    let minY = Infinity;
    let maxY = -Infinity;
    const measures: number[] = [];

    elements.forEach((el) => {
      el.classList.forEach((cls) => {
        const mm = cls.match(/^abcjs-mm(\d+)$/);
        if (mm) measures.push(Number(mm[1]) + 1);
      });

      try {
        if (typeof el.getBBox === 'function') {
          const bbox = el.getBBox();
          if (bbox.height > 0) {
            minY = Math.min(minY, bbox.y);
            maxY = Math.max(maxY, bbox.y + bbox.height);
          }
        }
      } catch {
        // ignore in non-rendered states
      }
    });

    const uniqueMeasures = Array.from(new Set(measures)).sort((a, b) => a - b);
    const minMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[0] : i + 1;
    const maxMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[uniqueMeasures.length - 1] : minMeasure;

    const top = Number.isFinite(minY) ? Math.max(0, minY - 15) : i * 140 + 40;
    const bottom = Number.isFinite(maxY) ? maxY + 20 : top + 130;
    const height = Math.max(70, bottom - top);

    const bbox: ScoreSystemBBox = {
      systemIndex: i,
      lineClass,
      minMeasure,
      maxMeasure,
      top,
      bottom,
      height,
      left: 0,
      width: Math.max(100, svgWidth),
    };

    systems.push(bbox);

    // Create high-res isolated SVG image slice with explicit theme styling and namespaces
    let image: HTMLImageElement | null = null;
    if (typeof document !== 'undefined') {
      try {
        const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svgClone.setAttribute('viewBox', `0 ${top} ${svgWidth} ${height}`);
        svgClone.setAttribute('width', `${svgWidth}`);
        svgClone.setAttribute('height', `${height}`);

        // Strip metadata headers so they never bleed into system rows
        svgClone
          .querySelectorAll('.abcjs-meta-top, .abcjs-title, .abcjs-composer, .abcjs-subtitle, .abcjs-header')
          .forEach((el) => el.remove());

        // Remove elements belonging to other lines so this system is strictly isolated
        svgClone.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-l"]').forEach((el) => {
          if (!el.classList.contains(lineClass)) {
            el.remove();
          }
        });

        // Inject explicit theme styling directly inside SVG to ensure crisp rendering on canvas
        const strokeColor = theme === 'dark' ? '#f8fafc' : '#1c1917';
        const staffColor = theme === 'dark' ? '#94a3b8' : '#78716c';
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = `
          svg { color: ${strokeColor}; fill: currentColor; stroke: currentColor; background: transparent; }
          * { color: inherit; }
          .abcjs-staff path, .abcjs-top-line { stroke: ${staffColor} !important; fill: none !important; }
          .abcjs-bar path { stroke: ${strokeColor} !important; }
        `;
        svgClone.insertBefore(styleEl, svgClone.firstChild);

        const xml = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });

        image = img;
      } catch (sliceErr) {
        console.warn('System slice creation warning:', sliceErr);
        image = null;
      }
    }

    systemImages.push({
      systemIndex: i,
      bbox,
      image,
    });
  }

  // Extract accurate note timing events using tune.setTiming(bpm) if available
  const noteEvents: ScoreNoteEvent[] = [];
  if (activeTune && typeof activeTune.setTiming === 'function') {
    try {
      const tempo = activeTune.getBpm?.(activeTune.metaText?.tempo) || 120;
      const timings = activeTune.setTiming(tempo);
      if (Array.isArray(timings) && timings.length > 0) {
        for (const ev of timings) {
          if (ev.type === 'event' && typeof ev.milliseconds === 'number') {
            noteEvents.push({
              timeSec: ev.milliseconds / 1000,
              durationSec: ev.millisecondsPerMeasure ? ev.millisecondsPerMeasure / 1000 : 0.5,
              systemIndex: typeof ev.line === 'number' ? ev.line : 0,
              measureNumber: (ev.measureNumber ?? 0) + 1,
              x: ev.left ?? 50,
              endX: ev.endX,
              y: ev.top ?? 50,
              width: ev.width ?? 10,
              height: ev.height ?? 50,
            });
          } else if (ev.type === 'end' && typeof ev.milliseconds === 'number') {
            totalScoreTimeSec = Math.max(1, ev.milliseconds / 1000);
          }
        }
      }
    } catch (timingErr) {
      console.warn('Could not extract tune timings:', timingErr);
    }
  }

  // Fallback to DOM elements if timing events were not generated
  if (noteEvents.length === 0) {
    const noteEls = Array.from(svgElement.querySelectorAll<SVGGraphicsElement>('.abcjs-note'));
    const totalNotes = Math.max(1, noteEls.length);

    noteEls.forEach((noteEl, idx) => {
      let sysIdx = 0;
      noteEl.classList.forEach((cls) => {
        const match = cls.match(/^abcjs-l(\d+)$/);
        if (match) sysIdx = Number(match[1]);
      });

      let measure = 1;
      noteEl.classList.forEach((cls) => {
        const match = cls.match(/^abcjs-mm(\d+)$/);
        if (match) measure = Number(match[1]) + 1;
      });

      let x = 50;
      let y = 50;
      let width = 10;
      let height = 20;

      try {
        if (typeof noteEl.getBBox === 'function') {
          const b = noteEl.getBBox();
          x = b.x;
          y = b.y;
          width = b.width;
          height = b.height;
        }
      } catch {
        // fallback
      }

      const timeSec = (idx / totalNotes) * totalScoreTimeSec;
      const durationSec = totalScoreTimeSec / totalNotes;

      noteEvents.push({
        timeSec,
        durationSec,
        systemIndex: sysIdx,
        measureNumber: measure,
        x,
        y,
        width,
        height,
      });
    });
  }

  if (cleanupContainer) {
    cleanupContainer.remove();
  }

  return {
    systems,
    noteEvents,
    systemImages,
    totalScoreTimeSec,
    audioBuffer,
  };
}

/**
 * Records a sheet video by rendering frames onto a canvas and streaming into MediaRecorder.
 */
export async function recordScoreVideo(
  canvas: HTMLCanvasElement,
  extracted: ExtractedScoreData,
  options: ScoreVideoExportOptions,
  audioContext?: AudioContext | null,
): Promise<Blob> {
  const { width, height, introDurationSec, outroDurationSec, fps = 30, onProgress } = options;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  const timeline = new ScoreVideoTimeline(
    {
      introDurationSec,
      outroDurationSec,
      scoreDurationSec: extracted.totalScoreTimeSec,
      tempoBpm: options.metadata.tempoBpm ?? 120,
    },
    extracted.systems,
    extracted.noteEvents,
  );

  const renderer = new ScoreVideoRenderer(options);
  const totalDuration = timeline.totalDurationSec;

  onProgress?.({
    currentSec: 0,
    totalSec: totalDuration,
    percentage: 0,
    phase: 'preparing',
  });

  // Prepare Audio Stream with Web Audio
  let destNode: MediaStreamAudioDestinationNode | null = null;
  let activeAudioCtx = audioContext;

  if (typeof window !== 'undefined') {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      if (!activeAudioCtx) {
        activeAudioCtx = new AudioCtxClass();
      }
      if (activeAudioCtx) {
        // Resume context on user gesture to avoid muted/suspended audio recording
        if (activeAudioCtx.state === 'suspended') {
          try {
            await activeAudioCtx.resume();
          } catch {
            // ignore
          }
        }
        destNode = activeAudioCtx.createMediaStreamDestination();
      }
    }
  }

  // Play Score Music Audio starting at introDurationSec
  let musicSource: AudioBufferSourceNode | null = null;
  if (activeAudioCtx && destNode && extracted.audioBuffer) {
    musicSource = activeAudioCtx.createBufferSource();
    musicSource.buffer = extracted.audioBuffer;
    musicSource.connect(destNode);
    musicSource.start(activeAudioCtx.currentTime + introDurationSec);
  }

  // Capture canvas stream
  const canvasStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

  if (destNode) {
    tracks.push(...destNode.stream.getAudioTracks());
  }

  const combinedStream = new MediaStream(tracks);

  // Determine optimal MIME type supported by browser
  let mimeType = 'video/webm;codecs=vp9,opus';
  if (typeof MediaRecorder !== 'undefined') {
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      }
    }
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
    videoBitsPerSecond: 6_000_000,
  });

  const recordedChunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    recorder.onerror = (err) => reject(err);

    recorder.onstop = () => {
      if (musicSource) {
        try {
          musicSource.stop();
        } catch {
          // ignore
        }
      }
      onProgress?.({
        currentSec: totalDuration,
        totalSec: totalDuration,
        percentage: 100,
        phase: 'done',
      });
      const blob = new Blob(recordedChunks, { type: mimeType });
      resolve(blob);
    };

    recorder.start(100);

    // Frame rendering loop driven by wall-clock time to remain 100% in sync with audio
    const frameIntervalMs = 1000 / fps;
    const startTimeMs = performance.now();

    const interval = setInterval(() => {
      const elapsedSec = (performance.now() - startTimeMs) / 1000;

      if (elapsedSec >= totalDuration) {
        clearInterval(interval);
        onProgress?.({
          currentSec: totalDuration,
          totalSec: totalDuration,
          percentage: 99,
          phase: 'encoding',
        });
        setTimeout(() => {
          recorder.stop();
        }, 300);
        return;
      }

      const frameState = timeline.getFrameState(elapsedSec);
      renderer.renderFrame(ctx, frameState, extracted.systemImages);

      onProgress?.({
        currentSec: elapsedSec,
        totalSec: totalDuration,
        percentage: Math.min(99, Math.round((elapsedSec / totalDuration) * 100)),
        phase: 'rendering',
      });
    }, frameIntervalMs);
  });
}
