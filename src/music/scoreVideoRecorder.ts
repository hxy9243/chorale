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

export type ScoreVideoFormat = 'mp4' | 'webm';
export type ScoreVideoQuality = 'compact' | 'compressed' | 'high';

export interface ScoreVideoSizeEstimate {
  bytes: number;
  megabytes: number;
  formatted: string;
}

/**
 * Computes empirical output file size estimation for a score video based on
 * duration, chosen format (MP4 vs WebM), and compression quality tier.
 */
export function getEstimatedScoreVideoSize(
  totalDurationSec: number,
  quality: ScoreVideoQuality = 'compact',
  format: ScoreVideoFormat = 'mp4',
): ScoreVideoSizeEstimate {
  const safeDuration = Math.max(0, totalDurationSec);

  // Empirical total bitrates (video + audio + container muxing overhead) in bps:
  // - compact (720p): WebM ~550 kbps, MP4 ~450 kbps
  // - compressed (1080p): WebM ~1,000 kbps, MP4 ~650 kbps
  // - high (1080p): WebM ~1,850 kbps, MP4 ~1,450 kbps
  const bitratesBps: Record<ScoreVideoQuality, Record<ScoreVideoFormat, number>> = {
    compact: {
      webm: 550_000,
      mp4: 450_000,
    },
    compressed: {
      webm: 1_000_000,
      mp4: 650_000,
    },
    high: {
      webm: 1_850_000,
      mp4: 1_450_000,
    },
  };

  const bps = bitratesBps[quality]?.[format] ?? bitratesBps.compact.mp4;
  const rawBytes = Math.round((bps * safeDuration) / 8);
  // Add base container header overhead (~30 KB)
  const totalBytes = rawBytes + 30_000;
  const megabytes = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
  const formatted = megabytes < 1 ? '< 1 MB' : `~${megabytes.toFixed(1)} MB`;

  return {
    bytes: totalBytes,
    megabytes,
    formatted,
  };
}

export interface ScoreVideoExportOptions extends ScoreVideoRenderOptions {
  introDurationSec: number;
  outroDurationSec: number;
  fps?: number;
  format?: ScoreVideoFormat;
  quality?: ScoreVideoQuality;
  videoBitrate?: number;
  onProgress?: (progress: ScoreVideoExportProgress) => void;
}

import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  canEncodeAudio,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';

let aacEncoderRegistered = false;

/**
 * Ensures a reliable AAC encoder is registered with Mediabunny.
 * If native AAC encoding is supported (Safari, Windows Chrome), it uses native hardware.
 * On platforms without native AAC encoding (e.g. Linux Chrome), it registers the WASM AAC-LC encoder.
 */
export async function ensureAacEncoderReady(): Promise<void> {
  if (aacEncoderRegistered) return;
  try {
    const nativeAac = await canEncodeAudio('aac');
    if (!nativeAac) {
      registerAacEncoder();
    }
  } catch {
    try {
      registerAacEncoder();
    } catch {
      // ignore
    }
  }
  aacEncoderRegistered = true;
}

/**
 * Checks if the browser environment supports WebCodecs (VideoEncoder and VideoFrame).
 */
export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  );
}

/**
 * Checks if the current browser environment supports MP4 video recording via WebCodecs or MediaRecorder.
 */
export function isMp4RecordingSupported(): boolean {
  if (isWebCodecsSupported()) {
    return true;
  }
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return false;
  }
  return (
    MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2') ||
    MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,aac') ||
    MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ||
    MediaRecorder.isTypeSupported('video/mp4') ||
    MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,opus')
  );
}

export interface ExtractedScoreData {
  systems: ScoreSystemBBox[];
  noteEvents: ScoreNoteEvent[];
  systemImages: RenderableSystem[];
  totalScoreTimeSec: number;
  audioBuffer?: AudioBuffer | null;
}

