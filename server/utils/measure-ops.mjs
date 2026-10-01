import abcjs from 'abcjs';
import { computeScoreMeasureMapping as sharedMeasureMapping } from '../../shared/score-timing.mjs';
import { createVoiceResolver, isNotationOffset } from '../../shared/abc-source.mjs';

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

export const stripComments = (text) => {
  if (!text || !text.includes('%')) return text;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf('%');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
};

const isVoicePropertyString = (rest) => {
  if (!rest) return true;
  if (rest.includes('|')) return false;
  const knownClefs = new Set(['treble', 'bass', 'alto', 'tenor', 'perc', 'none', 'baritone', 'mezzo', 'soprano']);
  const tokens = rest.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return tokens.every((tok) => {
    if (knownClefs.has(tok.toLowerCase())) return true;
    if (/^[a-zA-Z]+=(?:"[^"]*"|\S+)$/.test(tok)) return true;
    return false;
  });
};

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function simplifyFraction(num, den) {
  if (den === 0) return { num, den: 1 };
  const divisor = gcd(num, den);
  return { num: Math.round(num / divisor), den: Math.round(den / divisor) };
}

function formatMeter(meter) {
  if (!meter) return null;
  if (typeof meter.type === 'string') {
    if (meter.type === 'common_time') return '4/4';
    if (meter.type === 'cut_time') return '2/2';
  }
  if (Array.isArray(meter.value) && meter.value.length > 0) {
    const first = meter.value[0];
    if (first && typeof first.num !== 'undefined' && typeof first.den !== 'undefined') {
      return `${first.num}/${first.den}`;
    }
  }
  if (typeof meter.num !== 'undefined' && typeof meter.den !== 'undefined') {
    return `${meter.num}/${meter.den}`;
  }
  return null;
}

function getMeterDuration(tune) {
  const meter = tune.getMeterFraction ? tune.getMeterFraction() : null;
  if (meter && meter.den && meter.den > 0) {
    return simplifyFraction(meter.num, meter.den);
  }
  const formatted = formatMeter(tune.metaText?.meter);
  if (formatted) {
    const [numStr, denStr] = formatted.split('/');
    const num = parseInt(numStr, 10);
    const den = parseInt(denStr, 10);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return simplifyFraction(num, den);
    }
  }
  return { num: 4, den: 4 };
}

function getVoiceMeasureDurations(elements) {
  const measureDurations = [];
  let currentNum = 0;
  let currentDen = 1;
  let hasEvents = false;

  for (const element of elements) {
    if (element.el_type === 'bar') {
      if (hasEvents) {
        measureDurations.push({ num: currentNum, den: currentDen });
        currentNum = 0;
        currentDen = 1;
        hasEvents = false;
        if (measureDurations.length >= 2) break;
      }
      continue;
    }

    if (element.el_type !== 'note' || typeof element.duration !== 'number') {
      continue;
    }

    let multiplier = 1;
    if (element.startTriplet && element.tripletMultiplier) {
      multiplier = element.tripletMultiplier;
    }

    const rawRestText = element.rest?.text;
    const restCount = typeof rawRestText === 'number'
      ? rawRestText
      : typeof rawRestText === 'string' && /^\d+$/.test(rawRestText)
        ? Number(rawRestText)
        : 1;
    const multimeasureCount = element.rest?.type === 'multimeasure'
      && Number.isSafeInteger(restCount)
      && restCount > 1
      ? restCount
      : 1;

    if (multimeasureCount > 1) {
      const elemNum = Math.round(((element.duration * multiplier) / multimeasureCount) * 1920);
      const elemDen = 1920;
      const common = currentDen * elemDen;
      currentNum = currentNum * elemDen + elemNum * currentDen;
      currentDen = common;
      const simplified = simplifyFraction(currentNum, currentDen);
      currentNum = simplified.num;
      currentDen = simplified.den;
      hasEvents = true;
      measureDurations.push({ num: currentNum, den: currentDen });
      currentNum = 0;
      currentDen = 1;
      hasEvents = false;
      if (measureDurations.length >= 2) break;
      continue;
    }

    const elemNum = Math.round(element.duration * multiplier * 1920);
    const elemDen = 1920;
    const common = currentDen * elemDen;
    currentNum = currentNum * elemDen + elemNum * currentDen;
    currentDen = common;
    const simplified = simplifyFraction(currentNum, currentDen);
    currentNum = simplified.num;
    currentDen = simplified.den;
    hasEvents = true;
  }

  if (hasEvents && measureDurations.length < 2) {
    measureDurations.push({ num: currentNum, den: currentDen });
  }

  if (measureDurations.length === 0) return null;

  return {
    first: measureDurations[0],
    second: measureDurations[1],
  };
}

