export interface ScoreMetadata {
  title?: string;
  subtitle?: string;
  composer?: string;
  author?: string;
  rhythm?: string;
  origin?: string;
  source?: string;
  book?: string;
  unitLength?: string;
  key?: string;
  meter?: string;
  tempoText?: string;
  tempoBpm?: number;
  tempoUnit?: string;
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

type HeaderRange = {
  start: number;
  end: number;
};

function findFirstTuneHeaderRange(lines: string[]): HeaderRange {
  const firstTuneIndex = lines.findIndex((line) => line.trim().startsWith('X:'));
  const start = firstTuneIndex >= 0 ? firstTuneIndex : 0;
  const keyIndex = lines.findIndex((line, index) => (
    index >= start && line.trim().startsWith('K:')
  ));

  if (keyIndex >= 0) {
    return { start, end: keyIndex + 1 };
  }

  const nextTuneIndex = lines.findIndex((line, index) => (
    index > start && line.trim().startsWith('X:')
  ));
  return { start, end: nextTuneIndex >= 0 ? nextTuneIndex : lines.length };
}

function sanitizeAbcHeaderValue(value: string): string {
  const singleLineValue = value.replace(/[\r\n\u2028\u2029]+/g, ' ');
  const withoutControlCharacters = Array.from(singleLineValue)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint === 9 || (codePoint >= 32 && codePoint !== 127);
    })
    .join('');

  return withoutControlCharacters
    .replace(/(^|[^\\])%/g, '$1\\%')
    .trim();
}

function parseAbcHeaderValue(value: string): string {
  return value.replace(/\\%/g, '%').trim();
}

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
  const remainingTokens = parts.slice(1);

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

  let clefToken: string | undefined;
  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const clefPrefixMatch = token.match(/^clef=(.+)$/i);
    if (clefPrefixMatch) {
      const clefName = clefPrefixMatch[1].toLowerCase();
      if (VALID_CLEFS.has(clefName)) {
        clefToken = `clef=${clefName}`;
      } else {
        return { valid: false, error: `Unrecognized clef "${clefName}".` };
      }
    } else if (token.toLowerCase() === 'clef' && remainingTokens[i + 1]) {
      const clefName = remainingTokens[i + 1].toLowerCase();
      if (VALID_CLEFS.has(clefName)) {
        clefToken = `clef=${clefName}`;
        i++;
      } else {
        return { valid: false, error: `Unrecognized clef "${clefName}".` };
      }
    } else if (VALID_CLEFS.has(token.toLowerCase())) {
      clefToken = `clef=${token.toLowerCase()}`;
    } else {
      return { valid: false, error: `Unrecognized qualifier "${token}".` };
    }
  }

  const modeString = normalizedMode
    ? (normalizedMode === 'm' ? 'm' : ` ${normalizedMode}`)
    : '';

  const resultKey = [
    `${root}${modeString}`,
    clefToken,
  ].filter(Boolean).join(' ');

  return {
    valid: true,
    value: resultKey,
  };
}

/**
 * Validates and normalizes time signatures / meter strings.
 * Supports standard fractional meters (e.g., "4/4", "3/8", "6/8", "12/8", "2/2", "3/4"),
 * and standard shorthand ("C", "C|", "none").
 */
export function validateMeter(rawMeter: string): ValidationResult<string> {
  const trimmed = rawMeter.trim();
  if (!trimmed) {
    return { valid: false, error: 'Time signature cannot be empty.' };
  }

  if (/^(?:C|common)$/i.test(trimmed)) {
    return { valid: true, value: 'C' };
  }
  if (/^(?:C\||cut)$/i.test(trimmed)) {
    return { valid: true, value: 'C|' };
  }
  if (/^none$/i.test(trimmed)) {
    return { valid: true, value: 'none' };
  }

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) {
    return {
      valid: false,
      error: `Invalid meter format "${trimmed}". Use standard fractions like 4/4, 3/4, 6/8, or C/C|.`,
    };
  }

  const numerator = parseInt(match[1], 10);
  const denominator = parseInt(match[2], 10);

  if (numerator < 1 || numerator > 32) {
    return {
      valid: false,
      error: `Meter beats (${numerator}) must be between 1 and 32.`,
    };
  }

  const validDenominators = new Set([1, 2, 4, 8, 16, 32]);
  if (!validDenominators.has(denominator)) {
    return {
      valid: false,
      error: `Meter note value (${denominator}) must be 1, 2, 4, 8, 16, or 32.`,
    };
  }

  return {
    valid: true,
    value: `${numerator}/${denominator}`,
  };
}

/**
 * Validates and parses a tempo string (BPM integer or ABC Q notation).
 */