export function mixAudioBuffers(audioCtx: AudioContext, buffers: AudioBuffer[]): AudioBuffer | null {
  if (!buffers || buffers.length === 0) return null;
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

  // Peak detection & normalization across channels to prevent clipping distortion
  let maxPeak = 0;
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = mixed.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) {
        maxPeak = abs;
      }
    }
  }

  // If peak exceeds 0.92, scale down smoothly to preserve pristine audio fidelity
  if (maxPeak > 0.92) {
    const scale = 0.92 / maxPeak;
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = mixed.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] *= scale;
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

  // Phase 1: Scan all systems to compute bounding ranges and determine a uniform system height
  interface RawSystemInfo {
    lineClass: string;
    minMeasure: number;
    maxMeasure: number;
    minY: number;
    maxY: number;
    staffMidY: number;
  }

  const rawSystems: RawSystemInfo[] = [];

  for (let i = 0; i < sortedLineClasses.length; i++) {
    const lineClass = sortedLineClasses[i];
    const elements = Array.from(svgElement.querySelectorAll<SVGGraphicsElement>(`.${lineClass}`));

    let minY = Infinity;
    let maxY = -Infinity;
    let staffMinY = Infinity;
    let staffMaxY = -Infinity;
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

            if (el.classList.contains('abcjs-staff') || el.classList.contains('abcjs-top-line')) {
              staffMinY = Math.min(staffMinY, bbox.y);
              staffMaxY = Math.max(staffMaxY, bbox.y + bbox.height);
            }
          }
        }
      } catch {
        // ignore in non-rendered states
      }
    });

    const uniqueMeasures = Array.from(new Set(measures)).sort((a, b) => a - b);
    const minMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[0] : i + 1;
    const maxMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[uniqueMeasures.length - 1] : minMeasure;

    const staffMid = Number.isFinite(staffMinY) && Number.isFinite(staffMaxY)
      ? (staffMinY + staffMaxY) / 2
      : (Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : i * 140 + 80);

    rawSystems.push({
      lineClass,
      minMeasure,
      maxMeasure,
      minY,
      maxY,
      staffMidY: staffMid,
    });
  }

  // Calculate a uniform slice height encompassing all systems plus comfortable staff margin
  const maxSpan = rawSystems.reduce((max, s) => {
    const span = Number.isFinite(s.minY) && Number.isFinite(s.maxY) ? (s.maxY - s.minY) : 90;
    return Math.max(max, span);
  }, 80);
  const uniformHeight = Math.max(100, Math.round(maxSpan + 40));

  // Phase 2: Create uniform bounding boxes and slice images centered on each system's staff
  const systems: ScoreSystemBBox[] = [];
  const systemImages: RenderableSystem[] = [];

  for (let i = 0; i < rawSystems.length; i++) {
    const raw = rawSystems[i];
    const top = Math.round(raw.staffMidY - uniformHeight / 2);
    const bottom = top + uniformHeight;

    const bbox: ScoreSystemBBox = {
      systemIndex: i,
      lineClass: raw.lineClass,
      minMeasure: raw.minMeasure,
      maxMeasure: raw.maxMeasure,
      top,
      bottom,
      height: uniformHeight,
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
        svgClone.setAttribute('viewBox', `0 ${top} ${svgWidth} ${uniformHeight}`);
        svgClone.setAttribute('width', `${svgWidth}`);
        svgClone.setAttribute('height', `${uniformHeight}`);

        // Strip metadata headers so they never bleed into system rows
        svgClone
          .querySelectorAll('.abcjs-meta-top, .abcjs-title, .abcjs-composer, .abcjs-subtitle, .abcjs-header')
          .forEach((el) => el.remove());

        // Remove elements belonging to other lines so this system is strictly isolated.
        // Be careful to only remove elements with an actual line class (e.g. abcjs-l0, abcjs-l1),
        // and NOT musical elements like .abcjs-ledger or .abcjs-legato whose class names contain 'abcjs-l'.
        svgClone.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-l"]').forEach((el) => {
          const lineClasses = Array.from(el.classList).filter((cls) => /^abcjs-l\d+$/.test(cls));
          if (lineClasses.length > 0 && !lineClasses.includes(raw.lineClass)) {
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
          .abcjs-ledger { fill: ${staffColor} !important; stroke: ${staffColor} !important; stroke-width: 0.8px !important; }
          .abcjs-beam-elem { fill: ${strokeColor} !important; stroke: ${strokeColor} !important; }
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
 * Records a sheet video using hardware-accelerated WebCodecs and Mediabunny.
 * Supports genuine AAC-LC audio (via native OS encoder or fallback WASM encoder)
 * and outputs web-optimized FastStart MP4s for instant Twitter/social compatibility.
 */
export async function recordScoreVideoWithWebCodecs(
  canvas: HTMLCanvasElement,
  extracted: ExtractedScoreData,
  options: ScoreVideoExportOptions,
): Promise<Blob> {
  const { width, height, introDurationSec, outroDurationSec, fps = 30, onProgress } = options;
  const requestedFormat = options.format ?? 'mp4';
  const requestedQuality = options.quality ?? 'compressed';

  const defaultVideoBitrates: Record<ScoreVideoQuality, number> = {
    compact: 750_000,
    compressed: 2_000_000,
    high: 6_000_000,
  };
  const defaultAudioBitrates: Record<ScoreVideoQuality, number> = {
    compact: 112_000,
    compressed: 192_000,
    high: 320_000,
  };

  const videoBitrate = options.videoBitrate ?? defaultVideoBitrates[requestedQuality] ?? 2_000_000;
  const audioBitrate = defaultAudioBitrates[requestedQuality] ?? 192_000;

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

  const isMp4 = requestedFormat === 'mp4';

  if (isMp4) {
    await ensureAacEncoderReady();
  }

  const format = isMp4
    ? new Mp4OutputFormat({ fastStart: 'in-memory' })
    : new WebMOutputFormat();

  const target = new BufferTarget();
  const output = new Output({
    format,
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: isMp4 ? 'avc' : 'vp9',
    bitrate: videoBitrate,
  });
  output.addVideoTrack(videoSource);

  let audioSource: AudioBufferSource | null = null;
  if (extracted.audioBuffer) {
    audioSource = new AudioBufferSource(
      {
        codec: isMp4 ? 'aac' : 'opus',
        bitrate: audioBitrate,
      },
      {
        startTimestamp: introDurationSec,
      },
    );
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  const frameDuration = 1 / fps;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const elapsedSec = Math.min(totalDuration, frameIndex * frameDuration);
    const frameState = timeline.getFrameState(elapsedSec);
    renderer.renderFrame(ctx, frameState, extracted.systemImages);

    await videoSource.add(elapsedSec, frameDuration);

    onProgress?.({
      currentSec: elapsedSec,
      totalSec: totalDuration,
      percentage: Math.min(90, Math.round((frameIndex / totalFrames) * 90)),
      phase: 'rendering',
    });

    if (frameIndex % 5 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (audioSource && extracted.audioBuffer) {
    onProgress?.({
      currentSec: totalDuration,
      totalSec: totalDuration,
      percentage: 95,
      phase: 'encoding',
    });
    await audioSource.add(extracted.audioBuffer);
  }

  onProgress?.({
    currentSec: totalDuration,
    totalSec: totalDuration,
    percentage: 98,
    phase: 'encoding',
  });

  await output.finalize();

  onProgress?.({
    currentSec: totalDuration,
    totalSec: totalDuration,
    percentage: 100,
    phase: 'done',
  });

  if (!target.buffer) {
    throw new Error('Video multiplexer did not produce output buffer.');
  }

  return new Blob([target.buffer], {
    type: isMp4 ? 'video/mp4' : 'video/webm',
  });
}

/**
 * Records a sheet video by rendering frames onto a canvas.
 * Uses hardware-accelerated WebCodecs with AAC-LC audio when available,
 * falling back to MediaRecorder in legacy or unsupported environments.
 */
export async function recordScoreVideo(
  canvas: HTMLCanvasElement,
  extracted: ExtractedScoreData,
  options: ScoreVideoExportOptions,
  audioContext?: AudioContext | null,
): Promise<Blob> {
  if (isWebCodecsSupported()) {
    try {
      return await recordScoreVideoWithWebCodecs(canvas, extracted, options);
    } catch (err) {
      console.warn('WebCodecs recording failed, falling back to MediaRecorder:', err);
    }
  }
  return await recordScoreVideoWithMediaRecorder(canvas, extracted, options, audioContext);
}

/**
 * Records a sheet video by rendering frames onto a canvas and streaming into MediaRecorder.
 */
export async function recordScoreVideoWithMediaRecorder(
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

  // Play Score Music Audio starting at introDurationSec with clean gain staging
  let musicSource: AudioBufferSourceNode | null = null;
  let masterGain: GainNode | null = null;
  if (activeAudioCtx && destNode && extracted.audioBuffer) {
    musicSource = activeAudioCtx.createBufferSource();
    musicSource.buffer = extracted.audioBuffer;

    masterGain = activeAudioCtx.createGain();
    masterGain.gain.setValueAtTime(0.95, activeAudioCtx.currentTime);
    musicSource.connect(masterGain);
    masterGain.connect(destNode);

    musicSource.start(activeAudioCtx.currentTime + introDurationSec);
  }

  // Capture canvas stream
  const canvasStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

  if (destNode) {
    tracks.push(...destNode.stream.getAudioTracks());
  }

  const combinedStream = new MediaStream(tracks);

  const requestedFormat = options.format ?? 'mp4';
  const requestedQuality = options.quality ?? 'compressed';

  const defaultVideoBitrates: Record<ScoreVideoQuality, number> = {
    compact: 750_000,
    compressed: 2_000_000,
    high: 6_000_000,
  };
  const defaultAudioBitrates: Record<ScoreVideoQuality, number> = {
    compact: 112_000,
    compressed: 192_000,
    high: 320_000,
  };

  const videoBitrate = options.videoBitrate ?? defaultVideoBitrates[requestedQuality] ?? 2_000_000;
  const audioBitrate = defaultAudioBitrates[requestedQuality] ?? 192_000;

  // Determine optimal MIME type supported by browser based on requested format
  let mimeType = '';
  if (requestedFormat === 'mp4' && typeof MediaRecorder !== 'undefined') {
    const mp4Types = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1,aac',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/mp4;codecs=avc1,opus',
    ];
    mimeType = mp4Types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  // If mp4 not requested or not supported by browser, use webm
  if (!mimeType) {
    const webmTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    if (typeof MediaRecorder !== 'undefined') {
      mimeType = webmTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';
    } else {
      mimeType = requestedFormat === 'mp4' ? 'video/mp4' : 'video/webm';
    }
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) ? mimeType : undefined,
    videoBitsPerSecond: videoBitrate,
    audioBitsPerSecond: audioBitrate,
    bitsPerSecond: videoBitrate + audioBitrate,
  });

  const recordedChunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    recorder.onerror = (err) => reject(err);

    recorder.onstop = async () => {
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
      const rawBlob = new Blob(recordedChunks, { type: mimeType });
      const finalBlob = (requestedFormat === 'mp4' || mimeType.includes('mp4'))
        ? await repairMp4BoxDurations(rawBlob)
        : rawBlob;
      resolve(finalBlob);
    };

    recorder.start();

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

      // Explicitly request frame capture if supported by track to guarantee exact fps without drops
      try {
        const videoTrack = canvasStream.getVideoTracks()[0];
        (videoTrack as any)?.requestFrame?.();
      } catch {
        // ignore
      }

      onProgress?.({
        currentSec: elapsedSec,
        totalSec: totalDuration,
        percentage: Math.min(99, Math.round((elapsedSec / totalDuration) * 100)),
        phase: 'rendering',
      });
    }, frameIntervalMs);
  });
}
/**
 * Computes the number of decoded audio samples in an Opus packet according to RFC 6716.
 * At 48kHz, this is usually 2880 samples (60ms) for Chrome's MediaRecorder frames.
 */
