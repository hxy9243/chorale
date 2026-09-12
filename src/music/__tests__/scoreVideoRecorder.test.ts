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
      expect(globalThis.MediaRecorder.isTypeSupported).toHaveBeenCalledWith('video/mp4;codecs=avc1,mp4a.40.2');
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

    it('configures MediaRecorder with MP4, compressed 2Mbps video bitrate, and 192kbps audio bitrate by default', async () => {
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
      expect(createdOptions.audioBitsPerSecond).toBe(192_000);
      expect(createdOptions.mimeType).toBe('video/mp4;codecs=avc1,mp4a.40.2');
      expect(blob.type).toBe('video/mp4;codecs=avc1,mp4a.40.2');
    });

    it('configures MediaRecorder with 6Mbps video and 320kbps audio for high quality and WebM format', async () => {
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
      expect(createdOptions.audioBitsPerSecond).toBe(320_000);
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
      expect(createdOptions.audioBitsPerSecond).toBe(192_000);
      expect(createdOptions.mimeType).toBe('video/webm;codecs=vp9,opus');
      expect(blob.type).toBe('video/webm;codecs=vp9,opus');
    });
  });

  describe('mixAudioBuffers headroom & normalization', () => {
    it('normalizes multi-voice summed buffers that exceed peak threshold to prevent clipping', async () => {
      const { mixAudioBuffers } = await import('../scoreVideoRecorder');

      const mockAudioCtx = {
        createBuffer: (channels: number, length: number, sampleRate: number) => {
          const channelData = Array.from({ length: channels }, () => new Float32Array(length));
          return {
            numberOfChannels: channels,
            length,
            sampleRate,
            getChannelData: (ch: number) => channelData[ch],
          } as AudioBuffer;
        },
      } as unknown as AudioContext;

      // Create two buffers with overlapping loud peaks that sum to 1.6 (> 0.92)
      const buf1 = {
        numberOfChannels: 1,
        length: 4,
        sampleRate: 44100,
        getChannelData: () => new Float32Array([0.8, 0.5, -0.7, 0.1]),
      } as unknown as AudioBuffer;

      const buf2 = {
        numberOfChannels: 1,
        length: 4,
        sampleRate: 44100,
        getChannelData: () => new Float32Array([0.8, -0.2, -0.6, 0.2]),
      } as unknown as AudioBuffer;

      const mixed = mixAudioBuffers(mockAudioCtx, [buf1, buf2]);
      expect(mixed).not.toBeNull();
      const data = mixed!.getChannelData(0);

      // Raw sum at index 0 would be 1.6; with normalization to 0.92, max peak must be <= 0.92
      let maxPeak = 0;
      for (let i = 0; i < data.length; i++) {
        maxPeak = Math.max(maxPeak, Math.abs(data[i]));
      }
      expect(maxPeak).toBeCloseTo(0.92, 5);
      expect(data[0]).toBeCloseTo(0.92, 5);
    });
  });

  describe('extractScoreSystems uniform sizing', () => {
    it('extracts score systems with uniform bounding box heights and widths', async () => {
      const originalImage = globalThis.Image;
      class MockImage {
        onload: any = null;
        onerror: any = null;
        set src(_v: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      }
      globalThis.Image = MockImage as any;

      try {
        const { extractScoreSystems } = await import('../scoreVideoRecorder');
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 800 600');

        // Create two lines: line 0 and line 1
        const line0 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        line0.setAttribute('class', 'abcjs-l0 abcjs-staff');
        line0.getBBox = () => ({ x: 0, y: 50, width: 750, height: 60, top: 50, right: 750, bottom: 110, left: 0 } as DOMRect);

        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        line1.setAttribute('class', 'abcjs-l1 abcjs-staff');
        line1.getBBox = () => ({ x: 0, y: 200, width: 750, height: 90, top: 200, right: 750, bottom: 290, left: 0 } as DOMRect);

        svg.appendChild(line0);
        svg.appendChild(line1);

        const data = await extractScoreSystems(svg, 'dark');
        expect(data.systems).toHaveLength(2);

        // Both systems must have identical bounding box height and width
        expect(data.systems[0].height).toBe(data.systems[1].height);
        expect(data.systems[0].width).toBe(data.systems[1].width);
        expect(data.systems[0].height).toBeGreaterThanOrEqual(100);
      } finally {
        globalThis.Image = originalImage;
      }
    });
  });
});
