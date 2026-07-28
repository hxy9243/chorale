/**
 * Synchronizes inline tempo markings [Q:...] across all voices in an ABC score.
 * Multi-voice ABC scores often contain inline tempo changes only in V:1.
 * Injecting matching inline tempos into V:2, V:3, etc. ensures abcjs synth
 * evaluates all tracks with identical timing, preventing desynchronization.
 */
export function syncAbcTempoAcrossVoices(abc: string): string {
  if (!abc || !abc.includes('V:')) {
    return abc;
  }

  const lines = abc.split('\n');
  const measureTempos = new Map<number, string>();
  let currentVoice = '';
  let measureCount = 0;

  // Pass 1: Collect inline tempo markings per measure from any voice that has them
  lines.forEach((line) => {
    const vMatch = line.match(/^V:(\S+)/);
    if (vMatch) {
      currentVoice = vMatch[1];
      if (currentVoice === '1') {
        measureCount = 0;
      }
    }

    // Only process music lines (not header fields or comments)
    if (currentVoice && !line.startsWith('%') && !/^[A-Z]:/.test(line)) {
      const bars = line.split('|');
      bars.forEach((bar, idx) => {
        const qMatch = bar.match(/\[Q:[^\]]+\]/);
        if (qMatch) {
          measureTempos.set(measureCount, qMatch[0]);
        }
        if (idx < bars.length - 1) {
          measureCount += 1;
        }
      });
    }
  });

  if (measureTempos.size === 0) {
    return abc;
  }

  // Pass 2: Rebuild ABC lines, propagating measureTempos to all voices
  currentVoice = '';
  measureCount = 0;
  const outLines: string[] = [];

  lines.forEach((line) => {
    const vMatch = line.match(/^V:(\S+)/);
    if (vMatch) {
      currentVoice = vMatch[1];
      measureCount = 0;
      outLines.push(line);
      return;
    }

    if (currentVoice && !line.startsWith('%') && !/^[A-Z]:/.test(line)) {
      const bars = line.split('|');
      const newBars = bars.map((bar, idx) => {
        // Strip any existing inline tempo first
        let cleanBar = bar.replace(/\[Q:[^\]]+\]/g, '');
        const tempo = measureTempos.get(measureCount);
        if (tempo && !cleanBar.startsWith(tempo)) {
          cleanBar = tempo + cleanBar;
        }
        if (idx < bars.length - 1) {
          measureCount += 1;
        }
        return cleanBar;
      });
      outLines.push(newBars.join('|'));
    } else {
      outLines.push(line);
    }
  });

  return outLines.join('\n');
}

/**
 * Strips inline tempo markings [Q:...] from measure bodies while preserving score header Q: fields.
 */
export function sanitizeAbcForAudio(abc: string): string {
  if (!abc) return '';
  return abc
    .replace(/(^|\n)Q:[^\n]*/g, (match) => match)
    .replace(/\[Q:[^\]]+\]/g, '');
}

/**
 * Prepares ABC code for audio synthesis, ensuring multi-voice synchronization.
 */
export function prepareAbcForPlayback(abc: string, mode: 'sync' | 'strip' = 'sync'): string {
  if (!abc) return '';
  if (mode === 'strip') {
    return sanitizeAbcForAudio(abc);
  }
  return syncAbcTempoAcrossVoices(abc);
}