export function getOpusPacketSampleCount(packet: Uint8Array): number {
  if (!packet || packet.length === 0) return 2880;
  const toc = packet[0];
  const config = toc >> 3;
  const c = toc & 3;

  let frameDurMs: number;
  if (config < 12) {
    frameDurMs = [10, 20, 40, 60][config % 4];
  } else if (config < 16) {
    frameDurMs = [10, 20][config % 2];
  } else {
    frameDurMs = [2.5, 5, 10, 20][config % 4];
  }

  let frames = 1;
  if (c === 0) {
    frames = 1;
  } else if (c === 1 || c === 2) {
    frames = 2;
  } else if (c === 3) {
    frames = packet.length > 1 ? (packet[1] & 0x3f) : 1;
  }

  return Math.round(frameDurMs * frames * 48);
}

interface MoovAudioTrackInfo {
  audioTrackId: number;
  audioTimescale: number;
  audioCodec: string;
  mvhdTimescale: number;
  mvhdDurationMs: number;
  mvhdPos: number;
  audioMdhdDurPos: number;
  audioTkhdDurPos: number;
  isAudioMdhdVer1: boolean;
  isAudioTkhdVer1: boolean;
}

/**
 * Repairs ISO BMFF (MP4) container metadata produced by Chromium's MediaRecorder.
 * 1. Rescales unscaled millisecond durations in mdhd boxes to track timescale.
 * 2. Normalizes fragmented moof sequence numbers (mfhd) to 0-based sequential order.
 * 3. Overwrites jittery wall-clock sample durations in audio trun boxes with the exact
 *    Opus frame PCM sample count (2880 samples at 48kHz) and enforces monotonic tfdt timestamps,
 *    preventing compliant media players (VLC, libopus) from truncating frames and garbling audio.
 * 4. Resynchronizes the exact cumulative audio duration into audio mdhd and tkhd boxes.
 */
