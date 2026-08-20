export interface ScoreMetadata {
  title?: string;
  composer?: string;
  key?: string;
  meter?: string;
  tempoText?: string;
  tempoBpm?: number;
  tempoUnit?: string;
  unitLength?: string;
  voices?: string[];
}

export interface ValidationResult<T = string> {
  valid: boolean;
  value?: T;
  error?: string;
}

export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 400;
export const DEFAULT_TEMPO_BPM = 120;

const VALID_ROOTS = new Set([
  'C', 'C#', 'CB', 'DB', 'D', 'D#', 'EB', 'E', 'E#', 'FB', 'F', 'F#',
  'GB', 'G', 'G#', 'AB', 'A', 'A#', 'BB', 'B', 'B#',
]);

const VALID_MODES: Record<string, string> = {
  '': '',
  'maj': '',
  'major': '',
  'm': 'm',
  'min': 'm',
  'minor': 'm',
  'dor': 'dorian',
  'dorian': 'dorian',
  'phr': 'phrygian',
  'phrygian': 'phrygian',
  'lyd': 'lydian',
  'lydian': 'lydian',
  'mix': 'mixolydian',
  'mixolydian': 'mixolydian',
  'aeo': 'm',
  'aeolian': 'm',
  'loc': 'locrian',
  'locrian': 'locrian',
};

const VALID_CLEFS = new Set([
  'treble', 'bass', 'alto', 'tenor', 'perc', 'none', 'm',
  'treble-8', 'treble+8', 'bass-8', 'bass+8',
]);

/**
 * Validates and normalizes a musical key signature.
 * Supports standard major, minor (m, min, minor), and modes (dorian, mixolydian, etc.).
 */