export function validateTempo(rawTempo: string): ValidationResult<string> & { bpm?: number; tempoUnit?: string } {
  const trimmed = rawTempo.trim();
  if (!trimmed) {
    return { valid: false, error: 'Tempo cannot be empty.' };
  }

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
  let subtitle: string | undefined;
  let composer: string | undefined;
  let author: string | undefined;
  let rhythm: string | undefined;
  let origin: string | undefined;
  let source: string | undefined;
  let book: string | undefined;
  let key: string | undefined;
  let meter: string | undefined;
  let tempoText: string | undefined;
  let tempoBpm: number | undefined;
  let tempoUnit = '1/4';
  let unitLength: string | undefined;

  const lines = abc.split(/\r?\n/);
  const headerRange = findFirstTuneHeaderRange(lines);
  for (const line of lines.slice(headerRange.start, headerRange.end)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('T:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val) {
        if (!title) {
          title = val;
        } else if (!subtitle) {
          subtitle = val;
        }
      }
    } else if (trimmed.startsWith('C:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val && !composer) composer = val;
    } else if (trimmed.startsWith('A:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val && !author) author = val;
    } else if (trimmed.startsWith('R:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val && !rhythm) rhythm = val;
    } else if (trimmed.startsWith('O:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val && !origin) origin = val;
    } else if (trimmed.startsWith('S:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val && !source) source = val;
    } else if (trimmed.startsWith('B:')) {
      const val = parseAbcHeaderValue(trimmed.slice(2));
      if (val && !book) book = val;
    } else if (trimmed.startsWith('K:')) {
      const val = trimmed.slice(2).trim();
      if (val && !key) key = val;
    } else if (trimmed.startsWith('M:')) {
      const val = trimmed.slice(2).trim();
      if (val && !meter) meter = val;
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
    }
  }

  return {
    title,
    subtitle,
    composer,
    author,
    rhythm,
    origin,
    source,
    book,
    key,
    meter,
    tempoText,
    tempoBpm,
    tempoUnit,
    unitLength,
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

  const findHeaderIndices = (prefix: string): number[] => {
    const range = findFirstTuneHeaderRange(updatedLines);
    const indices: number[] = [];
    for (let index = range.start; index < range.end; index += 1) {
      if (updatedLines[index].trim().startsWith(prefix)) indices.push(index);
    }
    return indices;
  };

  const findHeaderIndex = (prefix: string): number => findHeaderIndices(prefix)[0] ?? -1;

  const findLastHeaderIndex = (prefix: string): number => findHeaderIndices(prefix).at(-1) ?? -1;

  const updateSimpleHeader = (fieldPrefix: string, value: string | undefined, afterPrefix = 'T:') => {
    if (value === undefined) return;
    const trimmedVal = sanitizeAbcHeaderValue(value);
    const idx = findHeaderIndex(fieldPrefix);
    if (idx >= 0) {
      if (trimmedVal) {
        updatedLines[idx] = `${fieldPrefix}${trimmedVal}`;
      } else {
        updatedLines.splice(idx, 1);
      }
    } else if (trimmedVal) {
      const afterIdx = findLastHeaderIndex(afterPrefix);
      const xIdx = findHeaderIndex('X:');
      const insertAt = afterIdx >= 0 ? afterIdx + 1 : xIdx >= 0 ? xIdx + 1 : 0;
      updatedLines.splice(insertAt, 0, `${fieldPrefix}${trimmedVal}`);
    }
  };

  // 1. Update Title (T:)
  if (updates.title !== undefined) {
    const titleVal = sanitizeAbcHeaderValue(updates.title);
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

  // 2. Update Subtitle (the second T: field)
  if (updates.subtitle !== undefined) {
    const subtitleVal = sanitizeAbcHeaderValue(updates.subtitle);
    const titleIndices = findHeaderIndices('T:');
    const subtitleIdx = titleIndices[1] ?? -1;
    if (subtitleIdx >= 0) {
      if (subtitleVal) {
        updatedLines[subtitleIdx] = `T:${subtitleVal}`;
      } else {
        updatedLines.splice(subtitleIdx, 1);
      }
    } else if (subtitleVal) {
      const titleIdx = titleIndices[0] ?? -1;
      const xIdx = findHeaderIndex('X:');
      const insertAt = titleIdx >= 0 ? titleIdx + 1 : xIdx >= 0 ? xIdx + 1 : 0;
      updatedLines.splice(insertAt, 0, `T:${subtitleVal}`);
    }
  }

  // 3. Update Composer (C:), Author (A:), Rhythm (R:), Origin (O:), Source (S:), Book (B:)
  updateSimpleHeader('C:', updates.composer, 'T:');
  updateSimpleHeader('A:', updates.author, 'C:');
  updateSimpleHeader('R:', updates.rhythm, 'T:');
  updateSimpleHeader('O:', updates.origin, 'T:');
  updateSimpleHeader('S:', updates.source, 'T:');
  updateSimpleHeader('B:', updates.book, 'T:');

  // 4. Update Meter (M:)
  if (updates.meter !== undefined) {
    const meterVal = sanitizeAbcHeaderValue(updates.meter);
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

  // 5. Update Tempo (Q:)
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
        qString = `Q:${sanitizeAbcHeaderValue(updates.tempoText)}`;
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

  // 6. Update Key (K:)
  if (updates.key !== undefined) {
    const keyVal = sanitizeAbcHeaderValue(updates.key);
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