export async function repairMp4BoxDurations(blob: Blob): Promise<Blob> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let pos = 0;
    let audioInfo: MoovAudioTrackInfo | null = null;

    // Pass 1: Parse and repair header boxes in 'moov'
    while (pos + 8 <= bytes.length) {
      const size = view.getUint32(pos);
      const type = String.fromCharCode(
        bytes[pos + 4],
        bytes[pos + 5],
        bytes[pos + 6],
        bytes[pos + 7],
      );
      const boxEnd = (size === 1 && pos + 16 <= bytes.length)
        ? (view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12))
        : (size === 0 ? bytes.length : pos + size);

      if (type === 'moov') {
        audioInfo = repairMoovBox(view, bytes, pos, boxEnd - pos);
      }

      if (boxEnd <= pos || boxEnd > bytes.length) break;
      pos = boxEnd;
    }

    // Pass 2: Repair fragmented moof / traf / trun / tfdt boxes
    pos = 0;
    let audioCumTime = 0;
    let moofSeq = 0;

    while (pos + 8 <= bytes.length) {
      const size = view.getUint32(pos);
      const type = String.fromCharCode(
        bytes[pos + 4],
        bytes[pos + 5],
        bytes[pos + 6],
        bytes[pos + 7],
      );
      const boxEnd = (size === 1 && pos + 16 <= bytes.length)
        ? (view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12))
        : (size === 0 ? bytes.length : pos + size);

      if (type === 'moof') {
        const moofPos = pos;
        let mPos = pos + 8;
        while (mPos + 8 <= boxEnd) {
          const bSize = view.getUint32(mPos);
          const bType = String.fromCharCode(
            bytes[mPos + 4],
            bytes[mPos + 5],
            bytes[mPos + 6],
            bytes[mPos + 7],
          );
          const bEnd = mPos + bSize;

          if (bType === 'mfhd' && mPos + 16 <= bEnd) {
            // Set 0-based sequential sequence number to eliminate discontinuity warnings
            view.setUint32(mPos + 12, moofSeq++);
          } else if (bType === 'traf') {
            let tPos = mPos + 8;
            let isAudioTraf = false;
            let tfdtPos = -1;
            let trunPos = -1;

            while (tPos + 8 <= bEnd) {
              const tSize = view.getUint32(tPos);
              const tType = String.fromCharCode(
                bytes[tPos + 4],
                bytes[tPos + 5],
                bytes[tPos + 6],
                bytes[tPos + 7],
              );
              if (tType === 'tfhd' && tPos + 16 <= bEnd) {
                const tid = view.getUint32(tPos + 12);
                if (audioInfo ? tid === audioInfo.audioTrackId : tid === 2) {
                  isAudioTraf = true;
                }
              } else if (tType === 'tfdt') {
                tfdtPos = tPos;
              } else if (tType === 'trun') {
                trunPos = tPos;
              }
              if (tSize <= 0 || tPos + tSize > bEnd) break;
              tPos += tSize;
            }

            if (isAudioTraf && trunPos >= 0) {
              if (tfdtPos >= 0 && tfdtPos + 16 <= bEnd) {
                const ver = bytes[tfdtPos + 8];
                if (ver === 0) {
                  view.setUint32(tfdtPos + 12, audioCumTime);
                } else if (tfdtPos + 20 <= bEnd) {
                  view.setUint32(tfdtPos + 12, Math.floor(audioCumTime / 4294967296));
                  view.setUint32(tfdtPos + 16, audioCumTime >>> 0);
                }
              }

              const flags = (bytes[trunPos + 9] << 16) | (bytes[trunPos + 10] << 8) | bytes[trunPos + 11];
              const sampleCount = view.getUint32(trunPos + 12);
              let p = trunPos + 16;
              let dataOffset = 0;
              if ((flags & 0x01) && p + 4 <= bEnd) {
                dataOffset = view.getInt32(p);
                p += 4;
              }
              if (flags & 0x04) p += 4;

              let packetDataPos = moofPos + dataOffset;
              for (let i = 0; i < sampleCount; i++) {
                let durPos = -1;
                if (flags & 0x100) {
                  durPos = p;
                  p += 4;
                }
                let sampleSize = 0;
                if (flags & 0x200) {
                  sampleSize = view.getUint32(p);
                  p += 4;
                }
                if (flags & 0x400) p += 4;
                if (flags & 0x800) p += 4;

                let exactSamples = 2880;
                if (sampleSize > 0 && packetDataPos + sampleSize <= bytes.length) {
                  const pkt = bytes.subarray(packetDataPos, packetDataPos + sampleSize);
                  exactSamples = getOpusPacketSampleCount(pkt);
                } else if (audioInfo?.audioCodec?.toLowerCase().includes('mp4a')) {
                  exactSamples = 1024;
                }

                if (durPos >= 0 && durPos + 4 <= bEnd) {
                  view.setUint32(durPos, exactSamples);
                }
                audioCumTime += exactSamples;
                packetDataPos += sampleSize;
              }
            }
          }

          if (bSize <= 0 || mPos + bSize > boxEnd) break;
          mPos += bSize;
        }
      }

      if (boxEnd <= pos || boxEnd > bytes.length) break;
      pos = boxEnd;
    }

    // Pass 3: Re-align audio header duration in moov if audio samples were processed
    if (audioInfo && audioCumTime > 0 && audioInfo.audioTimescale > 0) {
      if (audioInfo.audioMdhdDurPos >= 0) {
        if (audioInfo.isAudioMdhdVer1) {
          view.setUint32(audioInfo.audioMdhdDurPos, Math.floor(audioCumTime / 4294967296));
          view.setUint32(audioInfo.audioMdhdDurPos + 4, audioCumTime >>> 0);
        } else {
          view.setUint32(audioInfo.audioMdhdDurPos, audioCumTime >>> 0);
        }
      }
      if (audioInfo.audioTkhdDurPos >= 0) {
        const durMvhdUnits = Math.round((audioCumTime / audioInfo.audioTimescale) * audioInfo.mvhdTimescale);
        if (audioInfo.isAudioTkhdVer1) {
          view.setUint32(audioInfo.audioTkhdDurPos, Math.floor(durMvhdUnits / 4294967296));
          view.setUint32(audioInfo.audioTkhdDurPos + 4, durMvhdUnits >>> 0);
        } else {
          view.setUint32(audioInfo.audioTkhdDurPos, durMvhdUnits >>> 0);
        }
      }
    }

    return new Blob([bytes], { type: blob.type || 'video/mp4' });
  } catch (err) {
    console.warn('repairMp4BoxDurations warning:', err);
    return blob;
  }
}

