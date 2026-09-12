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

    it('preserves ledger lines and legato slurs in system slices without purging them as other lines', async () => {
      let serializedSliceXml = '';
      const originalImage = globalThis.Image;
      const originalBlob = globalThis.Blob;
      const originalUrl = globalThis.URL;

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
      globalThis.Blob = class MockBlob {
        constructor(parts: any[]) {
          serializedSliceXml = parts.join('');
        }
      } as any;
      globalThis.URL = {
        ...originalUrl,
        createObjectURL: vi.fn(() => 'blob:mock-url'),
      } as any;

      try {
        const { extractScoreSystems } = await import('../scoreVideoRecorder');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 800 600');

        // Line 0 with a note containing ledger lines
        const line0 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        line0.setAttribute('class', 'abcjs-l0 abcjs-staff');
        line0.getBBox = () => ({ x: 0, y: 50, width: 750, height: 60, top: 50, right: 750, bottom: 110, left: 0 } as DOMRect);

        const note0 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        note0.setAttribute('class', 'abcjs-note abcjs-l0');
        const ledger = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ledger.setAttribute('class', 'abcjs-ledger');
        ledger.setAttribute('d', 'M 10 20 L 30 20');
        note0.appendChild(ledger);
        line0.appendChild(note0);

        const slur = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        slur.setAttribute('class', 'abcjs-slur abcjs-legato abcjs-l0');
        line0.appendChild(slur);

        // Line 1 to be removed from Line 0 slice
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        line1.setAttribute('class', 'abcjs-l1 abcjs-staff');
        line1.getBBox = () => ({ x: 0, y: 200, width: 750, height: 60, top: 200, right: 750, bottom: 260, left: 0 } as DOMRect);

        svg.appendChild(line0);
        svg.appendChild(line1);

        const data = await extractScoreSystems(svg, 'dark');
        expect(data.systems).toHaveLength(2);

        // The serialized XML for the slices should retain .abcjs-ledger and .abcjs-legato
        expect(serializedSliceXml).toContain('abcjs-ledger');
        expect(serializedSliceXml).toContain('.abcjs-ledger { fill: #94a3b8 !important;');
      } finally {
        globalThis.Image = originalImage;
        globalThis.Blob = originalBlob;
        globalThis.URL = originalUrl;
      }
    });
  });

  describe('repairMp4BoxDurations', () => {
    it('repairs unscaled mdhd track durations to match track timescale and mvhd duration', async () => {
      const { repairMp4BoxDurations } = await import('../scoreVideoRecorder');

      // Construct a mock MP4 binary buffer:
      // ftyp (16 bytes)
      // moov containing mvhd, trak 1 (video mdhd 30kHz), trak 2 (audio mdhd 48kHz)
      const buffer = new ArrayBuffer(500);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      let offset = 0;
      // Write box helper
      const writeBox = (type: string, payloadSize: number) => {
        const start = offset;
        view.setUint32(offset, payloadSize + 8);
        for (let i = 0; i < 4; i++) bytes[offset + 4 + i] = type.charCodeAt(i);
        offset += 8;
        return start;
      };

      // 1. ftyp
      writeBox('ftyp', 8);
      offset += 8;

      // 2. moov
      const moovStart = offset;
      offset += 8; // placeholder for moov header

      // mvhd (version 0, timescale 1000, duration 50000 ms)
      const mvhdStart = writeBox('mvhd', 24);
      bytes[mvhdStart + 8] = 0; // version 0
      view.setUint32(mvhdStart + 20, 1000); // timescale
      view.setUint32(mvhdStart + 24, 50000); // duration 50s
      offset = mvhdStart + 32;

      // trak 1: video
      const trak1Start = offset;
      offset += 8;

      // tkhd 1
      const tkhd1Start = writeBox('tkhd', 24);
      bytes[tkhd1Start + 8] = 0;
      offset = tkhd1Start + 32;

      // mdia 1
      const mdia1Start = offset;
      offset += 8;

      // mdhd 1 (video, timescale 30000, broken duration 50000)
      const mdhd1Start = writeBox('mdhd', 24);
      bytes[mdhd1Start + 8] = 0; // version 0
      view.setUint32(mdhd1Start + 20, 30000); // timescale 30kHz
      view.setUint32(mdhd1Start + 24, 50000); // unscaled ms duration (bug)
      offset = mdhd1Start + 32;

      view.setUint32(mdia1Start, offset - mdia1Start);
      for (let i = 0; i < 4; i++) bytes[mdia1Start + 4 + i] = 'mdia'.charCodeAt(i);

      view.setUint32(trak1Start, offset - trak1Start);
      for (let i = 0; i < 4; i++) bytes[trak1Start + 4 + i] = 'trak'.charCodeAt(i);

      // trak 2: audio
      const trak2Start = offset;
      offset += 8;

      const tkhd2Start = writeBox('tkhd', 24);
      bytes[tkhd2Start + 8] = 0;
      offset = tkhd2Start + 32;

      const mdia2Start = offset;
      offset += 8;

      // mdhd 2 (audio, timescale 48000, broken duration 50000)
      const mdhd2Start = writeBox('mdhd', 24);
      bytes[mdhd2Start + 8] = 0; // version 0
      view.setUint32(mdhd2Start + 20, 48000); // timescale 48kHz
      view.setUint32(mdhd2Start + 24, 50000); // unscaled ms duration (bug)
      offset = mdhd2Start + 32;

      view.setUint32(mdia2Start, offset - mdia2Start);
      for (let i = 0; i < 4; i++) bytes[mdia2Start + 4 + i] = 'mdia'.charCodeAt(i);

      view.setUint32(trak2Start, offset - trak2Start);
      for (let i = 0; i < 4; i++) bytes[trak2Start + 4 + i] = 'trak'.charCodeAt(i);

      // Finalize moov size
      view.setUint32(moovStart, offset - moovStart);
      for (let i = 0; i < 4; i++) bytes[moovStart + 4 + i] = 'moov'.charCodeAt(i);

      const mockBlob = new Blob([new Uint8Array(buffer, 0, offset)], { type: 'video/mp4' });
      const repairedBlob = await repairMp4BoxDurations(mockBlob);

      const repairedBuffer = await repairedBlob.arrayBuffer();
      const repairedView = new DataView(repairedBuffer);

      // Video mdhd duration should now be 50s * 30000 = 1,500,000
      const fixedVideoDur = repairedView.getUint32(mdhd1Start + 24);
      expect(fixedVideoDur).toBe(1500000);

      // Audio mdhd duration should now be 50s * 48000 = 2,400,000
      const fixedAudioDur = repairedView.getUint32(mdhd2Start + 24);
      expect(fixedAudioDur).toBe(2400000);
    });
  });
});
