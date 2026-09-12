import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isMp4RecordingSupported,
  recordScoreVideo,
  type ExtractedScoreData,
  type ScoreVideoExportOptions,
} from '../scoreVideoRecorder';

describe('scoreVideoRecorder', () => {
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalMediaStream = globalThis.MediaStream;

  afterEach(() => {
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.MediaStream = originalMediaStream;
  });

  describe('isMp4RecordingSupported', () => {
    it('returns false when MediaRecorder is undefined', () => {
      // @ts-ignore
      delete globalThis.MediaRecorder;
      expect(isMp4RecordingSupported()).toBe(false);
    });

    it('returns true when MediaRecorder supports video/mp4', () => {
      globalThis.MediaRecorder = {
        isTypeSupported: vi.fn((type: string) => type.startsWith('video/mp4')),
      } as any;

      expect(isMp4RecordingSupported()).toBe(true);
      expect(globalThis.MediaRecorder.isTypeSupported).toHaveBeenCalledWith('video/mp4;codecs=avc1,opus');
    });

    it('returns false when MediaRecorder only supports video/webm', () => {
      globalThis.MediaRecorder = {
        isTypeSupported: vi.fn((type: string) => type.startsWith('video/webm')),
      } as any;

      expect(isMp4RecordingSupported()).toBe(false);
    });
  });

  describe('recordScoreVideo MIME type & bitrate configuration', () => {
    const mockCanvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn().mockReturnValue({
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        drawImage: vi.fn(),
      }),
      captureStream: vi.fn().mockReturnValue({
        getVideoTracks: vi.fn().mockReturnValue([]),
      }),
    } as unknown as HTMLCanvasElement;

    const mockExtracted: ExtractedScoreData = {
      systems: [],
      noteEvents: [],
      systemImages: [],
      totalScoreTimeSec: 10,
    };

    it('configures MediaRecorder with MP4 and compressed 2Mbps bitrate by default', async () => {
      let createdOptions: any = null;

      class MockMediaStream {
        tracks: any[];
        constructor(tracks: any[]) {
          this.tracks = tracks;
        }
      }
      globalThis.MediaStream = MockMediaStream as any;

      class MockMediaRecorder {
        static isTypeSupported(type: string) {
          return type.includes('mp4');
        }
        ondataavailable: any = null;
        onstop: any = null;
        constructor(_stream: any, options: any) {
          createdOptions = options;
        }
        start() {
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 10);
        }
        stop() {
          if (this.onstop) this.onstop();
        }
      }

      globalThis.MediaRecorder = MockMediaRecorder as any;

      const exportOptions: ScoreVideoExportOptions = {
        width: 1920,
        height: 1080,
        theme: 'dark',
        aspectRatio: '16:9',
        introDurationSec: 0,
        outroDurationSec: 0,
        metadata: { title: 'Test Score' },
        format: 'mp4',
        quality: 'compressed',
      };

      const blob = await recordScoreVideo(mockCanvas, mockExtracted, exportOptions);
      expect(createdOptions.videoBitsPerSecond).toBe(2_000_000);
      expect(createdOptions.mimeType).toBe('video/mp4;codecs=avc1,opus');
      expect(blob.type).toBe('video/mp4;codecs=avc1,opus');
    });

    it('configures MediaRecorder with 6Mbps for high quality and WebM format', async () => {
      let createdOptions: any = null;

      class MockMediaStream {
        tracks: any[];
        constructor(tracks: any[]) {
          this.tracks = tracks;
        }
      }
      globalThis.MediaStream = MockMediaStream as any;

      class MockMediaRecorder {
        static isTypeSupported(type: string) {
          return type.includes('webm');
        }
        ondataavailable: any = null;
        onstop: any = null;
        constructor(_stream: any, options: any) {
          createdOptions = options;
        }
        start() {
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 10);
        }
        stop() {
          if (this.onstop) this.onstop();
        }
      }

      globalThis.MediaRecorder = MockMediaRecorder as any;

      const exportOptions: ScoreVideoExportOptions = {
        width: 1920,
        height: 1080,
        theme: 'dark',
        aspectRatio: '16:9',
        introDurationSec: 0,
        outroDurationSec: 0,
        metadata: { title: 'Test Score' },
        format: 'webm',
        quality: 'high',
      };

      const blob = await recordScoreVideo(mockCanvas, mockExtracted, exportOptions);
      expect(createdOptions.videoBitsPerSecond).toBe(6_000_000);
      expect(createdOptions.mimeType).toBe('video/webm;codecs=vp9,opus');
      expect(blob.type).toBe('video/webm;codecs=vp9,opus');
    });

    it('falls back to WebM when MP4 is requested but unsupported by browser', async () => {
      let createdOptions: any = null;

      class MockMediaStream {
        tracks: any[];
        constructor(tracks: any[]) {
          this.tracks = tracks;
        }
      }
      globalThis.MediaStream = MockMediaStream as any;

      class MockMediaRecorder {
        static isTypeSupported(type: string) {
          return type.includes('webm');
        }
        ondataavailable: any = null;
        onstop: any = null;
        constructor(_stream: any, options: any) {
          createdOptions = options;
        }
        start() {
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 10);
        }
        stop() {
          if (this.onstop) this.onstop();
        }
      }

      globalThis.MediaRecorder = MockMediaRecorder as any;

      const exportOptions: ScoreVideoExportOptions = {
        width: 1920,
        height: 1080,
        theme: 'dark',
        aspectRatio: '16:9',
        introDurationSec: 0,
        outroDurationSec: 0,
        metadata: { title: 'Test Score' },
        format: 'mp4',
        quality: 'compressed',
      };

      const blob = await recordScoreVideo(mockCanvas, mockExtracted, exportOptions);
      expect(createdOptions.mimeType).toBe('video/webm;codecs=vp9,opus');
      expect(blob.type).toBe('video/webm;codecs=vp9,opus');
    });
  });
});