function repairMoovBox(
  view: DataView,
  bytes: Uint8Array,
  moovPos: number,
  moovSize: number,
): MoovAudioTrackInfo | null {
  let mvhdTimescale = 1000;
  let mvhdDurationMs = 0;
  let mvhdBoxPos = -1;

  const pos = moovPos + 8;
  const end = Math.min(bytes.length, moovPos + moovSize);

  // 1. Scan for mvhd to get authoritative duration in milliseconds
  let scanPos = pos;
  while (scanPos + 8 <= end) {
    const bSize = view.getUint32(scanPos);
    const bType = String.fromCharCode(
      bytes[scanPos + 4],
      bytes[scanPos + 5],
      bytes[scanPos + 6],
      bytes[scanPos + 7],
    );

    if (bType === 'mvhd') {
      mvhdBoxPos = scanPos;
      const ver = bytes[scanPos + 8];
      if (ver === 0 && scanPos + 28 <= end) {
        mvhdTimescale = view.getUint32(scanPos + 20) || 1000;
        const dur = view.getUint32(scanPos + 24);
        mvhdDurationMs = (dur / mvhdTimescale) * 1000;
      } else if (ver === 1 && scanPos + 40 <= end) {
        mvhdTimescale = view.getUint32(scanPos + 28) || 1000;
        const durHi = view.getUint32(scanPos + 32);
        const durLo = view.getUint32(scanPos + 36);
        const dur = durHi * 4294967296 + durLo;
        mvhdDurationMs = (dur / mvhdTimescale) * 1000;
      }
      break;
    }

    if (bSize <= 0 || scanPos + bSize > end) break;
    scanPos += bSize;
  }

  if (mvhdDurationMs <= 0) return null;

  let audioTrackId = 2;
  let audioTimescale = 48000;
  let audioCodec = 'opus';
  let audioMdhdDurPos = -1;
  let audioTkhdDurPos = -1;
  let isAudioMdhdVer1 = false;
  let isAudioTkhdVer1 = false;

  // 2. Scan all trak boxes and repair their tkhd and mdhd durations
  scanPos = pos;
  while (scanPos + 8 <= end) {
    const bSize = view.getUint32(scanPos);
    const bType = String.fromCharCode(
      bytes[scanPos + 4],
      bytes[scanPos + 5],
      bytes[scanPos + 6],
      bytes[scanPos + 7],
    );

    if (bType === 'trak') {
      const trakInfo = repairTrakBox(view, bytes, scanPos, bSize, mvhdDurationMs);
      if (trakInfo?.isAudio) {
        audioTrackId = trakInfo.trackId;
        audioTimescale = trakInfo.timescale;
        audioCodec = trakInfo.codec;
        audioMdhdDurPos = trakInfo.mdhdDurPos;
        audioTkhdDurPos = trakInfo.tkhdDurPos;
        isAudioMdhdVer1 = trakInfo.isMdhdVer1;
        isAudioTkhdVer1 = trakInfo.isTkhdVer1;
      }
    }

    if (bSize <= 0 || scanPos + bSize > end) break;
    scanPos += bSize;
  }

  return {
    audioTrackId,
    audioTimescale,
    audioCodec,
    mvhdTimescale,
    mvhdDurationMs,
    mvhdPos: mvhdBoxPos,
    audioMdhdDurPos,
    audioTkhdDurPos,
    isAudioMdhdVer1,
    isAudioTkhdVer1,
  };
}

