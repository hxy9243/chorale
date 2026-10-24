const SPARKS = Array.from({ length: 24 }, (_, i) => i);
const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Short, deterministic trajectories confined to the note's contact footprint. */
export function contactSparks(age: number, width: number, seed: number) {
  return SPARKS.flatMap((i) => {
    const particleSeed = seed + i * 17;
    const lifetime = 0.16 + noise(particleSeed) * 0.08;
    const delay = i < 8 ? 0 : (i - 8) * 0.007;
    if (age < delay) return [];
    const phase = ((age - delay) % lifetime) / lifetime;
    const cycle = Math.floor((age - delay) / lifetime);
    const origin = 0.08 + noise(particleSeed + cycle * 31 + 2) * 0.84;
    const drift = (noise(particleSeed + 3) - 0.5) * Math.min(width * 0.15, 3);
    const x = Math.max(width * 0.04, Math.min(width * 0.96, origin * width + drift * phase));
    const rise = (3 + noise(particleSeed + 4) * 6) * (1 - (1 - phase) ** 2);
    return [{
      id: i, x, y: -0.8 - rise, length: 0.6 + (1 - phase) * 1.1,
      width: 0.6 + noise(particleSeed + 5) * 0.45,
      opacity: (1 - phase) ** 0.7 * (0.9 + Math.exp(-age * 14) * 0.1),
      white: i % 6 === 0,
    }];
  });
}

export const WATERFALL_TAIL_STOPS = [
  [0, 0], [0.12, 0.04], [0.32, 0.22], [0.62, 0.58], [1, 0.86],
] as const;
