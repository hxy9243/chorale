/** Visual screening only: five regularly spaced horizontal lines, not OMR. */
export const detectStaves = (pixels: Uint8ClampedArray, width: number, height: number): number => {
  if (width < 40 || height < 40 || pixels.length !== width * height * 4) return 0;
  const groups = new Set<number>();
  // Overlapping strips tolerate curved/skewed scans and indented first systems.
  for (const offset of [0.08, 0.28, 0.48, 0.63]) {
    const left = Math.floor(width * offset);
    const right = Math.min(width, left + Math.floor(width * 0.29));
    const rows: { y: number; thickness: number }[] = [];
    let start = -1;
    for (let y = 0; y <= height; y++) {
      let ink = 0, run = 0, longest = 0;
      if (y < height) for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4;
        if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 205 && pixels[i + 3] > 128) {
          ink++; run++; longest = Math.max(longest, run);
        } else run = 0;
      }
      // Dense serif text has dark baselines too, but spaces interrupt them.
      const line = ink / (right - left) > 0.62 && longest / (right - left) > 0.4;
      if (line && start < 0) start = y;
      if (!line && start >= 0) { rows.push({ y: (start + y - 1) / 2, thickness: y - start }); start = -1; }
    }
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const gap = rows[j].y - rows[i].y;
      if (gap < 3) continue;
      if (gap > Math.min(30, height / 25)) break;
      const tolerance = Math.max(1.2, gap * 0.18);
      const thin = (row: { thickness: number }) => row.thickness <= Math.max(2, gap * 0.32);
      if (thin(rows[i]) && thin(rows[j]) && [2, 3, 4].every((n) => rows.some((row) => thin(row) && Math.abs(row.y - rows[i].y - gap * n) <= tolerance))) {
        // Count approximate staff locations once across strips.
        const middle = rows[i].y + gap * 2;
        if (![...groups].some((y) => Math.abs(y - middle) < gap * 3)) groups.add(middle);
      }
    }
  }
  return groups.size;
};
