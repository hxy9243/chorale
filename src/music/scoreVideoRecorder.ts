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
export type ScoreVideoQuality = 'compressed' | 'high';

export interface ScoreVideoExportOptions extends ScoreVideoRenderOptions {
  introDurationSec: number;
  outroDurationSec: number;
  fps?: number;
  format?: ScoreVideoFormat;
  quality?: ScoreVideoQuality;
  videoBitrate?: number;
  onProgress?: (progress: ScoreVideoExportProgress) => void;
}

/**
 * Checks if the current browser environment supports MP4 video recording via MediaRecorder.
 */
export function isMp4RecordingSupported(): boolean {
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
  const videoBitrate = options.videoBitrate ?? (requestedQuality === 'compressed' ? 2_000_000 : 6_000_000);
  const audioBitrate = requestedQuality === 'compressed' ? 192_000 : 320_000;

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
 * Repairs ISO BMFF (MP4) container metadata produced by Chromium's MediaRecorder.
 * Chromium has a known bug where track media header (mdhd) boxes have their duration
 * values written in milliseconds instead of being scaled by the track timescale
 * (e.g. 50,000 instead of 50,000 * 48 for a 48kHz audio track).
 * This causes media players (VLC, GStreamer, Totem, QuickTime, Windows Media Player)
 * to report a ~1-second duration on the audio track and fail with garbled/stuttering sound
 * or immediate EOS.
 */
export async function repairMp4BoxDurations(blob: Blob): Promise<Blob> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let pos = 0;
    while (pos + 8 <= bytes.length) {
      const size = view.getUint32(pos);
      const type = String.fromCharCode(
        bytes[pos + 4],
        bytes[pos + 5],
        bytes[pos + 6],
        bytes[pos + 7],
      );

      if (type === 'moov') {
        repairMoovBox(view, bytes, pos, size);
        break;
      }

      if (size === 1 && pos + 16 <= bytes.length) {
        const hi = view.getUint32(pos + 8);
        const lo = view.getUint32(pos + 12);
        pos += hi * 2 ** 32 + lo;
      } else if (size === 0 || size > bytes.length - pos) {
        break;
      } else {
        pos += size;
      }
    }

    return new Blob([bytes], { type: blob.type || 'video/mp4' });
  } catch (err) {
    console.warn('repairMp4BoxDurations warning:', err);
    return blob;
  }
}

function repairMoovBox(view: DataView, bytes: Uint8Array, moovPos: number, moovSize: number): void {
  let mvhdTimescale = 1000;
  let mvhdDurationMs = 0;

  const pos = moovPos + 8;
  const end = Math.min(bytes.length, moovPos + moovSize);

  // 1. Scan for mvhd to get the authoritative duration in milliseconds
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
      const ver = bytes[scanPos + 8];
      if (ver === 0 && scanPos + 28 <= end) {
        mvhdTimescale = view.getUint32(scanPos + 20) || 1000;
        const dur = view.getUint32(scanPos + 24);
        mvhdDurationMs = (dur / mvhdTimescale) * 1000;
      } else if (ver === 1 && scanPos + 40 <= end) {
        mvhdTimescale = view.getUint32(scanPos + 28) || 1000;
        const durHi = view.getUint32(scanPos + 32);
        const durLo = view.getUint32(scanPos + 36);
        const dur = durHi * 2 ** 32 + durLo;
        mvhdDurationMs = (dur / mvhdTimescale) * 1000;
      }
      break;
    }

    if (bSize <= 0 || scanPos + bSize > end) break;
    scanPos += bSize;
  }

  if (mvhdDurationMs <= 0) return;

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
      repairTrakBox(view, bytes, scanPos, bSize, mvhdDurationMs);
    }

    if (bSize <= 0 || scanPos + bSize > end) break;
    scanPos += bSize;
  }
}

function repairTrakBox(
  view: DataView,
  bytes: Uint8Array,
  trakPos: number,
  trakSize: number,
  mvhdDurationMs: number,
): void {
  const end = Math.min(bytes.length, trakPos + trakSize);
  let pos = trakPos + 8;

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
      if (ver === 0 && pos + 32 <= end) {
        view.setUint32(pos + 28, Math.round(mvhdDurationMs));
      } else if (ver === 1 && pos + 44 <= end) {
        const dur = Math.round(mvhdDurationMs);
        view.setUint32(pos + 36, Math.floor(dur / 2 ** 32));
        view.setUint32(pos + 40, dur >>> 0);
      }
    } else if (bType === 'mdia') {
      repairMdiaBox(view, bytes, pos, bSize, mvhdDurationMs);
    }

    if (bSize <= 0 || pos + bSize > end) break;
    pos += bSize;
  }
}

function repairMdiaBox(
  view: DataView,
  bytes: Uint8Array,
  mdiaPos: number,
  mdiaSize: number,
  mvhdDurationMs: number,
): void {
  const end = Math.min(bytes.length, mdiaPos + mdiaSize);
  let pos = mdiaPos + 8;

  while (pos + 8 <= end) {
    const bSize = view.getUint32(pos);
    const bType = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );

    if (bType === 'mdhd') {
      const ver = bytes[pos + 8];
      if (ver === 0 && pos + 28 <= end) {
        const timescale = view.getUint32(pos + 20) || 1000;
        const currentDur = view.getUint32(pos + 24);
        if (timescale > 1000 && currentDur <= mvhdDurationMs * 1.5) {
          const scaledDur = Math.round((mvhdDurationMs / 1000) * timescale);
          view.setUint32(pos + 24, scaledDur);
        }
      } else if (ver === 1 && pos + 40 <= end) {
        const timescale = view.getUint32(pos + 28) || 1000;
        const currentDurHi = view.getUint32(pos + 32);
        const currentDurLo = view.getUint32(pos + 36);
        const currentDur = currentDurHi * 2 ** 32 + currentDurLo;
        if (timescale > 1000 && currentDur <= mvhdDurationMs * 1.5) {
          const scaledDur = Math.round((mvhdDurationMs / 1000) * timescale);
          view.setUint32(pos + 32, Math.floor(scaledDur / 2 ** 32));
          view.setUint32(pos + 36, scaledDur >>> 0);
        }
      }
    }

    if (bSize <= 0 || pos + bSize > end) break;
    pos += bSize;
  }
}