export function validateKeySignature(rawKey: string): ValidationResult<string> {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return { valid: false, error: 'Key signature cannot be empty.' };
  }

  const parts = trimmed.split(/\s+/);
  const rootAndInlineMode = parts[0];
  const trailingTokens = parts.slice(1);

  const match = rootAndInlineMode.match(/^([A-Ga-g])([#bB]?)(.*)$/);
  if (!match) {
    return { valid: false, error: `Invalid key root in "${trimmed}".` };
  }

  const rootLetter = match[1].toUpperCase();
  const accidental = match[2] ? (match[2] === '#' ? '#' : 'b') : '';
  const root = `${rootLetter}${accidental}`;

  if (!VALID_ROOTS.has(root.toUpperCase())) {
    return { valid: false, error: `Unrecognized key root "${root}".` };
  }

  let modeRaw = match[3].toLowerCase();
  let remainingTokens = [...trailingTokens];

  // If inline mode was empty and next token is a mode (e.g., "D minor", "G dorian")
  if (!modeRaw && remainingTokens.length > 0) {
    const candidateMode = remainingTokens[0].toLowerCase();
    if (VALID_MODES[candidateMode] !== undefined) {
      modeRaw = candidateMode;
      remainingTokens.shift();
    }
  }

  const normalizedMode = VALID_MODES[modeRaw];
  if (normalizedMode === undefined) {
    return {
      valid: false,
      error: `Unrecognized mode "${modeRaw}". Use standard keys (e.g. C, G, Dm, F#m, Eb) or modal names.`,
    };
  }

  // Validate any trailing tokens (e.g., clefs like "treble", "bass")
  if (remainingTokens.length > 0) {
    for (const token of remainingTokens) {
      const lower = token.toLowerCase();
      if (!VALID_CLEFS.has(lower) && !lower.startsWith('clef=') && !lower.startsWith('octave=')) {
        return {
          valid: false,
          error: `Unrecognized qualifier "${token}" in key signature.`,
        };
      }
    }
  }

  const modeString = normalizedMode
    ? (normalizedMode === 'm' ? 'm' : ` ${normalizedMode}`)
    : '';
  const extraString = remainingTokens.length > 0 ? ` ${remainingTokens.join(' ')}` : '';
  const normalizedKey = `${root}${modeString}${extraString}`.trim();

  return { valid: true, value: normalizedKey };
}

/**
 * Validates and normalizes a meter (time signature).
 * Supports standard fractional meters (e.g. 4/4, 3/4, 6/8, 12/8) and shorthand (C, C|, none).
 */
export function validateMeter(rawMeter: string): ValidationResult<string> {
  const trimmed = rawMeter.trim();
  if (!trimmed) {
    return { valid: false, error: 'Meter cannot be empty.' };
  }

  if (trimmed === 'C' || trimmed === '4/4') {
    return { valid: true, value: '4/4' };
  }
  if (trimmed === 'C|' || trimmed === '2/2') {
    return { valid: true, value: '2/2' };
  }
  if (trimmed.toLowerCase() === 'none' || trimmed === 'free') {
    return { valid: true, value: 'none' };
  }

  const fractionMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!fractionMatch) {
    return {
      valid: false,
      error: `Invalid meter format "${trimmed}". Use fractions like 4/4, 3/4, 6/8 or C, C|.`,
    };
  }

  const numerator = parseInt(fractionMatch[1], 10);
  const denominator = parseInt(fractionMatch[2], 10);

  if (numerator < 1 || numerator > 32) {
    return { valid: false, error: 'Meter numerator must be between 1 and 32.' };
  }

  const validDenominators = [1, 2, 4, 8, 16, 32];
  if (!validDenominators.includes(denominator)) {
    return {
      valid: false,
      error: `Meter denominator must be a valid note value (${validDenominators.join(', ')}).`,
    };
  }

  return { valid: true, value: `${numerator}/${denominator}` };
}

export interface TempoValidationResult extends ValidationResult<string> {
  bpm?: number;
  tempoUnit?: string;
}

/**
 * Validates and normalizes a tempo string or BPM number.
 * Validates BPM in range [20, 400].
 */
export function validateTempo(rawTempo: string | number): TempoValidationResult {
  if (typeof rawTempo === 'number') {
    if (isNaN(rawTempo) || rawTempo < MIN_TEMPO_BPM || rawTempo > MAX_TEMPO_BPM) {
      return {
        valid: false,
        error: `Tempo must be between ${MIN_TEMPO_BPM} and ${MAX_TEMPO_BPM} BPM.`,
      };
    }
    const bpm = Math.round(rawTempo);
    return {
      valid: true,
      value: `♩ = ${bpm}`,
      bpm,
      tempoUnit: '1/4',
    };
  }

  const trimmed = rawTempo.trim();
  if (!trimmed) {
    return { valid: false, error: 'Tempo cannot be empty.' };
  }

  // Check simple integer BPM string (e.g. "120" or "120 BPM")
  const simpleBpmMatch = trimmed.match(/^(\d{1,3})(?:\s*bpm)?$/i);
  if (simpleBpmMatch) {
    const bpm = parseInt(simpleBpmMatch[1], 10);
    if (bpm < MIN_TEMPO_BPM || bpm > MAX_TEMPO_BPM) {
      return {
        valid: false,
        error: `Tempo must be between ${MIN_TEMPO_BPM} and ${MAX_TEMPO_BPM} BPM.`,
      };
    }
    return {
      valid: true,
      value: `♩ = ${bpm}`,
      bpm,
      tempoUnit: '1/4',
    };
  }

  // Check standard ABC/musical formats like "1/4=120", "3/8=45", "♩ = 120", "♩=120"
  const complexMatch = trimmed.match(/(?:(?:(\d\/\d+)|[♩qQ])\s*=\s*)?(\d{1,3})/);
  if (complexMatch && complexMatch[2]) {
    const unit = complexMatch[1] || '1/4';
    const bpm = parseInt(complexMatch[2], 10);
    if (bpm < MIN_TEMPO_BPM || bpm > MAX_TEMPO_BPM) {
      return {
        valid: false,
        error: `Tempo must be between ${MIN_TEMPO_BPM} and ${MAX_TEMPO_BPM} BPM.`,
      };
    }
    return {
      valid: true,
      value: unit === '1/4' ? `♩ = ${bpm}` : `${unit} = ${bpm}`,
      bpm,
      tempoUnit: unit,
    };
  }

  return {
    valid: false,
    error: `Invalid tempo format "${trimmed}". Enter a BPM number between ${MIN_TEMPO_BPM} and ${MAX_TEMPO_BPM}.`,
  };
}

/**
 * Parses all header and score metadata from ABC string.
 */
export function parseAbcHeaderMetadata(abc: string): ScoreMetadata {
  let title: string | undefined;
  let composer: string | undefined;
  let key: string | undefined;
  let meter: string | undefined;
  let tempoText: string | undefined;
  let tempoBpm: number | undefined;
  let tempoUnit = '1/4';
  let unitLength: string | undefined;
  const voices: string[] = [];

  const lines = abc.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('T:')) {
      const val = trimmed.slice(2).trim();
      if (val && !title) title = val;
    } else if (trimmed.startsWith('C:')) {
      const val = trimmed.slice(2).trim();
      if (val && !composer) composer = val;
    } else if (trimmed.startsWith('K:')) {
      const val = trimmed.slice(2).trim();
      if (val && !key) key = val;
    } else if (trimmed.startsWith('M:')) {
      const val = trimmed.slice(2).trim();
      if (val && !meter) meter = val === 'C' ? '4/4' : val === 'C|' ? '2/2' : val;
    } else if (trimmed.startsWith('L:')) {
      const val = trimmed.slice(2).trim();
      if (val && !unitLength) unitLength = val;
    } else if (trimmed.startsWith('Q:')) {
      const val = trimmed.slice(2).trim();
      if (val && !tempoText) {
        const parsed = validateTempo(val);
        if (parsed.valid && parsed.bpm) {
          tempoBpm = parsed.bpm;
          tempoUnit = parsed.tempoUnit || '1/4';
          tempoText = parsed.value;
        } else {
          tempoText = val;
        }
      }
    } else if (trimmed.startsWith('V:')) {
      const val = trimmed.slice(2).trim();
      const voiceId = val.split(/\s+/)[0];
      if (voiceId && !voices.includes(voiceId)) {
        voices.push(voiceId);
      }
    }
  }

  return {
    title,
    composer,
    key,
    meter,
    tempoText,
    tempoBpm,
    tempoUnit,
    unitLength,
    voices: voices.length > 0 ? voices : undefined,
  };
}

