import { describe, it, expect, vi } from 'vitest';
import {
  ScoreVideoRenderer,
  PALETTES,
  type ScoreVideoRenderOptions,
  type RenderableSystem,
} from '../scoreVideoRenderer';
import type { ScoreVideoFrameState } from '../scoreVideoTimeline';

describe('ScoreVideoRenderer', () => {
  const createMockContext = () => {
    return {
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
      set fillStyle(_val: any) {},
      set strokeStyle(_val: any) {},
      set lineWidth(_val: any) {},
      set font(_val: any) {},
      set textAlign(_val: any) {},
      set textBaseline(_val: any) {},
      set globalAlpha(_val: any) {},
    } as unknown as CanvasRenderingContext2D;
  };

  const defaultOptions: ScoreVideoRenderOptions = {
    width: 1920,
    height: 1080,
    theme: 'dark',
    aspectRatio: '16:9',
    metadata: {
      title: 'Chorale in G Major',
      composer: 'J. S. Bach',
      key: 'G',
      meter: '4/4',
      tempoBpm: 100,
    },
  };

  it('initializes with dark and warm palettes', () => {
    const darkRenderer = new ScoreVideoRenderer(defaultOptions);
    expect(darkRenderer.palette).toBe(PALETTES.dark);

    const warmRenderer = new ScoreVideoRenderer({ ...defaultOptions, theme: 'warm' });
    expect(warmRenderer.palette).toBe(PALETTES.warm);
  });

  it('renders intro frame without throwing', () => {
    const renderer = new ScoreVideoRenderer(defaultOptions);
    const ctx = createMockContext();

    const frameState: ScoreVideoFrameState = {
      timestampSec: 1.0,
      totalDurationSec: 10,
      phase: 'intro',
      progress: 0.1,
      introState: {
        countInBeat: 2,
        countInTotalBeats: 4,
        beatFraction: 0.5,
      },
    };

    renderer.renderFrame(ctx, frameState);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('Chorale in G Major', expect.any(Number), expect.any(Number));
    // 4 beat dots + 1 pulse ring for active beat = at least 4 arc calls
    expect(vi.mocked(ctx.arc).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('renders score frame with systems and cursor', () => {
    const renderer = new ScoreVideoRenderer(defaultOptions);
    const ctx = createMockContext();

    const mockSystems: RenderableSystem[] = [
      {
        systemIndex: 0,
        bbox: {
          systemIndex: 0,
          lineClass: 'abcjs-l0',
          minMeasure: 1,
          maxMeasure: 2,
          top: 0,
          bottom: 100,
          height: 100,
          left: 0,
          width: 500,
        },
        image: {} as any,
      },
      {
        systemIndex: 1,
        bbox: {
          systemIndex: 1,
          lineClass: 'abcjs-l1',
          minMeasure: 3,
          maxMeasure: 4,
          top: 120,
          bottom: 220,
          height: 100,
          left: 0,
          width: 500,
        },
        image: {} as any,
      },
    ];

    const frameState: ScoreVideoFrameState = {
      timestampSec: 4.0,
      totalDurationSec: 10,
      phase: 'score',
      progress: 0.4,
      scoreState: {
        scoreTimeSec: 1.0,
        activeSystemIndex: 0,
        topLineSystemIndex: 0,
        bottomLineSystemIndex: 1,
        nextSystemIndex: 1,
        cursorX: 150,
        cursorY: 0,
        cursorHeight: 100,
        measureNumber: 1,
      },
    };

    renderer.renderFrame(ctx, frameState, mockSystems);
    const drawCalls = vi.mocked(ctx.drawImage).mock.calls;
    expect(drawCalls).toHaveLength(2);
    expect(drawCalls[0][1]).toBe(drawCalls[1][1]); // Identical left X alignment
    expect(drawCalls[0][3]).toBe(drawCalls[1][3]); // Identical width
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('renders outro frame with fade', () => {
    const renderer = new ScoreVideoRenderer(defaultOptions);
    const ctx = createMockContext();

    const frameState: ScoreVideoFrameState = {
      timestampSec: 9.5,
      totalDurationSec: 10,
      phase: 'outro',
      progress: 0.95,
      outroState: {
        fadeProgress: 0.75,
      },
    };

    renderer.renderFrame(ctx, frameState);
    expect(ctx.fillText).toHaveBeenCalledWith(
      'Chorale in G Major',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('renders portrait mode with compact musical staff gap and separated measure badge', () => {
    const portraitRenderer = new ScoreVideoRenderer({
      ...defaultOptions,
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
    });
    const ctx = createMockContext();

    const mockSystems: RenderableSystem[] = [
      {
        systemIndex: 0,
        bbox: {
          systemIndex: 0,
          lineClass: 'abcjs-l0',
          minMeasure: 1,
          maxMeasure: 2,
          top: 10,
          bottom: 110,
          height: 100,
          left: 0,
          width: 800,
        },
        image: {} as any,
      },
      {
        systemIndex: 1,
        bbox: {
          systemIndex: 1,
          lineClass: 'abcjs-l1',
          minMeasure: 3,
          maxMeasure: 4,
          top: 120,
          bottom: 220,
          height: 100,
          left: 0,
          width: 800,
        },
        image: {} as any,
      },
    ];

    const frameState: ScoreVideoFrameState = {
      timestampSec: 4.0,
      totalDurationSec: 10,
      phase: 'score',
      progress: 0.4,
      scoreState: {
        scoreTimeSec: 1.0,
        activeSystemIndex: 0,
        topLineSystemIndex: 0,
        bottomLineSystemIndex: 1,
        nextSystemIndex: 1,
        cursorX: 150,
        cursorY: 0,
        cursorHeight: 100,
        measureNumber: 2,
      },
    };

    portraitRenderer.renderFrame(ctx, frameState, mockSystems);
    const drawCalls = vi.mocked(ctx.drawImage).mock.calls;
    expect(drawCalls).toHaveLength(2);

    // Identical alignment and width
    expect(drawCalls[0][1]).toBe(drawCalls[1][1]);
    expect(drawCalls[0][3]).toBe(drawCalls[1][3]);

    // In portrait mode, the gap between the bottom of Line 1 and the top of Line 2 is compact (~40-60px), not a 500+px void
    const line1Bottom = Number(drawCalls[0][2]) + Number(drawCalls[0][4]);
    const line2Top = Number(drawCalls[1][2]);
    const gap = line2Top - line1Bottom;
    expect(gap).toBeGreaterThan(20);
    expect(gap).toBeLessThan(100);

    // Measure tag is rendered via fillText with Measure 2
    expect(ctx.fillText).toHaveBeenCalledWith(
      'Measure 2',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('preserves invariant clef dimensions and coordinates across screen transitions', () => {
    const renderer = new ScoreVideoRenderer({
      ...defaultOptions,
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    });

    const mockSystems: RenderableSystem[] = [
      {
        systemIndex: 0,
        bbox: { systemIndex: 0, lineClass: 'abcjs-l0', minMeasure: 1, maxMeasure: 2, top: 10, bottom: 110, height: 100, left: 0, width: 800 },
        image: {} as any,
      },
      {
        systemIndex: 1,
        bbox: { systemIndex: 1, lineClass: 'abcjs-l1', minMeasure: 3, maxMeasure: 4, top: 120, bottom: 220, height: 100, left: 0, width: 800 },
        image: {} as any,
      },
      {
        systemIndex: 2,
        bbox: { systemIndex: 2, lineClass: 'abcjs-l2', minMeasure: 5, maxMeasure: 6, top: 230, bottom: 330, height: 100, left: 0, width: 800 },
        image: {} as any,
      },
      {
        systemIndex: 3,
        bbox: { systemIndex: 3, lineClass: 'abcjs-l3', minMeasure: 7, maxMeasure: 8, top: 340, bottom: 440, height: 100, left: 0, width: 800 },
        image: {} as any,
      },
    ];

    // Screen 1: Systems 0 and 1
    const ctx1 = createMockContext();
    renderer.renderFrame(ctx1, {
      timestampSec: 4.0,
      totalDurationSec: 20,
      phase: 'score',
      progress: 0.2,
      scoreState: {
        scoreTimeSec: 1.0,
        activeSystemIndex: 0,
        topLineSystemIndex: 0,
        bottomLineSystemIndex: 1,
        nextSystemIndex: 1,
        cursorX: 100,
        cursorY: 0,
        cursorHeight: 100,
        measureNumber: 1,
      },
    }, mockSystems);

    // Screen 2: Systems 2 and 3 (after page turn)
    const ctx2 = createMockContext();
    renderer.renderFrame(ctx2, {
      timestampSec: 12.0,
      totalDurationSec: 20,
      phase: 'score',
      progress: 0.6,
      scoreState: {
        scoreTimeSec: 9.0,
        activeSystemIndex: 2,
        topLineSystemIndex: 2,
        bottomLineSystemIndex: 3,
        nextSystemIndex: 3,
        cursorX: 100,
        cursorY: 0,
        cursorHeight: 100,
        measureNumber: 5,
      },
    }, mockSystems);

    const calls1 = vi.mocked(ctx1.drawImage).mock.calls;
    const calls2 = vi.mocked(ctx2.drawImage).mock.calls;

    // Line 1 across transitions has identical (x, y, width, height)
    expect(calls1[0][1]).toBe(calls2[0][1]); // x
    expect(calls1[0][2]).toBe(calls2[0][2]); // y
    expect(calls1[0][3]).toBe(calls2[0][3]); // width
    expect(calls1[0][4]).toBe(calls2[0][4]); // height

    // Line 2 across transitions has identical (x, y, width, height)
    expect(calls1[1][1]).toBe(calls2[1][1]); // x
    expect(calls1[1][2]).toBe(calls2[1][2]); // y
    expect(calls1[1][3]).toBe(calls2[1][3]); // width
    expect(calls1[1][4]).toBe(calls2[1][4]); // height
  });
});