function getFirstTwoMeasureDurations(tune) {
  const voiceElementMap = new Map();
  for (const line of tune.lines || []) {
    let voiceSlot = 0;
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        const slot = voiceSlot++;
        const list = voiceElementMap.get(slot) || [];
        list.push(...voice);
        voiceElementMap.set(slot, list);
      }
    }
  }

  if (voiceElementMap.size === 0) return null;

  let maxFirst = null;
  let maxSecond = null;

  for (const [, elements] of voiceElementMap) {
    const durations = getVoiceMeasureDurations(elements);
    if (!durations) continue;
    if (!maxFirst || (durations.first.num * maxFirst.den - maxFirst.num * durations.first.den > 0)) {
      maxFirst = durations.first;
    }
    if (durations.second) {
      if (!maxSecond || (durations.second.num * maxSecond.den - maxSecond.num * durations.second.den > 0)) {
        maxSecond = durations.second;
      }
    }
  }

  if (!maxFirst) return null;

  return {
    first: maxFirst,
    ...(maxSecond ? { second: maxSecond } : {}),
  };
}

export const hasPickupMeasure = (abcSource) => {
  try {
    const tunes = abcjs.parseOnly(abcSource);
    const tune = tunes?.[0];
    if (!tune) return false;
    const durations = getFirstTwoMeasureDurations(tune);
    if (!durations || !durations.second) return false;
    const meterDuration = getMeterDuration(tune);
    const diff1 = durations.first.num * meterDuration.den - meterDuration.num * durations.first.den;
    const diff2 = durations.second.num * meterDuration.den - meterDuration.num * durations.second.den;
    return diff1 < 0 && diff2 >= 0;
  } catch {
    return false;
  }
};

export const isRepeatEndBar = (barType) => {
  if (!barType) return false;
  return (
    barType === 'bar_right_repeat' ||
    barType === 'bar_double_repeat' ||
    barType === 'bar_dbl_repeat' ||
    barType.includes('right_repeat') ||
    barType.includes('double_repeat') ||
    barType.includes('dbl_repeat') ||
    barType.includes(':|')
  );
};

export const computeScoreMeasureMapping = (tune, options) => sharedMeasureMapping(tune, options);

/**
 * Returns an array of measure text strings across the tune.
 */
export const measureBodies = (abcSource) => {
  const { voices } = parseVoicesAndMeasures(abcSource);
  let maxMeasures = 0;
  for (const measures of voices.values()) {
    if (measures.length > maxMeasures) {
      maxMeasures = measures.length;
    }
  }
  // Fallback to legacy split if no measures were detected
  if (maxMeasures === 0) {
    const { body } = splitHeadersAndBody(abcSource);
    return body
      .split('|')
      .map((part) => part.replace(/[[\]]/g, '').trim())
      .filter(Boolean);
  }
  const hasPickup = hasPickupMeasure(abcSource);
  const firstMeasureNumber = hasPickup ? 0 : 1;
  return Array.from({ length: maxMeasures }, (_, i) => `Measure ${i + firstMeasureNumber}`);
};

const isDirectiveOnlyLine = (text) => {
  const clean = text.replace(/%[^\r\n]*/g, '').trim();
  if (!clean) return false;
  if (/^[A-Za-z]:\s*[^|\r\n]+$/.test(clean)) return true;
  if (/^\[(?:[A-Za-z]:|clef=)[^\]|]+\]$/.test(clean)) return true;
  return false;
};