/**
 * Updates header metadata fields in an ABC string cleanly without corrupting the score notation.
 */
export function updateAbcHeaderMetadata(
  abc: string,
  updates: Partial<ScoreMetadata>,
): string {
  const lines = abc.split(/\r?\n/);
  const updatedLines = [...lines];

  const findHeaderIndex = (prefix: string): number => {
    return updatedLines.findIndex((line) => line.trim().startsWith(prefix));
  };

  // 1. Update Title (T:)
  if (updates.title !== undefined) {
    const titleVal = updates.title.trim();
    const titleIdx = findHeaderIndex('T:');
    if (titleIdx >= 0) {
      if (titleVal) {
        updatedLines[titleIdx] = `T:${titleVal}`;
      } else {
        updatedLines.splice(titleIdx, 1);
      }
    } else if (titleVal) {
      const xIdx = findHeaderIndex('X:');
      const insertAt = xIdx >= 0 ? xIdx + 1 : 0;
      updatedLines.splice(insertAt, 0, `T:${titleVal}`);
    }
  }

  // 2. Update Composer (C:)
  if (updates.composer !== undefined) {
    const composerVal = updates.composer.trim();
    const composerIdx = findHeaderIndex('C:');
    if (composerIdx >= 0) {
      if (composerVal) {
        updatedLines[composerIdx] = `C:${composerVal}`;
      } else {
        updatedLines.splice(composerIdx, 1);
      }
    } else if (composerVal) {
      const titleIdx = findHeaderIndex('T:');
      const xIdx = findHeaderIndex('X:');
      const insertAt = titleIdx >= 0 ? titleIdx + 1 : xIdx >= 0 ? xIdx + 1 : 0;
      updatedLines.splice(insertAt, 0, `C:${composerVal}`);
    }
  }

  // 3. Update Meter (M:)
  if (updates.meter !== undefined) {
    const meterVal = updates.meter.trim();
    const meterIdx = findHeaderIndex('M:');
    if (meterIdx >= 0) {
      if (meterVal) {
        updatedLines[meterIdx] = `M:${meterVal}`;
      } else {
        updatedLines.splice(meterIdx, 1);
      }
    } else if (meterVal) {
      const keyIdx = findHeaderIndex('K:');
      const insertAt = keyIdx >= 0 ? keyIdx : updatedLines.length;
      updatedLines.splice(insertAt, 0, `M:${meterVal}`);
    }
  }

  // 4. Update Tempo (Q:)
  if (updates.tempoBpm !== undefined || updates.tempoText !== undefined) {
    let qString: string | undefined;
    if (updates.tempoBpm !== undefined) {
      const unit = updates.tempoUnit || '1/4';
      qString = `Q:${unit}=${updates.tempoBpm}`;
    } else if (updates.tempoText !== undefined) {
      const parsed = validateTempo(updates.tempoText);
      if (parsed.valid && parsed.bpm) {
        const unit = parsed.tempoUnit || '1/4';
        qString = `Q:${unit}=${parsed.bpm}`;
      } else if (updates.tempoText.trim()) {
        qString = `Q:${updates.tempoText.trim()}`;
      }
    }

    const tempoIdx = findHeaderIndex('Q:');
    if (tempoIdx >= 0) {
      if (qString) {
        updatedLines[tempoIdx] = qString;
      } else {
        updatedLines.splice(tempoIdx, 1);
      }
    } else if (qString) {
      const keyIdx = findHeaderIndex('K:');
      const insertAt = keyIdx >= 0 ? keyIdx : updatedLines.length;
      updatedLines.splice(insertAt, 0, qString);
    }
  }

  // 5. Update Key (K:)
  if (updates.key !== undefined) {
    const keyVal = updates.key.trim();
    const keyIdx = findHeaderIndex('K:');
    if (keyIdx >= 0) {
      if (keyVal) {
        updatedLines[keyIdx] = `K:${keyVal}`;
      }
    } else if (keyVal) {
      updatedLines.push(`K:${keyVal}`);
    }
  }

  return updatedLines.join('\n');
}