interface TrakRepairResult {
  trackId: number;
  isAudio: boolean;
  timescale: number;
  codec: string;
  mdhdDurPos: number;
  tkhdDurPos: number;
  isMdhdVer1: boolean;
  isTkhdVer1: boolean;
}

function repairTrakBox(
  view: DataView,
  bytes: Uint8Array,
  trakPos: number,
  trakSize: number,
  mvhdDurationMs: number,
): TrakRepairResult | null {
  const end = Math.min(bytes.length, trakPos + trakSize);
  let pos = trakPos + 8;
  let trackId = 0;
  let tkhdDurPos = -1;
  let isTkhdVer1 = false;
  let mdiaResult: { isAudio: boolean; timescale: number; codec: string; mdhdDurPos: number; isMdhdVer1: boolean } | null = null;

  while (pos + 8 <= end) {
    const bSize = view.getUint32(pos);
    const bType = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );

    if (bType === 'tkhd') {
      const ver = bytes[pos + 8];
      isTkhdVer1 = (ver === 1);
      if (ver === 0 && pos + 32 <= end) {
        trackId = view.getUint32(pos + 20);
        tkhdDurPos = pos + 28;
        view.setUint32(pos + 28, Math.round(mvhdDurationMs));
      } else if (ver === 1 && pos + 44 <= end) {
        trackId = view.getUint32(pos + 28);
        tkhdDurPos = pos + 36;
        const dur = Math.round(mvhdDurationMs);
        view.setUint32(pos + 36, Math.floor(dur / 4294967296));
        view.setUint32(pos + 40, dur >>> 0);
      }
    } else if (bType === 'mdia') {
      mdiaResult = repairMdiaBox(view, bytes, pos, bSize, mvhdDurationMs);
    }

    if (bSize <= 0 || pos + bSize > end) break;
    pos += bSize;
  }

  return {
    trackId,
    isAudio: mdiaResult?.isAudio ?? false,
    timescale: mdiaResult?.timescale ?? 48000,
    codec: mdiaResult?.codec ?? '',
    mdhdDurPos: mdiaResult?.mdhdDurPos ?? -1,
    tkhdDurPos,
    isMdhdVer1: mdiaResult?.isMdhdVer1 ?? false,
    isTkhdVer1,
  };
}