const formatDirective = (text) => {
  const clean = text.replace(/%[^\r\n]*/g, '').trim();
  if (clean.startsWith('[') && clean.endsWith(']')) return clean;
  if (/^clef=([a-zA-Z0-9_-]+)/.test(clean)) {
    return `[K:${clean}]`;
  }
  return `[${clean}]`;
};

/**
 * Parses ABC body into voices with measures.
 * Handles both single-voice tunes and multi-voice tunes with V: headers.
 */
export const parseVoicesAndMeasures = (abcSource) => {
  const lines = abcSource.split(/\r?\n/);
  const headers = [];
  const voices = new Map(); // voiceId -> array of measures
  const voiceDeclarations = new Map();
  const directives = [];
  const standaloneComments = [];
  const pendingVoiceDirectives = new Map();
  let currentVoiceId = null;
  let inHeader = true;

  const getPending = (id) => {
    if (!pendingVoiceDirectives.has(id)) pendingVoiceDirectives.set(id, []);
    return pendingVoiceDirectives.get(id);
  };

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    if (inHeader) {
      if (/^[A-Za-z]:/.test(line)) {
        headers.push(rawLine);
        if (line.startsWith('K:')) {
          inHeader = false;
        }
        continue;
      }
      if (line.startsWith('%%')) {
        headers.push(rawLine);
        continue;
      }
      inHeader = false;
    }

    if (line.startsWith('%%')) {
      directives.push(rawLine);
      continue;
    }

    const commentIdx = line.indexOf('%');
    const inlineComment = commentIdx === -1 ? '' : line.slice(commentIdx).trim();
    const notation = commentIdx === -1 ? line : line.slice(0, commentIdx).trim();
    if (!notation) {
      if (inlineComment) standaloneComments.push(inlineComment);
      continue;
    }

    // Voice switch inline or line
    const voiceMatch = notation.match(/^V:\s*([^\s\]]+)(.*)$/) || notation.match(/^\[V:\s*([^\s\]]+)\](.*)$/);
    if (voiceMatch) {
      currentVoiceId = voiceMatch[1];
      if (!voices.has(currentVoiceId)) {
        voices.set(currentVoiceId, []);
      }
      const rest = voiceMatch[2].trim();
      if (!rest || isVoicePropertyString(rest)) {
        if (!voiceDeclarations.has(currentVoiceId)) {
          voiceDeclarations.set(currentVoiceId, inlineComment ? `${notation} ${inlineComment}` : notation);
        } else if (rest) {
          // Mid-piece voice property change without notes (e.g. V:1 clef=bass)
          const clefMatch = rest.match(/\bclef=([a-zA-Z0-9_-]+)/);
          if (clefMatch) {
            getPending(currentVoiceId).push(`[K:clef=${clefMatch[1]}]`);
          }
        }
      } else {
        appendLineMeasures(voices.get(currentVoiceId), rest, inlineComment, getPending(currentVoiceId));
      }
      continue;
    }

    if (!currentVoiceId) {
      currentVoiceId = '1';
      if (!voices.has(currentVoiceId)) {
        voices.set(currentVoiceId, []);
      }
    }

    if (isDirectiveOnlyLine(notation)) {
      const directiveStr = formatDirective(notation);
      getPending(currentVoiceId).push(directiveStr);
      if (inlineComment) standaloneComments.push(inlineComment);
      continue;
    }

    appendLineMeasures(voices.get(currentVoiceId), notation, inlineComment, getPending(currentVoiceId));
  }

  for (const [vId, pending] of pendingVoiceDirectives) {
    if (pending.length > 0 && voices.has(vId)) {
      const list = voices.get(vId);
      if (list.length > 0) {
        list[list.length - 1] += ` ${pending.join(' ')}`;
      }
    }
  }

  if (voices.size === 0) {
    voices.set('1', []);
  }

  try {
    const tunes = abcjs.parseOnly(abcSource);
    const tune = tunes?.[0];
    if (tune) {
      const mapping = computeScoreMeasureMapping(tune, { voiceIdFor: createVoiceResolver(abcSource) });
      if (mapping && mapping.splitMeasures && mapping.splitMeasures.size > 0) {
        for (const measureList of voices.values()) {
          if (measureList.length === mapping.barToMeasure.length) {
            for (let i = mapping.barToMeasure.length - 1; i >= 1; i--) {
              if (mapping.barToMeasure[i] === mapping.barToMeasure[i - 1]) {
                measureList[i - 1] = `${measureList[i - 1]} ${measureList[i]}`;
                measureList.splice(i, 1);
              }
            }
          }
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return {
    headers: headers.join('\n'),
    voices,
    voiceDeclarations,
    directives,
    standaloneComments,
  };
};

const appendLineMeasures = (measureList, text, inlineComment = '', pendingList = []) => {
  const initialLength = measureList.length;
  let lineText = text;
  if (pendingList && pendingList.length > 0) {
    lineText = `${pendingList.join('\n')}\n${text}`;
    pendingList.length = 0;
  }
  const tokens = lineText.split(/(\[?\|[|\]:]*|:\|)/).filter(Boolean);
  let curBar = '';
  for (const tok of tokens) {
    curBar += tok;
    if (/(\[?\|[|\]:]*|:\|)$/.test(tok)) {
      const trimmed = curBar.trim();
      if (trimmed && !/^(\|+|:\||\|\]|\[\|)$/.test(trimmed)) {
        measureList.push(trimmed);
        curBar = '';
      }
    }
  }
  if (curBar.trim() && !/^(\|+|:\||\|\]|\[\||[$\\]+)$/.test(curBar.trim())) {
    measureList.push(curBar.trim());
  } else if (/^[$\\]+$/.test(curBar.trim()) && measureList.length > initialLength) {
    measureList[measureList.length - 1] += ` ${curBar.trim()}`;
  }
  if (inlineComment) {
    if (measureList.length > initialLength) {
      measureList[measureList.length - 1] = `${measureList[measureList.length - 1]} ${inlineComment}`;
    }
  }
};

const hasTerminalBarline = (body) => /(?:\|\]|:\||\|:|\|\||\|)$/.test(body.replace(/%[^\r\n]*$/, '').trim());

const extractActiveStateFromMeasure = (text) => {
  let key = null;
  let meter = null;
  let unitLength = null;
  let clef = null;

  const clean = stripComments(text);

  const keyMatches = [...clean.matchAll(/(?:\[K:|(?:^|\n|\s)K:)\s*([^\r\n\]]+)/g)];
  for (const match of keyMatches) {
    if (!isNotationOffset(clean, match.index)) continue;
    let content = match[1].replace(/\]$/, '').trim();
    const clefMatch = content.match(/\bclef=([a-zA-Z0-9_-]+)/);
    if (clefMatch) {
      clef = clefMatch[1];
      content = content.replace(/\bclef=[a-zA-Z0-9_-]+/, '').trim();
    }
    if (content) key = content;
  }

  const meterMatches = [...clean.matchAll(/(?:\[M:|(?:^|\n|\s)M:)\s*([^\r\n\]\s]+)/g)];
  for (const match of meterMatches) {
    if (!isNotationOffset(clean, match.index)) continue;
    meter = match[1].replace(/\]$/, '').trim();
  }

  const unitLengthMatches = [...clean.matchAll(/(?:\[L:|(?:^|\n|\s)L:)\s*([^\r\n\]\s]+)/g)];
  for (const match of unitLengthMatches) {
    if (!isNotationOffset(clean, match.index)) continue;
    unitLength = match[1].replace(/\]$/, '').trim();
  }

  const clefMatches = [...clean.matchAll(/(?:\[clef=|\bclef=)\s*([a-zA-Z0-9_-]+)/g)];
  for (const match of clefMatches) {
    if (!isNotationOffset(clean, match.index)) continue;
    clef = match[1];
  }

  return { key, meter, unitLength, clef };
};

