import { describe, expect, it } from 'vitest';
import { detectStaves } from '../staffDetection';

const page = () => {
  const width = 600, height = 800;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const line = (x: number, y: number, length: number, thickness = 1) => {
    for (let row = y; row < y + thickness; row++) for (let col = x; col < x + length; col++) {
      const index = (row * width + col) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
    }
  };
  return { pixels, width, height, line, detect: () => detectStaves(pixels, width, height) };
};

describe('visual staff screening', () => {
  it('omits blank pages and text paragraphs', () => {
    const p = page();
    expect(p.detect()).toBe(0);
    for (let y = 50; y < 750; y += 18) for (let x = 50; x < 550; x += 12) p.line(x, y, 5, 6);
    expect(p.detect()).toBe(0);
  });
  it('rejects dense regular text baselines even when row ink is high', () => {
    const p = page();
    for (let y = 50; y < 750; y += 16) for (let x = 50; x < 550; x += 12) p.line(x, y, 9);
    expect(p.detect()).toBe(0);
  });
  it('recognizes staves even when the page also contains title and prose', () => {
    const p = page();
    p.line(220, 40, 150, 8);
    for (const top of [160, 240, 400, 480]) for (let n = 0; n < 5; n++) p.line(50, top + n * 8, 500);
    expect(p.detect()).toBeGreaterThanOrEqual(4);
  });
  it('finds a short isolated music example', () => {
    const p = page();
    for (let n = 0; n < 5; n++) p.line(180, 200 + n * 8, 250);
    expect(p.detect()).toBeGreaterThan(0);
  });
  it('rejects unrelated horizontal rules and invalid rasters', () => {
    const p = page();
    for (const y of [40, 100, 190, 300, 700]) p.line(50, y, 500);
    expect(p.detect()).toBe(0);
    expect(detectStaves(new Uint8ClampedArray(), 600, 800)).toBe(0);
  });
});
