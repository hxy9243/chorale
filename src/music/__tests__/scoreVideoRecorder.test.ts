import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isMp4RecordingSupported,
  isWebCodecsSupported,
  ensureAacEncoderReady,
  recordScoreVideo,
  repairMp4BoxDurations,
  getOpusPacketSampleCount,
  getEstimatedScoreVideoSize,
  DEFAULT_VIDEO_BITRATES,
  DEFAULT_AUDIO_BITRATES,
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
      expect(createdOptions.bitsPerSecond).toBe(2_192_000);
      expect(createdOptions.mimeType).toBe('video/mp4;codecs=avc1,mp4a.40.2');
      expect(blob.type).toBe('video/mp4;codecs=avc1,mp4a.40.2');
    });

    it('configures MediaRecorder with compact 750kbps video, 112kbps audio, and 862kbps total for compact quality', async () => {
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
        width: 1280,
        height: 720,
        theme: 'dark',
        aspectRatio: '16:9',
        introDurationSec: 0,
        outroDurationSec: 0,
        metadata: { title: 'Test Score' },
        format: 'webm',
        quality: 'compact',
      };

      const blob = await recordScoreVideo(mockCanvas, mockExtracted, exportOptions);
      expect(createdOptions.videoBitsPerSecond).toBe(750_000);
      expect(createdOptions.audioBitsPerSecond).toBe(112_000);
      expect(createdOptions.bitsPerSecond).toBe(862_000);
      expect(createdOptions.mimeType).toBe('video/webm;codecs=vp9,opus');
      expect(blob.type).toBe('video/webm;codecs=vp9,opus');
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
      expect(createdOptions.bitsPerSecond).toBe(6_320_000);
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

    it('realigns fragmented audio trun sample durations to Opus packet sample count and sets monotonic tfdt', async () => {
      const buffer = new ArrayBuffer(4096);
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);

      let offset = 0;
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
      offset += 8;

      const mvhdStart = writeBox('mvhd', 24);
      bytes[mvhdStart + 8] = 0;
      view.setUint32(mvhdStart + 20, 1000);
      view.setUint32(mvhdStart + 24, 10000);
      offset = mvhdStart + 32;

      // trak 2 (audio)
      const trak2Start = offset;
      offset += 8;

      const tkhd2Start = writeBox('tkhd', 24);
      bytes[tkhd2Start + 8] = 0;
      view.setUint32(tkhd2Start + 20, 2); // trackId = 2
      offset = tkhd2Start + 32;

      const mdia2Start = offset;
      offset += 8;

      const hdlrStart = writeBox('hdlr', 16);
      for (let i = 0; i < 4; i++) bytes[hdlrStart + 16 + i] = 'soun'.charCodeAt(i);
      offset = hdlrStart + 24;

      const mdhd2Start = writeBox('mdhd', 24);
      bytes[mdhd2Start + 8] = 0;
      view.setUint32(mdhd2Start + 20, 48000);
      view.setUint32(mdhd2Start + 24, 10000);
      offset = mdhd2Start + 32;

      view.setUint32(mdia2Start, offset - mdia2Start);
      for (let i = 0; i < 4; i++) bytes[mdia2Start + 4 + i] = 'mdia'.charCodeAt(i);

      view.setUint32(trak2Start, offset - trak2Start);
      for (let i = 0; i < 4; i++) bytes[trak2Start + 4 + i] = 'trak'.charCodeAt(i);

      view.setUint32(moovStart, offset - moovStart);
      for (let i = 0; i < 4; i++) bytes[moovStart + 4 + i] = 'moov'.charCodeAt(i);

      // 3. moof with fragmented audio
      const moofStart = offset;
      offset += 8;

      // mfhd (starts with sequence number 1)
      const mfhdStart = writeBox('mfhd', 8);
      view.setUint32(mfhdStart + 12, 1);
      offset = mfhdStart + 16;

      // traf
      const trafStart = offset;
      offset += 8;

      // tfhd
      const tfhdStart = writeBox('tfhd', 8);
      view.setUint32(tfhdStart + 12, 2); // track_id = 2
      offset = tfhdStart + 16;

      // tfdt
      const tfdtStart = writeBox('tfdt', 8);
      bytes[tfdtStart + 8] = 0;
      view.setUint32(tfdtStart + 12, 9999); // jittered/broken base decode time
      offset = tfdtStart + 16;

      // trun with 2 samples with jittered durations 3132 and 2490
      const trunStart = writeBox('trun', 28);
      // flags: data_offset_present (0x01), sample_duration_present (0x100), sample_size_present (0x200) -> 0x301
      bytes[trunStart + 9] = 0x00;
      bytes[trunStart + 10] = 0x03;
      bytes[trunStart + 11] = 0x01;
      view.setUint32(trunStart + 12, 2); // 2 samples
      view.setInt32(trunStart + 16, 200); // data_offset to mdat

      // Sample 1: dur=3132, size=8
      view.setUint32(trunStart + 20, 3132);
      view.setUint32(trunStart + 24, 8);
      // Sample 2: dur=2490, size=8
      view.setUint32(trunStart + 28, 2490);
      view.setUint32(trunStart + 32, 8);
      offset = trunStart + 36;

      view.setUint32(trafStart, offset - trafStart);
      for (let i = 0; i < 4; i++) bytes[trafStart + 4 + i] = 'traf'.charCodeAt(i);

      view.setUint32(moofStart, offset - moofStart);
      for (let i = 0; i < 4; i++) bytes[moofStart + 4 + i] = 'moof'.charCodeAt(i);

      // 4. mdat containing valid Opus packet headers (config 31 CELT 20ms, code 3, 3 frames = 60ms = 2880 samples)
      const mdatStart = offset;
      offset += 8;
      // sample 1 packet
      bytes[moofStart + 200] = 0xff; // config 31, code 3
      bytes[moofStart + 201] = 0x03; // 3 frames
      // sample 2 packet
      bytes[moofStart + 208] = 0xff;
      bytes[moofStart + 209] = 0x03;
      offset = moofStart + 216;

      view.setUint32(mdatStart, offset - mdatStart);
      for (let i = 0; i < 4; i++) bytes[mdatStart + 4 + i] = 'mdat'.charCodeAt(i);

      const blob = new Blob([new Uint8Array(buffer, 0, offset)], { type: 'video/mp4' });
      const repairedBlob = await repairMp4BoxDurations(blob);

      const repairedBytes = new Uint8Array(await repairedBlob.arrayBuffer());
      const repairedView = new DataView(repairedBytes.buffer);

      // mfhd sequence number normalized to 0
      expect(repairedView.getUint32(mfhdStart + 12)).toBe(0);

      // tfdt base decode time initialized to 0
      expect(repairedView.getUint32(tfdtStart + 12)).toBe(0);

      // trun sample durations repaired from 3132 and 2490 to exact 2880 samples
      expect(repairedView.getUint32(trunStart + 20)).toBe(2880);
      expect(repairedView.getUint32(trunStart + 28)).toBe(2880);
    });

    it('repairs AAC fMP4 trun durations to 1024 samples without parsing as Opus', async () => {
      const buffer = new ArrayBuffer(4096);
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);
      let offset = 0;

      const writeBox = (type: string, payloadSize: number) => {
        const start = offset;
        view.setUint32(start, payloadSize + 8);
        for (let i = 0; i < 4; i++) bytes[start + 4 + i] = type.charCodeAt(i);
        offset += 8;
        return start;
      };

      // moov
      const moovStart = writeBox('moov', 300);
      const mvhdStart = writeBox('mvhd', 24);
      bytes[mvhdStart + 8] = 0;
      view.setUint32(mvhdStart + 20, 1000);
      view.setUint32(mvhdStart + 24, 10000);
      offset = mvhdStart + 32;

      // trak for audio with mp4a codec
      const trakStart = writeBox('trak', 200);
      const tkhdStart = writeBox('tkhd', 24);
      view.setUint32(tkhdStart + 20, 2);
      offset = tkhdStart + 32;

      const mdiaStart = writeBox('mdia', 180);
      const hdlrStart = writeBox('hdlr', 16);
      for (let i = 0; i < 4; i++) bytes[hdlrStart + 16 + i] = 'soun'.charCodeAt(i);
      offset = hdlrStart + 24;

      const mdhdStart = writeBox('mdhd', 24);
      view.setUint32(mdhdStart + 20, 48000);
      offset = mdhdStart + 32;

      const minfStart = writeBox('minf', 80);
      const stblStart = writeBox('stbl', 70);
      const stsdStart = writeBox('stsd', 50);
      view.setUint32(stsdStart + 8, 0); // version & flags
      view.setUint32(stsdStart + 12, 1); // 1 entry
      offset = stsdStart + 16;
      const mp4aStart = writeBox('mp4a', 30);
      offset = mp4aStart + 38;

      view.setUint32(stsdStart, offset - stsdStart);
      for (let i = 0; i < 4; i++) bytes[stsdStart + 4 + i] = 'stsd'.charCodeAt(i);
      view.setUint32(stblStart, offset - stblStart);
      for (let i = 0; i < 4; i++) bytes[stblStart + 4 + i] = 'stbl'.charCodeAt(i);
      view.setUint32(minfStart, offset - minfStart);
      for (let i = 0; i < 4; i++) bytes[minfStart + 4 + i] = 'minf'.charCodeAt(i);
      view.setUint32(mdiaStart, offset - mdiaStart);
      for (let i = 0; i < 4; i++) bytes[mdiaStart + 4 + i] = 'mdia'.charCodeAt(i);
      view.setUint32(trakStart, offset - trakStart);
      for (let i = 0; i < 4; i++) bytes[trakStart + 4 + i] = 'trak'.charCodeAt(i);
      view.setUint32(moovStart, offset - moovStart);
      for (let i = 0; i < 4; i++) bytes[moovStart + 4 + i] = 'moov'.charCodeAt(i);

      // moof with traf track_id = 2 and trun
      const moofStart = writeBox('moof', 120);
      const mfhdStart = writeBox('mfhd', 8);
      view.setUint32(mfhdStart + 12, 1);
      offset = mfhdStart + 16;

      const trafStart = writeBox('traf', 80);
      const tfhdStart = writeBox('tfhd', 8);
      view.setUint32(tfhdStart + 12, 2);
      offset = tfhdStart + 16;

      const tfdtStart = writeBox('tfdt', 8);
      view.setUint32(tfdtStart + 12, 0);
      offset = tfdtStart + 16;

      const trunStart = writeBox('trun', 28);
      bytes[trunStart + 9] = 0x00;
      bytes[trunStart + 10] = 0x03;
      bytes[trunStart + 11] = 0x01;
      view.setUint32(trunStart + 12, 1);
      view.setInt32(trunStart + 16, 200);
      view.setUint32(trunStart + 20, 2400); // jittered duration
      view.setUint32(trunStart + 24, 8); // sample size
      offset = trunStart + 28;

      view.setUint32(trafStart, offset - trafStart);
      for (let i = 0; i < 4; i++) bytes[trafStart + 4 + i] = 'traf'.charCodeAt(i);
      view.setUint32(moofStart, offset - moofStart);
      for (let i = 0; i < 4; i++) bytes[moofStart + 4 + i] = 'moof'.charCodeAt(i);

      // mdat with non-Opus bytes (e.g. 0x00)
      const mdatStart = offset;
      bytes[moofStart + 200] = 0x00;
      offset = moofStart + 208;
      view.setUint32(mdatStart, offset - mdatStart);
      for (let i = 0; i < 4; i++) bytes[mdatStart + 4 + i] = 'mdat'.charCodeAt(i);

      const blob = new Blob([new Uint8Array(buffer, 0, offset)], { type: 'video/mp4' });
      const repairedBlob = await repairMp4BoxDurations(blob);
      const repairedBytes = new Uint8Array(await repairedBlob.arrayBuffer());
      const repairedView = new DataView(repairedBytes.buffer);

      // AAC samples must get exact 1024 duration rather than Opus-parsed values
      expect(repairedView.getUint32(trunStart + 20)).toBe(1024);
    });
  });

  describe('DEFAULT_BITRATES', () => {
    it('defines expected default bitrates across quality tiers', () => {
      expect(DEFAULT_VIDEO_BITRATES.compact).toBe(750_000);
      expect(DEFAULT_VIDEO_BITRATES.compressed).toBe(2_000_000);
      expect(DEFAULT_VIDEO_BITRATES.high).toBe(6_000_000);

      expect(DEFAULT_AUDIO_BITRATES.compact).toBe(112_000);
      expect(DEFAULT_AUDIO_BITRATES.compressed).toBe(192_000);
      expect(DEFAULT_AUDIO_BITRATES.high).toBe(320_000);
    });
  });

  describe('getOpusPacketSampleCount', () => {
    it('returns 2880 for standard 60ms CELT stereo Opus packets with 3 frames (code 3)', () => {
      // 0xff = config 31 (CELT 20ms), stereo=true, code 3
      // 0x03 = 3 frames
      const packet = new Uint8Array([0xff, 0x03, 0x00, 0x00]);
      expect(getOpusPacketSampleCount(packet)).toBe(2880);
    });

    it('returns 960 for 20ms CELT packet with 1 frame (code 0)', () => {
      // config 31 (20ms), code 0 (1 frame): 0b11111000 = 0xf8
      const packet = new Uint8Array([0xf8]);
      expect(getOpusPacketSampleCount(packet)).toBe(960);
    });

    it('returns default 2880 for empty packet', () => {
      expect(getOpusPacketSampleCount(new Uint8Array([]))).toBe(2880);
    });
  });

  describe('getEstimatedScoreVideoSize', () => {
    it('estimates compact WebM and MP4 sizes accurately', () => {
      // 60 seconds of compact WebM (550 kbps)
      const webmEstimate = getEstimatedScoreVideoSize(60, 'compact', 'webm');
      // 550,000 * 60 / 8 = 4,125,000 bytes + 30,000 = ~4.15 MB
      expect(webmEstimate.megabytes).toBeCloseTo(4.0, 0);
      expect(webmEstimate.formatted).toMatch(/^~\d+(\.\d+)? MB$/);

      // 60 seconds of compact MP4 (450 kbps)
      const mp4Estimate = getEstimatedScoreVideoSize(60, 'compact', 'mp4');
      // 450,000 * 60 / 8 = 3,375,000 bytes + 30,000 = ~3.4 MB
      expect(mp4Estimate.megabytes).toBeLessThan(webmEstimate.megabytes);
      expect(mp4Estimate.formatted).toMatch(/^~\d+(\.\d+)? MB$/);
    });

    it('estimates compressed and high quality tiers with proportional scaling', () => {
      const compact = getEstimatedScoreVideoSize(60, 'compact', 'webm');
      const compressed = getEstimatedScoreVideoSize(60, 'compressed', 'webm');
      const high = getEstimatedScoreVideoSize(60, 'high', 'webm');

      expect(compact.megabytes).toBeLessThan(compressed.megabytes);
      expect(compressed.megabytes).toBeLessThan(high.megabytes);
    });

    it('formats values under 1 MB gracefully', () => {
      const shortEstimate = getEstimatedScoreVideoSize(5, 'compact', 'mp4');
      expect(shortEstimate.formatted).toBe('< 1 MB');
    });

    it('handles zero or negative duration safely without throwing', () => {
      const zeroEst = getEstimatedScoreVideoSize(0, 'compact', 'mp4');
      expect(zeroEst.formatted).toBe('< 1 MB');
      expect(zeroEst.bytes).toBeGreaterThan(0);
    });
  });

  describe('WebCodecs support & AAC readiness', () => {
    const originalVideoEncoder = (globalThis as any).VideoEncoder;
    const originalVideoFrame = (globalThis as any).VideoFrame;

    afterEach(() => {
      (globalThis as any).VideoEncoder = originalVideoEncoder;
      (globalThis as any).VideoFrame = originalVideoFrame;
    });

    it('detects when WebCodecs is unsupported', () => {
      delete (globalThis as any).VideoEncoder;
      delete (globalThis as any).VideoFrame;
      expect(isWebCodecsSupported()).toBe(false);
    });

    it('detects when WebCodecs is supported', () => {
      (globalThis as any).VideoEncoder = class {};
      (globalThis as any).VideoFrame = class {};
      expect(isWebCodecsSupported()).toBe(true);
      expect(isMp4RecordingSupported()).toBe(true);
    });

    it('ensureAacEncoderReady completes without throwing', async () => {
      await expect(ensureAacEncoderReady()).resolves.toBeUndefined();
    });
  });
});

