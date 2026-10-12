import { describe, expect, it, vi } from 'vitest';
import { WaterfallCanvasRenderer, waterfallVideoBounds } from '../waterfallCanvasRenderer';
import { ScoreVideoRenderer } from '../scoreVideoRenderer';
import { ScoreVideoTimeline } from '../scoreVideoTimeline';
import type { WaterfallNote } from '../waterfallPlayback';

function context() {
  const operations: unknown[][] = [];
  const gradient = { addColorStop: (...args: unknown[]) => operations.push(['stop', ...args]) };
  const target: Record<string, unknown> = {};
  for (const name of ['fillRect', 'fillText', 'beginPath', 'roundRect', 'fill', 'stroke', 'arc', 'moveTo', 'lineTo', 'save', 'restore', 'translate', 'rect', 'clip', 'drawImage']) {
    target[name] = (...args: unknown[]) => operations.push([name, ...args]);
  }
  target.createLinearGradient = (...args: unknown[]) => { operations.push(['gradient', ...args]); return gradient; };
  target.createRadialGradient = () => gradient;
  target.measureText = (text: string) => ({ width: text.length * 8 });
  return { ctx: target as unknown as CanvasRenderingContext2D, operations };
}
const note = (midiPitch: number, onsetSeconds = 1, durationSeconds = 2): WaterfallNote => ({
  id: String(midiPitch), midiPitch, onsetSeconds, durationSeconds, voice: 0,
});

describe('Waterfall video frames', () => {
  it.each([[1280, 720], [720, 1280], [1920, 1080], [1080, 1920]])('fits the complete pitch range in %ix%i without scrolling', (width, height) => {
    const bounds = waterfallVideoBounds(width, height);
    expect(bounds.x + bounds.width).toBeLessThan(width);
    expect(bounds.y + bounds.height).toBeLessThan(height);
    const { ctx, operations } = context();
    new WaterfallCanvasRenderer([note(0), note(127)]).render(ctx, 1.1, bounds, 'warm');
    const rectangles = operations.filter(op => op[0] === 'roundRect');
    // Field, two notes, all 128 keys. Both end pitches remain inside the frame.
    expect(rectangles).toHaveLength(131);
    for (const [, x, , w] of rectangles) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(bounds.width + 0.0001);
    }
  });

  it('keeps each contact the note width and clears it at the exact release', () => {
    const renderer = new WaterfallCanvasRenderer([note(60), note(61)]);
    const bounds = waterfallVideoBounds(720, 1280);
    const sample = (time: number) => {
      const { ctx, operations } = context(); renderer.render(ctx, time, bounds, 'warm'); return operations;
    };
    expect(sample(0.99).filter(op => op[0] === 'fillRect')).toHaveLength(0);
    const active = sample(1.1);
    const noteRects = active.filter(op => op[0] === 'roundRect').slice(1, 3);
    const contacts = active.filter(op => op[0] === 'fillRect');
    expect(contacts).toHaveLength(4);
    for (let i = 0; i < 2; i++) {
      expect(contacts[i * 2][1]).toBe(noteRects[i][1]);
      expect(contacts[i * 2][3]).toBe(noteRects[i][3]);
    }
    expect(sample(3).filter(op => op[0] === 'fillRect')).toHaveLength(0);
    expect(active.some(op => op[0] === 'stop' && op[1] === 0 && op[2] === '#539b9200')).toBe(true);
  });

  it('renders identical frames after seeking backwards, with no wall-clock particle state', () => {
    const renderer = new WaterfallCanvasRenderer([note(60), note(70, 6)]);
    const sample = (time: number) => {
      const { ctx, operations } = context(); renderer.render(ctx, time, waterfallVideoBounds(1280, 720), 'warm'); return operations;
    };
    const first = sample(1.12);
    sample(6.2);
    expect(sample(1.12)).toEqual(first);
  });

  it('samples score time after the intro and leaves title cards free of falling notes', () => {
    const draw = vi.spyOn(WaterfallCanvasRenderer.prototype, 'render').mockImplementation(() => {});
    try {
      const renderer = new ScoreVideoRenderer({ width: 720, height: 1280, aspectRatio: '9:16', theme: 'warm', visualization: 'waterfall', waterfallNotes: [note(60)], metadata: { title: 'Test' } });
      const timeline = new ScoreVideoTimeline({ introDurationSec: 2, outroDurationSec: 2, scoreDurationSec: 4, tempoBpm: 120 }, [], []);
      const { ctx } = context();
      renderer.renderFrame(ctx, timeline.getFrameState(1));
      expect(draw).not.toHaveBeenCalled();
      renderer.renderFrame(ctx, timeline.getFrameState(3.1));
      expect(draw).toHaveBeenCalledWith(ctx, 1.1, waterfallVideoBounds(720, 1280), 'warm');
      renderer.renderFrame(ctx, timeline.getFrameState(7));
      expect(draw).toHaveBeenCalledTimes(1);
    } finally { draw.mockRestore(); }
  });
});
