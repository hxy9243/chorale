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
        nextSystemIndex: 1,
        cursorX: 150,
        cursorY: 0,
        cursorHeight: 100,
        measureNumber: 1,
      },
    };

    renderer.renderFrame(ctx, frameState, mockSystems);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
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
});