const updateHeaderField = (headers, prefix, newValue) => {
  const regex = new RegExp(`^${prefix}:.*$`, 'm');
  if (regex.test(headers)) {
    return headers.replace(regex, `${prefix}:${newValue}`);
  }
  return `${headers}\n${prefix}:${newValue}`;
};

/**
 * Reads an exact range of written measures (0/1-indexed, inclusive).
 */
export const sliceMeasureRange = (abcSource, startMeasure, endMeasure, voiceId = null) => {
  const hasPickup = hasPickupMeasure(abcSource);
  const firstMeasureNumber = hasPickup ? 0 : 1;
  const parsed = parseVoicesAndMeasures(abcSource);
  const { voices, voiceDeclarations } = parsed;
  let { headers } = parsed;
  const voiceEntries = Array.from(voices.entries());

  if (voiceEntries.length === 0) {
    return { headers, selectedAbc: '', measureCount: 0 };
  }

  const effectiveStart = Math.max(startMeasure, firstMeasureNumber);
  const startIndex = Math.max(0, effectiveStart - firstMeasureNumber);

  // Scan preceding measures across voices to determine active key, meter, unit length, and clefs at startIndex
  let activeScoreKey = null;
  let activeScoreMeter = null;
  let activeScoreUnitLength = null;
  const activeKeys = new Map();
  const activeClefs = new Map();

  for (let i = 0; i < startIndex; i++) {
    for (const [vId, mList] of voiceEntries) {
      if (i < mList.length) {
        const state = extractActiveStateFromMeasure(mList[i]);
        if (state.key) {
          activeScoreKey = state.key;
          activeKeys.set(vId, state.key);
        }
        if (state.meter) activeScoreMeter = state.meter;
        if (state.unitLength) activeScoreUnitLength = state.unitLength;
        if (state.clef) activeClefs.set(vId, state.clef);
      }
    }
  }

  const defaultKeyMatch = headers.match(/^K:\s*([^\r\n]+)/m);
  const defaultScoreKey = defaultKeyMatch ? defaultKeyMatch[1].trim() : null;

  for (const [vId] of voiceEntries) {
    if (!activeKeys.has(vId) && defaultScoreKey) {
      activeKeys.set(vId, defaultScoreKey);
    }
  }

  // Determine whether active keys are polytonal (different across voices)
  const distinctKeys = new Set(activeKeys.values());
  const isPolytonal = distinctKeys.size > 1;

  if (activeScoreKey && !isPolytonal) {
    headers = updateHeaderField(headers, 'K', activeScoreKey);
  }
  if (activeScoreMeter) {
    headers = updateHeaderField(headers, 'M', activeScoreMeter);
  }
  if (activeScoreUnitLength) {
    headers = updateHeaderField(headers, 'L', activeScoreUnitLength);
  }

  const selectedVoices = [];

  for (const [id, measures] of voiceEntries) {
    if (voiceId && voiceId !== id) continue;
    const voiceStartIndex = Math.max(0, effectiveStart - firstMeasureNumber);
    const voiceEndIndex = Math.min(measures.length, Math.max(0, endMeasure - firstMeasureNumber + 1));
    const sliced = measures.slice(voiceStartIndex, voiceEndIndex);

    if (sliced.length > 0) {
      let voiceBody = sliced.map((m) => m.trim()).join('\n');
      if (isPolytonal && activeKeys.has(id)) {
        const voiceKey = activeKeys.get(id);
        if (!voiceBody.startsWith('[K:') && !voiceBody.startsWith('K:')) {
          voiceBody = `[K:${voiceKey}] ${voiceBody}`;
        }
      }
      let declaration = voiceDeclarations?.get(id) || `V:${id}`;
      const activeClef = activeClefs.get(id);
      if (activeClef) {
        if (/\bclef=[a-zA-Z0-9_-]+/.test(declaration)) {
          declaration = declaration.replace(/\bclef=[a-zA-Z0-9_-]+/, `clef=${activeClef}`);
        } else {
          declaration = `${declaration} clef=${activeClef}`;
        }
      }
      const formatted = voiceEntries.length > 1 || voiceId ? `${declaration}\n${voiceBody}` : voiceBody;
      selectedVoices.push(formatted);
    }
  }

  const selectedAbc = [headers, ...selectedVoices].filter(Boolean).join('\n\n');
  return {
    headers,
    selectedAbc,
    measureCount: Math.max(0, endMeasure - effectiveStart + 1),
  };
};