function repairMdiaBox(
  view: DataView,
  bytes: Uint8Array,
  mdiaPos: number,
  mdiaSize: number,
  mvhdDurationMs: number,
): { isAudio: boolean; timescale: number; codec: string; mdhdDurPos: number; isMdhdVer1: boolean } {
  const end = Math.min(bytes.length, mdiaPos + mdiaSize);
  let pos = mdiaPos + 8;
  let isAudio = false;
  let timescale = 1000;
  let codec = '';
  let mdhdDurPos = -1;
  let isMdhdVer1 = false;

  while (pos + 8 <= end) {
    const bSize = view.getUint32(pos);
    const bType = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );

    if (bType === 'hdlr' && pos + 20 <= end) {
      const hdlrType = String.fromCharCode(
        bytes[pos + 16],
        bytes[pos + 17],
        bytes[pos + 18],
        bytes[pos + 19],
      );
      if (hdlrType === 'soun') {
        isAudio = true;
      }
    } else if (bType === 'mdhd') {
      const ver = bytes[pos + 8];
      isMdhdVer1 = (ver === 1);
      if (ver === 0 && pos + 28 <= end) {
        timescale = view.getUint32(pos + 20) || 1000;
        mdhdDurPos = pos + 24;
        const currentDur = view.getUint32(pos + 24);
        if (timescale > 1000 && currentDur <= mvhdDurationMs * 1.5) {
          const scaledDur = Math.round((mvhdDurationMs / 1000) * timescale);
          view.setUint32(pos + 24, scaledDur);
        }
      } else if (ver === 1 && pos + 40 <= end) {
        timescale = view.getUint32(pos + 28) || 1000;
        mdhdDurPos = pos + 32;
        const currentDurHi = view.getUint32(pos + 32);
        const currentDurLo = view.getUint32(pos + 36);
        const currentDur = currentDurHi * 4294967296 + currentDurLo;
        if (timescale > 1000 && currentDur <= mvhdDurationMs * 1.5) {
          const scaledDur = Math.round((mvhdDurationMs / 1000) * timescale);
          view.setUint32(pos + 32, Math.floor(scaledDur / 4294967296));
          view.setUint32(pos + 36, scaledDur >>> 0);
        }
      }
    } else if (bType === 'minf') {
      let iPos = pos + 8;
      while (iPos + 8 <= pos + bSize) {
        const iSize = view.getUint32(iPos);
        const iType = String.fromCharCode(bytes[iPos + 4], bytes[iPos + 5], bytes[iPos + 6], bytes[iPos + 7]);
        if (iType === 'stbl') {
          let sPos = iPos + 8;
          while (sPos + 8 <= iPos + iSize) {
            const sSize = view.getUint32(sPos);
            const sType = String.fromCharCode(bytes[sPos + 4], bytes[sPos + 5], bytes[sPos + 6], bytes[sPos + 7]);
            if (sType === 'stsd' && sSize >= 24 && sPos + 24 <= sPos + sSize) {
              codec = String.fromCharCode(bytes[sPos + 20], bytes[sPos + 21], bytes[sPos + 22], bytes[sPos + 23]);
            }
            if (sSize <= 0 || sPos + sSize > iPos + iSize) break;
            sPos += sSize;
          }
        }
        if (iSize <= 0 || iPos + iSize > pos + bSize) break;
        iPos += iSize;
      }
    }

    if (bSize <= 0 || pos + bSize > end) break;
    pos += bSize;
  }

  return { isAudio, timescale, codec, mdhdDurPos, isMdhdVer1 };
}
