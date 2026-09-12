/**
 * Orchestrator for extracting score systems, synthesizing count-in & music audio,
 * driving the canvas renderer, and recording via MediaRecorder.
 */

import { ScoreVideoTimeline, type ScoreSystemBBox, type ScoreNoteEvent } from './scoreVideoTimeline';
import {
  ScoreVideoRenderer,
  type ScoreVideoRenderOptions,
  type RenderableSystem,
} from './scoreVideoRenderer';

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
}

/**
 * Extracts system bounding boxes and renders high-res Image slices from an abcjs SVG element.
 */
export async function extractScoreSystems(
  svgElement: SVGSVGElement,
  totalScoreTimeSec: number = 60,
): Promise<ExtractedScoreData> {
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
    const height = Math.max(60, bottom - top);

    const bbox: ScoreSystemBBox = {
      systemIndex: i,
      lineClass,
      minMeasure,
      maxMeasure,
      top,
      bottom,
      height,
      left: 10,
      width: Math.max(100, svgWidth - 20),
    };

    systems.push(bbox);

    // Create high-res SVG image slice for this system
    let image: HTMLImageElement | null = null;
    if (typeof document !== 'undefined') {
      try {
        const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('viewBox', `0 ${top} ${svgWidth} ${height}`);
        svgClone.setAttribute('width', `${svgWidth}`);
        svgClone.setAttribute('height', `${height}`);

        const xml = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode().catch(() => {});
        image = img;
      } catch {
        image = null;
      }
    }

    systemImages.push({
      systemIndex: i,
      bbox,
      image,
    });
  }

  // Extract note timing events if present in SVG
  const noteEvents: ScoreNoteEvent[] = [];
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

  return {
    systems,
    noteEvents,
    systemImages,
    totalScoreTimeSec,
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
  audioSourceNode?: AudioNode | null,
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

  // Prepare Audio Stream
  let destNode: MediaStreamAudioDestinationNode | null = null;
  let activeAudioCtx = audioContext;

  if (typeof window !== 'undefined' && window.AudioContext) {
    if (!activeAudioCtx) {
      activeAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (activeAudioCtx) {
      destNode = activeAudioCtx.createMediaStreamDestination();
      if (audioSourceNode) {
        audioSourceNode.connect(destNode);
      }
    }
  }

  // Setup count-in audio beeps during intro
  const scheduleCountInBeeps = (audioCtx: AudioContext, dest: MediaStreamAudioDestinationNode) => {
    if (introDurationSec <= 0) return;
    const tempo = options.metadata.tempoBpm ?? 120;
    const beatInterval = 60 / tempo;
    const countInBeats = 4;
    const countInDuration = Math.min(introDurationSec, beatInterval * countInBeats);
    const startSec = introDurationSec - countInDuration;

    for (let i = 0; i < countInBeats; i++) {
      const beatTime = activeAudioCtx!.currentTime + startSec + i * beatInterval;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.frequency.setValueAtTime(i === 0 ? 1000 : 800, beatTime);
      gain.gain.setValueAtTime(0.25, beatTime);
      gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.08);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(beatTime);
      osc.stop(beatTime + 0.09);
    }
  };

  if (activeAudioCtx && destNode) {
    scheduleCountInBeeps(activeAudioCtx, destNode);
  }

  // Capture canvas stream
  const canvasStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

  if (destNode) {
    tracks.push(...destNode.stream.getAudioTracks());
  }

  const combinedStream = new MediaStream(tracks);

  // Determine optimal MIME type
  let mimeType = 'video/webm;codecs=vp9,opus';
  if (typeof MediaRecorder !== 'undefined') {
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('video/webm')) {
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

    // Frame rendering loop
    const frameIntervalMs = 1000 / fps;
    let currentTimeSec = 0;

    const interval = setInterval(() => {
      if (currentTimeSec > totalDuration) {
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

      const frameState = timeline.getFrameState(currentTimeSec);
      renderer.renderFrame(ctx, frameState, extracted.systemImages);

      onProgress?.({
        currentSec: currentTimeSec,
        totalSec: totalDuration,
        percentage: Math.min(99, Math.round((currentTimeSec / totalDuration) * 100)),
        phase: 'rendering',
      });

      currentTimeSec += frameIntervalMs / 1000;
    }, frameIntervalMs);
  });
}