/**
 * Inserts count measures before or after targetMeasure (0/1-indexed).
 */
export const insertMeasures = (abcSource, targetMeasure, position = 'after', count = 1, abcContent = '') => {
  const hasPickup = hasPickupMeasure(abcSource);
  const firstMeasureNumber = hasPickup ? 0 : 1;
  const parsed = parseVoicesAndMeasures(abcSource);
  const { headers, voices } = parsed;
  const defaultBar = abcContent || ' z4 |';

  for (const [, measures] of voices.entries()) {
    const targetIndex = targetMeasure - firstMeasureNumber;
    const insertIndex = position === 'before'
      ? Math.max(0, targetIndex)
      : Math.min(measures.length, Math.max(0, targetIndex + 1));
    const newMeasures = Array.from({ length: count }, () => defaultBar);
    measures.splice(insertIndex, 0, ...newMeasures);
  }

  return assembleAbc(headers, voices, parsed);
};

/**
 * Deletes measures between startMeasure and endMeasure (inclusive, 0/1-indexed).
 */
export const deleteMeasures = (abcSource, startMeasure, endMeasure) => {
  const hasPickup = hasPickupMeasure(abcSource);
  const firstMeasureNumber = hasPickup ? 0 : 1;
  const parsed = parseVoicesAndMeasures(abcSource);
  const { headers, voices } = parsed;
  const effectiveStart = Math.max(startMeasure, firstMeasureNumber);
  const startIndex = Math.max(0, effectiveStart - firstMeasureNumber);
  const deleteCount = Math.max(0, endMeasure - effectiveStart + 1);

  for (const [, measures] of voices.entries()) {
    measures.splice(startIndex, deleteCount);
  }

  return assembleAbc(headers, voices, parsed);
};

