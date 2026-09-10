/**
 * Pure JavaScript ABC measure operations: extraction, slicing, insertion, deletion, and replacement.
 */

export const splitHeadersAndBody = (abcSource) => {
  const lines = abcSource.split(/\r?\n/);
  const headerLines = [];
  const bodyLines = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inHeader) {
      if (/^[A-Za-z]:/.test(trimmed)) {
        headerLines.push(line);
        if (trimmed.startsWith('K:')) {
          inHeader = false; // standard ABC tunes start body after K:
        }
      } else if (trimmed === '') {
        headerLines.push(line);
      } else {
        inHeader = false;
        bodyLines.push(line);
      }
    } else {
      bodyLines.push(line);
    }
  }

  return {
    headers: headerLines.join('\n'),
    body: bodyLines.join('\n'),
  };
};

/**
 * Returns an array of measure text strings across the tune.
 */
export const measureBodies = (abcSource) => {
  const { body } = splitHeadersAndBody(abcSource);
  // Split on bar lines '|' that are not inside inline fields or quotes
  return body
    .split('|')
    .map((part) => part.replace(/[[\]]/g, '').trim())
    .filter(Boolean);
};

/**
 * Parses ABC body into voices with measures.
 * Handles both single-voice tunes and multi-voice tunes with V: headers.
 */
export const parseVoicesAndMeasures = (abcSource) => {
  const lines = abcSource.split(/\r?\n/);
  const headers = [];
  const voices = new Map(); // voiceId -> array of measures
  let currentVoiceId = '1';
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inHeader && /^[A-Za-z]:/.test(trimmed)) {
      headers.push(line);
      if (trimmed.startsWith('K:')) {
        inHeader = false;
      }
      continue;
    }

    // Voice switch inline or line
    const voiceMatch = trimmed.match(/^V:\s*([^\s\]]+)/) || trimmed.match(/\[V:\s*([^\]\s]+)\]/);
    if (voiceMatch) {
      currentVoiceId = voiceMatch[1];
      if (!voices.has(currentVoiceId)) {
        voices.set(currentVoiceId, []);
      }
      // If line contains more after voice declaration, parse it
      const remainder = trimmed.replace(/^V:\s*[^\s\]]+/, '').replace(/\[V:\s*[^\]\s]+\]/, '').trim();
      if (remainder) {
        appendLineMeasures(voices.get(currentVoiceId), remainder);
      }
      continue;
    }

    if (!voices.has(currentVoiceId)) {
      voices.set(currentVoiceId, []);
    }

    if (trimmed && !trimmed.startsWith('%')) {
      appendLineMeasures(voices.get(currentVoiceId), line);
    }
  }

  if (voices.size === 0) {
    voices.set('1', []);
  }

  return {
    headers: headers.join('\n'),
    voices,
  };
};

const appendLineMeasures = (measureList, text) => {
  // Split on bar lines '|', keeping track of non-empty bars
  const rawBars = text.split(/(?<=\|)/);
  for (const rawBar of rawBars) {
    const trimmed = rawBar.trim();
    if (!trimmed) continue;
    if (trimmed === '|' || trimmed === '||' || trimmed === '|]' || trimmed === ':|') {
      if (measureList.length > 0) {
        measureList[measureList.length - 1] += ` ${trimmed}`;
      }
    } else {
      measureList.push(rawBar);
    }
  }
};

/**
 * Reads an exact range of written measures (1-indexed, inclusive).
 */
export const sliceMeasureRange = (abcSource, startMeasure, endMeasure, voiceId = null) => {
  const { headers, voices } = parseVoicesAndMeasures(abcSource);
  const voiceEntries = Array.from(voices.entries());

  if (voiceEntries.length === 0) {
    return { headers, selectedAbc: '', measureCount: 0 };
  }

  const selectedVoices = [];

  for (const [id, measures] of voiceEntries) {
    if (voiceId && voiceId !== id) continue;
    const startIndex = Math.max(0, startMeasure - 1);
    const endIndex = Math.min(measures.length, endMeasure);
    const sliced = measures.slice(startIndex, endIndex);

    if (sliced.length > 0) {
      const voiceBody = sliced.map((m) => m.trim()).join(' ');
      const formatted = voiceEntries.length > 1 || voiceId ? `V:${id}\n${voiceBody}` : voiceBody;
      selectedVoices.push(formatted);
    }
  }

  const selectedAbc = [headers, ...selectedVoices].filter(Boolean).join('\n\n');
  return {
    headers,
    selectedAbc,
    measureCount: Math.max(0, endMeasure - startMeasure + 1),
  };
};

/**
 * Inserts count measures before or after targetMeasure (1-indexed).
 */
export const insertMeasures = (abcSource, targetMeasure, position = 'after', count = 1, abcContent = '') => {
  const { headers, voices } = parseVoicesAndMeasures(abcSource);
  const defaultBar = abcContent || ' z4 |';

  for (const [, measures] of voices.entries()) {
    const insertIndex = position === 'before'
      ? Math.max(0, targetMeasure - 1)
      : Math.min(measures.length, targetMeasure);
    const newMeasures = Array.from({ length: count }, () => defaultBar);
    measures.splice(insertIndex, 0, ...newMeasures);
  }

  return assembleAbc(headers, voices);
};

/**
 * Deletes measures between startMeasure and endMeasure (inclusive, 1-indexed).
 */
export const deleteMeasures = (abcSource, startMeasure, endMeasure) => {
  const { headers, voices } = parseVoicesAndMeasures(abcSource);
  const startIndex = Math.max(0, startMeasure - 1);
  const deleteCount = Math.max(0, endMeasure - startMeasure + 1);

  for (const [, measures] of voices.entries()) {
    measures.splice(startIndex, deleteCount);
  }

  return assembleAbc(headers, voices);
};

/**
 * Replaces measures between startMeasure and endMeasure with replacement ABC.
 */
export const replaceMeasures = (abcSource, startMeasure, endMeasure, replacementAbc) => {
  const { headers, voices } = parseVoicesAndMeasures(abcSource);
  const { voices: replacementVoices } = parseVoicesAndMeasures(replacementAbc);
  const startIndex = Math.max(0, startMeasure - 1);
  const deleteCount = Math.max(0, endMeasure - startMeasure + 1);

  for (const [voiceId, measures] of voices.entries()) {
    const repMeasures = replacementVoices.get(voiceId) || replacementVoices.get('1') || [replacementAbc];
    measures.splice(startIndex, deleteCount, ...repMeasures);
  }

  return assembleAbc(headers, voices);
};

const assembleAbc = (headers, voices) => {
  const parts = [headers];
  const entries = Array.from(voices.entries());

  if (entries.length === 1 && entries[0][0] === '1') {
    const body = entries[0][1].map((m) => m.trim()).filter(Boolean).join(' ');
    parts.push(body.endsWith('|') ? body : `${body} |`);
  } else {
    for (const [id, measures] of entries) {
      const body = measures.map((m) => m.trim()).filter(Boolean).join(' ');
      parts.push(`V:${id}\n${body.endsWith('|') ? body : `${body} |`}`);
    }
  }

  return parts.filter(Boolean).join('\n\n');
};
