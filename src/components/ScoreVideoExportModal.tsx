import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Download, X, Film, Loader2 } from 'lucide-react';
import {
  extractScoreSystems,
  recordScoreVideo,
  getEstimatedScoreVideoSize,
  type ExtractedScoreData,
  type ScoreVideoExportProgress,
  type ScoreVideoFormat,
  type ScoreVideoQuality,
} from '../music/scoreVideoRecorder';
import {
  ScoreVideoTimeline,
} from '../music/scoreVideoTimeline';
import {
  ScoreVideoRenderer,
  type ScoreVideoTheme,
  type ScoreVideoAspectRatio,
} from '../music/scoreVideoRenderer';

export interface ScoreVideoExportModalProps {
  open: boolean;
  onClose: () => void;
  scoreTitle: string;
  composer?: string;
  keySignature?: string;
  meter?: string;
  tempoBpm?: number;
  abcSource?: string;
  svgContainerSelector?: string;
}

export const ScoreVideoExportModal: React.FC<ScoreVideoExportModalProps> = ({
  open,
  onClose,
  scoreTitle,
  composer,
  keySignature = 'C',
  meter = '4/4',
  tempoBpm = 120,
  abcSource,
  svgContainerSelector = '#paper svg',
}) => {
  const [format, setFormat] = useState<ScoreVideoFormat>('mp4');
  const [quality, setQuality] = useState<ScoreVideoQuality>('compact');
  const [aspectRatio, setAspectRatio] = useState<ScoreVideoAspectRatio>('16:9');
  const [theme, setTheme] = useState<ScoreVideoTheme>('dark');
  const [introDurationSec, setIntroDurationSec] = useState<number>(3);
  const [outroDurationSec, setOutroDurationSec] = useState<number>(2);

  const [extractedData, setExtractedData] = useState<ExtractedScoreData | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewTimeSec, setPreviewTimeSec] = useState<number>(0);
  const [exportProgress, setExportProgress] = useState<ScoreVideoExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const previewTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Synchronize refs with state
  isPlayingRef.current = isPreviewPlaying;
  previewTimeRef.current = previewTimeSec;

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }
    return audioContextRef.current;
  }, []);

  const stopPreviewAudio = useCallback(() => {
    if (previewAudioSourceRef.current) {
      try {
        previewAudioSourceRef.current.stop();
      } catch {
        // ignore
      }
      previewAudioSourceRef.current = null;
    }
  }, []);

  // Extract score data and synthesize audio buffer when modal opens or theme/source changes
  useEffect(() => {
    let cancelled = false;

    if (!open) {
      stopPreviewAudio();
      setExtractedData(null);
      setIsPreviewPlaying(false);
      setPreviewTimeSec(0);
      setExportProgress(null);
      setIsExporting(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const audioCtx = getAudioContext();
    const sourceToExtract = abcSource || document.querySelector<SVGSVGElement>(svgContainerSelector) || '';

    if (sourceToExtract) {
      void extractScoreSystems(sourceToExtract, theme, audioCtx).then((data) => {
        if (!cancelled) {
          setExtractedData(data);
        }
      });
    } else {
      // Fallback empty data if no source is available
      setExtractedData({
        systems: [
          {
            systemIndex: 0,
            lineClass: 'abcjs-l0',
            minMeasure: 1,
            maxMeasure: 4,
            top: 20,
            bottom: 140,
            height: 120,
            left: 20,
            width: 700,
          },
          {
            systemIndex: 1,
            lineClass: 'abcjs-l1',
            minMeasure: 5,
            maxMeasure: 8,
            top: 160,
            bottom: 280,
            height: 120,
            left: 20,
            width: 700,
          },
        ],
        noteEvents: [],
        systemImages: [],
        totalScoreTimeSec: 30,
      });
    }

    return () => {
      cancelled = true;
    };
  }, [open, abcSource, theme, svgContainerSelector, getAudioContext, stopPreviewAudio]);

  const previewTimeline = React.useMemo(() => {
    return new ScoreVideoTimeline(
      {
        introDurationSec,
        outroDurationSec,
        scoreDurationSec: extractedData?.totalScoreTimeSec ?? 30,
        tempoBpm,
      },
      extractedData?.systems ?? [],
      extractedData?.noteEvents ?? [],
    );
  }, [introDurationSec, outroDurationSec, extractedData, tempoBpm]);

  const totalDuration = previewTimeline.totalDurationSec;

  const currentEstimate = getEstimatedScoreVideoSize(totalDuration, quality, format);
  const compactEstimate = getEstimatedScoreVideoSize(totalDuration, 'compact', format);
  const compressedEstimate = getEstimatedScoreVideoSize(totalDuration, 'compressed', format);
  const highEstimate = getEstimatedScoreVideoSize(totalDuration, 'high', format);

  // Render preview frame onto preview canvas
  const renderPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = aspectRatio === '16:9' ? 960 : 540;
    const height = aspectRatio === '16:9' ? 540 : 960;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const renderer = new ScoreVideoRenderer({
      width,
      height,
      theme,
      aspectRatio,
      metadata: {
        title: scoreTitle || 'Untitled Score',
        composer,
        key: keySignature,
        meter,
        tempoBpm,
      },
    });

    const frameState = previewTimeline.getFrameState(previewTimeRef.current);
    renderer.renderFrame(ctx, frameState, extractedData?.systemImages ?? []);
  }, [aspectRatio, theme, scoreTitle, composer, keySignature, meter, tempoBpm, previewTimeline, extractedData]);

  // Re-render preview on state or time changes
  useEffect(() => {
    renderPreview();
  }, [renderPreview, previewTimeSec]);

  // Toggle preview playback with audio
  const handleTogglePlayPreview = useCallback(() => {
    const nextPlaying = !isPlayingRef.current;
    setIsPreviewPlaying(nextPlaying);

    if (nextPlaying) {
      const audioCtx = getAudioContext();
      if (audioCtx) {
        if (audioCtx.state === 'suspended') {
          void audioCtx.resume();
        }
        if (extractedData?.audioBuffer) {
          stopPreviewAudio();
          const src = audioCtx.createBufferSource();
          src.buffer = extractedData.audioBuffer;
          src.connect(audioCtx.destination);
          const currentTime = previewTimeRef.current;
          if (currentTime < introDurationSec) {
            const delay = introDurationSec - currentTime;
            src.start(audioCtx.currentTime + delay, 0);
          } else {
            const offset = currentTime - introDurationSec;
            src.start(0, offset);
          }
          previewAudioSourceRef.current = src;
        }
      }
    } else {
      stopPreviewAudio();
    }
  }, [getAudioContext, extractedData?.audioBuffer, introDurationSec, stopPreviewAudio]);

  // Animation loop for preview playback
  useEffect(() => {
    if (!isPreviewPlaying) {
      stopPreviewAudio();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    lastFrameTimeRef.current = performance.now();

    const loop = (now: number) => {
      const deltaSec = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      const next = previewTimeRef.current + deltaSec;
      if (next >= totalDuration) {
        setIsPreviewPlaying(false);
        stopPreviewAudio();
        setPreviewTimeSec(0);
        return;
      }

      setPreviewTimeSec(next);
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPreviewPlaying, totalDuration, stopPreviewAudio]);

  // Export video handler
  const handleExport = async () => {
    if (!extractedData) return;
    setIsPreviewPlaying(false);
    stopPreviewAudio();
    setIsExporting(true);

    try {
      const audioCtx = getAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch {
          // ignore
        }
      }

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.style.position = 'fixed';
      offscreenCanvas.style.left = '-9999px';
      offscreenCanvas.style.top = '-9999px';
      offscreenCanvas.style.visibility = 'hidden';
      offscreenCanvas.style.pointerEvents = 'none';
      document.body.appendChild(offscreenCanvas);

      try {
        const isCompact = quality === 'compact';
        const width = isCompact
          ? (aspectRatio === '16:9' ? 1280 : 720)
          : (aspectRatio === '16:9' ? 1920 : 1080);
        const height = isCompact
          ? (aspectRatio === '16:9' ? 720 : 1280)
          : (aspectRatio === '16:9' ? 1080 : 1920);

        const videoBlob = await recordScoreVideo(
          offscreenCanvas,
          extractedData,
          {
            width,
            height,
            theme,
            aspectRatio,
            format,
            quality,
            introDurationSec,
            outroDurationSec,
            metadata: {
              title: scoreTitle,
              composer,
              key: keySignature,
              meter,
              tempoBpm,
            },
            fps: 30,
            onProgress: (p) => setExportProgress(p),
          },
          audioCtx,
        );

        // Trigger download with appropriate extension
        const sanitizedTitle = (scoreTitle || 'score')
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_')
          .replace(/_+/g, '_');
        const isMp4 = videoBlob.type.includes('mp4');
        const extension = isMp4 ? 'mp4' : 'webm';
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizedTitle}-video.${extension}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } finally {
        offscreenCanvas.remove();
      }
    } catch (err) {
      console.error('Failed to export score video:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop video-export-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-export-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) {
          stopPreviewAudio();
          onClose();
        }
      }}
    >
      <div className="modal-content video-export-modal-content">
        <div className="modal-header">
          <div className="modal-header-title-group">
            <Film size={20} className="modal-header-icon" />
            <h2 id="video-export-modal-title" className="modal-title">Export Sheet Video</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => {
              stopPreviewAudio();
              onClose();
            }}
            disabled={isExporting}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="video-export-body">
          {/* Left Column: Interactive Video Preview Player */}
          <div className="video-preview-pane">
            <div
              className={`video-canvas-container ${aspectRatio === '9:16' ? 'aspect-portrait' : 'aspect-landscape'}`}
            >
              <canvas
                ref={previewCanvasRef}
                className="video-preview-canvas"
                style={{
                  aspectRatio: aspectRatio === '16:9' ? '16 / 9' : '9 / 16',
                }}
              />
            </div>

            {/* Transport Controls */}
            <div className="video-preview-transport">
              <button
                type="button"
                className="btn-circle btn-play-preview"
                onClick={handleTogglePlayPreview}
                disabled={isExporting}
                aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
              >
                {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <button
                type="button"
                className="btn-circle btn-reset-preview"
                onClick={() => {
                  stopPreviewAudio();
                  setIsPreviewPlaying(false);
                  setPreviewTimeSec(0);
                }}
                disabled={isExporting}
                aria-label="Reset preview"
              >
                <RotateCcw size={15} />
              </button>

              <input
                type="range"
                min={0}
                max={totalDuration}
                step={0.1}
                value={previewTimeSec}
                onChange={(e) => {
                  stopPreviewAudio();
                  setIsPreviewPlaying(false);
                  setPreviewTimeSec(Number(e.target.value));
                }}
                className="video-preview-scrubber"
                disabled={isExporting}
              />

              <span className="video-preview-time">
                {Math.floor(previewTimeSec)}s / {Math.floor(totalDuration)}s
              </span>
            </div>
          </div>

          {/* Right Column: Settings & Configuration */}
          <div className="video-options-pane">
            <div className="option-section">
              <label className="option-label">Video Format</label>
              <div className="option-toggle-group">
                <button
                  type="button"
                  className={`option-toggle-btn ${format === 'mp4' ? 'active' : ''}`}
                  onClick={() => setFormat('mp4')}
                  disabled={isExporting}
                >
                  MP4 (.mp4)
                  <span className="option-hint">Universal (iOS, Android, Social)</span>
                </button>
                <button
                  type="button"
                  className={`option-toggle-btn ${format === 'webm' ? 'active' : ''}`}
                  onClick={() => setFormat('webm')}
                  disabled={isExporting}
                >
                  WebM (.webm)
                  <span className="option-hint">Open Web Standard</span>
                </button>
              </div>
            </div>

            <div className="option-section">
              <div className="option-label-group">
                <label className="option-label">Compression & Quality</label>
                <span className="option-estimate-pill" data-testid="video-estimate-pill">
                  Est. {currentEstimate.formatted}
                </span>
              </div>
              <div className="option-toggle-group option-toggle-three">
                <button
                  type="button"
                  className={`option-toggle-btn ${quality === 'compact' ? 'active' : ''}`}
                  onClick={() => setQuality('compact')}
                  disabled={isExporting}
                >
                  Compact
                  <span className="option-hint">720p · {compactEstimate.formatted}</span>
                </button>
                <button
                  type="button"
                  className={`option-toggle-btn ${quality === 'compressed' ? 'active' : ''}`}
                  onClick={() => setQuality('compressed')}
                  disabled={isExporting}
                >
                  Compressed
                  <span className="option-hint">1080p · {compressedEstimate.formatted}</span>
                </button>
                <button
                  type="button"
                  className={`option-toggle-btn ${quality === 'high' ? 'active' : ''}`}
                  onClick={() => setQuality('high')}
                  disabled={isExporting}
                >
                  High Quality
                  <span className="option-hint">1080p · {highEstimate.formatted}</span>
                </button>
              </div>
            </div>

            <div className="option-section">
              <label className="option-label">Aspect Ratio</label>
              <div className="option-toggle-group">
                <button
                  type="button"
                  className={`option-toggle-btn ${aspectRatio === '16:9' ? 'active' : ''}`}
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isExporting}
                >
                  16:9 Landscape
                  <span className="option-hint">YouTube / Desktop</span>
                </button>
                <button
                  type="button"
                  className={`option-toggle-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isExporting}
                >
                  9:16 Portrait
                  <span className="option-hint">Shorts / Reels</span>
                </button>
              </div>
            </div>

            <div className="option-section">
              <label className="option-label">Theme</label>
              <div className="option-toggle-group">
                <button
                  type="button"
                  className={`option-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  disabled={isExporting}
                >
                  Modern Dark
                </button>
                <button
                  type="button"
                  className={`option-toggle-btn ${theme === 'warm' ? 'active' : ''}`}
                  onClick={() => setTheme('warm')}
                  disabled={isExporting}
                >
                  Warm Paper
                </button>
              </div>
            </div>

            <div className="option-grid-two">
              <div className="option-section">
                <label className="option-label">Intro Card & Count-in</label>
                <select
                  value={introDurationSec}
                  onChange={(e) => setIntroDurationSec(Number(e.target.value))}
                  disabled={isExporting}
                  className="option-select"
                >
                  <option value={0}>None (0s)</option>
                  <option value={2}>2 seconds</option>
                  <option value={3}>3 seconds (standard)</option>
                  <option value={4}>4 seconds (4-beat count-in)</option>
                </select>
              </div>

              <div className="option-section">
                <label className="option-label">Outro Credits Card</label>
                <select
                  value={outroDurationSec}
                  onChange={(e) => setOutroDurationSec(Number(e.target.value))}
                  disabled={isExporting}
                  className="option-select"
                >
                  <option value={0}>None (0s)</option>
                  <option value={2}>2 seconds</option>
                  <option value={3}>3 seconds</option>
                </select>
              </div>
            </div>

            {/* Output Size Estimate Info Banner */}
            <div className="video-export-estimate-banner" data-testid="video-export-estimate-banner">
              <div className="estimate-banner-header">
                <span className="estimate-banner-title">Estimated File Size</span>
                <span className="estimate-banner-value">{currentEstimate.formatted}</span>
              </div>
              <span className="estimate-banner-sub">
                {format.toUpperCase()} · {quality === 'compact' ? '720p Compact' : '1080p Full HD'} · {Math.round(totalDuration)}s total duration
              </span>
            </div>

            {/* Export Progress Status */}
            {isExporting && exportProgress && (
              <div className="video-export-progress-box">
                <div className="progress-status-header">
                  <span className="progress-phase-label">
                    {exportProgress.phase === 'preparing' && 'Preparing frames...'}
                    {exportProgress.phase === 'rendering' && `Rendering frames (${exportProgress.percentage}%)...`}
                    {exportProgress.phase === 'encoding' && 'Finalizing video stream...'}
                    {exportProgress.phase === 'done' && 'Complete! Downloading...'}
                  </span>
                  <span className="progress-pct">{exportProgress.percentage}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${exportProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="video-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  stopPreviewAudio();
                  onClose();
                }}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-export-video"
                onClick={handleExport}
                disabled={isExporting || !extractedData}
              >
                {isExporting ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    Recording Video...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Export Sheet Video
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ScoreVideoExportModal;