/**
 * Replaces measures between startMeasure and endMeasure with replacement ABC.
 */
export const replaceMeasures = (abcSource, startMeasure, endMeasure, replacementAbc) => {
  const hasPickup = hasPickupMeasure(abcSource);
  const firstMeasureNumber = hasPickup ? 0 : 1;
  const parsed = parseVoicesAndMeasures(abcSource);
  const { headers, voices } = parsed;
  const { voices: replacementVoices } = parseVoicesAndMeasures(replacementAbc);
  const effectiveStart = Math.max(startMeasure, firstMeasureNumber);
  const startIndex = Math.max(0, effectiveStart - firstMeasureNumber);
  const deleteCount = Math.max(0, endMeasure - effectiveStart + 1);

  for (const [voiceId, measures] of voices.entries()) {
    const repMeasures = replacementVoices.get(voiceId) || replacementVoices.get('1') || [replacementAbc];
    measures.splice(startIndex, deleteCount, ...repMeasures);
  }

  return assembleAbc(headers, voices, parsed);
};

const assembleAbc = (headers, voices, metadata = {}) => {
  const parts = [headers];
  const entries = Array.from(voices.entries());
  const voiceDeclarations = metadata.voiceDeclarations || new Map();

  if (metadata.directives?.length) {
    parts.push(metadata.directives.join('\n'));
  }

  if (entries.length === 1 && entries[0][0] === '1' && !voiceDeclarations.has('1')) {
    const body = entries[0][1].map((m) => m.trim()).filter(Boolean).join('\n');
    parts.push(hasTerminalBarline(body) ? body : `${body} |`);
  } else {
    for (const [id, measures] of entries) {
      const body = measures.map((m) => m.trim()).filter(Boolean).join('\n');
      const declaration = voiceDeclarations.get(id) || `V:${id}`;
      parts.push(`${declaration}\n${hasTerminalBarline(body) ? body : `${body} |`}`);
    }
  }

  if (metadata.standaloneComments?.length) {
    parts.push(metadata.standaloneComments.join('\n'));
  }

  return parts.filter(Boolean).join('\n');
};
