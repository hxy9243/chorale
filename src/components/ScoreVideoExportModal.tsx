import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Download, X, Film, Loader2 } from 'lucide-react';
import {
  extractScoreSystems,
  recordScoreVideo,
  type ExtractedScoreData,
  type ScoreVideoExportProgress,
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
  svgContainerSelector = '#paper svg',
}) => {
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

  // Synchronize ref with state
  isPlayingRef.current = isPreviewPlaying;
  previewTimeRef.current = previewTimeSec;

  // Extract score data when modal opens
  useEffect(() => {
    if (!open) {
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

    const svgEl = document.querySelector<SVGSVGElement>(svgContainerSelector);
    if (svgEl) {
      void extractScoreSystems(svgEl, 45).then((data) => {
        setExtractedData(data);
      });
    } else {
      // Fallback empty data if SVG not yet in DOM
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
  }, [open, svgContainerSelector]);

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

  // Animation loop for preview playback
  useEffect(() => {
    if (!isPreviewPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    lastFrameTimeRef.current = performance.now();

    const loop = (now: number) => {
      const deltaSec = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      setPreviewTimeSec((prev) => {
        const next = prev + deltaSec;
        if (next >= totalDuration) {
          setIsPreviewPlaying(false);
          return 0;
        }
        return next;
      });

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPreviewPlaying, totalDuration]);

  // Export video handler
  const handleExport = async () => {
    if (!extractedData) return;
    setIsPreviewPlaying(false);
    setIsExporting(true);

    try {
      const offscreenCanvas = document.createElement('canvas');
      const width = aspectRatio === '16:9' ? 1920 : 1080;
      const height = aspectRatio === '16:9' ? 1080 : 1920;

      const videoBlob = await recordScoreVideo(
        offscreenCanvas,
        extractedData,
        {
          width,
          height,
          theme,
          aspectRatio,
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
      );

      // Trigger download
      const sanitizedTitle = (scoreTitle || 'score')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedTitle}-video.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
        if (e.target === e.currentTarget && !isExporting) onClose();
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
            onClick={onClose}
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
                onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
                disabled={isExporting}
                aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
              >
                {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <button
                type="button"
                className="btn-circle btn-reset-preview"
                onClick={() => {
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
                onClick={onClose}
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
