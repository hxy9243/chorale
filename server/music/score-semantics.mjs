import abcjs from 'abcjs';

/**
 * Deterministic musical score semantics layer for Chorale.
 * Resolves full-score voice layouts, exact rational timing, sounding pitches,
 * accidentals, octave transposition, per-note ties, and simultaneous-note slices.
 */

export function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function createRational(numerator, denominator = 1) {
  if (denominator === 0) throw new RangeError('Denominator cannot be zero.');
  const sign = denominator < 0 ? -1 : 1;
  const num = Math.round(numerator * sign);
  const den = Math.round(Math.abs(denominator));
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}

export function addRational(a, b) {
  return createRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function subRational(a, b) {
  return createRational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function compareRational(a, b) {
  const diff = a.num * b.den - b.num * a.den;
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function rationalToText(r) {
  return r.den === 1 ? `${r.num}` : `${r.num}/${r.den}`;
}

const PITCH_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL_OFFSETS = { '#': 1, '##': 2, '^': 1, '^^': 2, b: -1, bb: -2, '_': -1, '__': -2, '': 0, '=': 0 };

export function pitchHeight(pitchStr) {
  const match = pitchStr.match(/^([A-G])([#b]*)(-?\d+)$/);
  if (!match) return 0;
  const step = match[1];
  const acc = match[2];
  const octave = parseInt(match[3], 10);
  return octave * 12 + SEMITONES[step] + (ACCIDENTAL_OFFSETS[acc] || 0);
}

const SHARPS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLATS_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const ROOT_SHARPS = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

const MODE_SHIFT = {
  maj: 0, major: 0, ion: 0, ionian: 0, '': 0,
  m: -3, min: -3, minor: -3, aeo: -3, aeolian: -3,
  dor: -2, dorian: -2,
  phr: -4, phrygian: -4,
  lyd: 1, lydian: 1,
  mix: -1, mixolydian: -1,
  loc: -5, locrian: -5,
};

export function parseKeySignature(keyStr) {
  if (!keyStr) return { sharps: [], flats: [], tonic: 'C', mode: 'major', name: 'C major' };
  const clean = keyStr.trim().replace(/^\[K:\s*|\]$/g, '').trim();
  const match = clean.match(/^([A-G][#b]?)(.*?)$/);
  if (!match) return { sharps: [], flats: [], tonic: 'C', mode: 'major', name: 'C major' };
  const root = match[1];
  const modeRaw = match[2].trim().toLowerCase();
  const shift = MODE_SHIFT[modeRaw] !== undefined ? MODE_SHIFT[modeRaw] : (modeRaw.startsWith('m') ? -3 : 0);
  const baseSharps = ROOT_SHARPS[root] !== undefined ? ROOT_SHARPS[root] : 0;
  const totalSharps = baseSharps + shift;

  const sharps = [];
  const flats = [];
  if (totalSharps > 0) {
    for (let i = 0; i < Math.min(totalSharps, 7); i++) sharps.push(SHARPS_ORDER[i]);
  } else if (totalSharps < 0) {
    for (let i = 0; i < Math.min(-totalSharps, 7); i++) flats.push(FLATS_ORDER[i]);
  }
  const modeName = (modeRaw.startsWith('m') && !modeRaw.startsWith('mix')) ? 'minor' : 'major';
  return { sharps, flats, tonic: root, mode: modeName, name: `${root} ${modeName}` };
}

function isNotationOffset(abc, offset) {
  const lineStart = abc.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  let inQuotedAnnotation = false;
  for (let index = lineStart; index < offset; index += 1) {
    const character = abc[index];
    if (character === '"') {
      let precedingBackslashes = 0;
      for (let cursor = index - 1; cursor >= lineStart && abc[cursor] === '\\'; cursor -= 1) {
        precedingBackslashes += 1;
      }
      if (precedingBackslashes % 2 === 0) inQuotedAnnotation = !inQuotedAnnotation;
    } else if (character === '%' && !inQuotedAnnotation) {
      return false;
    }
  }
  return !inQuotedAnnotation;
}

function collectDeclaredVoiceIds(abc) {
  const ids = [];
  const add = (id) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const match of abc.matchAll(/^V:\s*([^\s%\]]+)/gm)) add(match[1]);
  for (const match of abc.matchAll(/\[V:\s*([^\]\s%]+)/g)) {
    if (match.index !== undefined && isNotationOffset(abc, match.index)) add(match[1]);
  }
  return ids;
}

function collectBodyVoiceMarkers(abc) {
  const markers = [];
  for (const match of abc.matchAll(/\[V:\s*([^\]\s%]+)/g)) {
    if (match.index !== undefined && isNotationOffset(abc, match.index)) {
      markers.push({ offset: match.index, voiceId: match[1] });
    }
  }
  for (const match of abc.matchAll(/^V:\s*([^\s%\]]+)/gm)) {
    if (match.index !== undefined && isNotationOffset(abc, match.index)) {
      markers.push({ offset: match.index, voiceId: match[1] });
    }
  }
  return markers.sort((left, right) => left.offset - right.offset);
}

function resolveParsedVoiceId(voice, markers, fallback) {
  let firstSourceOffset;
  for (const element of voice) {
    if (typeof element.startChar === 'number') {
      firstSourceOffset = element.startChar;
      break;
    }
  }
  if (firstSourceOffset === undefined) return fallback;

  let low = 0;
  let high = markers.length - 1;
  let resolvedIndex = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (markers[middle].offset <= firstSourceOffset) {
      resolvedIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return resolvedIndex >= 0 ? markers[resolvedIndex].voiceId : fallback;
}

function prepareAbcForSemantics(abc) {
  if (!abc) return '';
  // Convert blank lines to comments so abcjs doesn't terminate prematurely
  return abc
    .replace(/^([ \t]*)$/gm, '%')
    .replace(/\[Q:[^\]]+\]|\[I:staff\s+[+-]?\d+\]/gi, (match) => ' '.repeat(match.length));
}

function isRepeatEndBar(barType) {
  if (!barType) return false;
  return (
    barType === 'bar_right_repeat' ||
    barType === 'bar_double_repeat' ||
    barType === 'bar_dbl_repeat' ||
    barType.includes('right_repeat') ||
    barType.includes('double_repeat') ||
    barType.includes(':|')
  );
}

export function computeScoreMeasureMapping(tune) {
  const lines = tune.lines || [];
  let barCount = 0;
  for (const line of lines) {
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        let count = 0;
        let hasEvents = false;
        for (const el of voice) {
          if (el.el_type === 'note') hasEvents = true;
          if (el.el_type === 'bar') {
            if (hasEvents) {
              count++;
              hasEvents = false;
            }
          }
        }
        if (hasEvents) count++;
        if (count > barCount) barCount = count;
      }
    }
  }

  if (barCount === 0) {
    return {
      isPickup: false,
      firstMeasureNumber: 1,
      totalMeasures: 1,
      barToMeasure: [1],
      splitMeasures: new Set(),
    };
  }

  let expectedMeter = createRational(4, 1);
  const m = tune.getMeterFraction ? tune.getMeterFraction() : null;
  if (m && m.den > 0) expectedMeter = createRational(m.num * 4, m.den);

  const barDurations = Array.from({ length: barCount }, () => createRational(0, 1));
  const barTypes = Array.from({ length: barCount }, () => '');

  for (const line of lines) {
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        let b = 0;
        let curDur = createRational(0, 1);
        let tupletMult = 1;
        let hasEvents = false;

        for (const el of voice) {
          if (el.el_type === 'bar') {
            if (hasEvents) {
              if (b < barCount) {
                if (compareRational(curDur, barDurations[b]) > 0) {
                  barDurations[b] = curDur;
                }
                barTypes[b] = el.type || 'bar_thin';
              }
              b++;
              curDur = createRational(0, 1);
              hasEvents = false;
            }
            continue;
          }
          if (el.el_type === 'note' && typeof el.duration === 'number') {
            if (el.startTriplet && el.tripletMultiplier) tupletMult = el.tripletMultiplier;
            const dur = createRational(Math.round(el.duration * 4 * tupletMult * 4096), 4096);
            curDur = addRational(curDur, dur);
            hasEvents = true;
            if (el.endTriplet) tupletMult = 1;
          }
        }
        if (hasEvents && b < barCount) {
          if (compareRational(curDur, barDurations[b]) > 0) {
            barDurations[b] = curDur;
          }
        }
      }
    }
  }

  let isPickup = false;
  if (barCount > 1) {
    const firstBar = barDurations[0];
    const secondBar = barDurations[1];
    if (compareRational(firstBar, expectedMeter) < 0 && compareRational(secondBar, expectedMeter) >= 0) {
      isPickup = true;
    }
  }

  const firstMeasureNumber = isPickup ? 0 : 1;
  const barToMeasure = [];
  const splitMeasures = new Set();
  let currentMeasure = firstMeasureNumber;
  let prevBarIncomplete = false;
  let prevBarRepeat = false;
  let prevBarDuration = createRational(0, 1);

  for (let b = 0; b < barCount; b++) {
    const barDur = barDurations[b];
    const barType = barTypes[b];

    if (b === 0 && isPickup) {
      barToMeasure[b] = 0;
      currentMeasure = 1;
      prevBarIncomplete = false;
      prevBarRepeat = false;
      prevBarDuration = createRational(0, 1);
    } else {
      const sumWithPrev = addRational(prevBarDuration, barDur);
      const isContinuation =
        prevBarIncomplete &&
        prevBarRepeat &&
        compareRational(barDur, expectedMeter) < 0 &&
        compareRational(sumWithPrev, expectedMeter) === 0;

      if (isContinuation) {
        const prevM = barToMeasure[b - 1];
        barToMeasure[b] = prevM;
        splitMeasures.add(prevM);
        prevBarIncomplete = false;
        prevBarRepeat = false;
        prevBarDuration = createRational(0, 1);
      } else {
        barToMeasure[b] = currentMeasure;
        currentMeasure += 1;

        const isShort = compareRational(barDur, expectedMeter) < 0;
        const isRepeat = isRepeatEndBar(barType);
        if (isShort && isRepeat) {
          prevBarIncomplete = true;
          prevBarRepeat = true;
          prevBarDuration = barDur;
        } else {
          prevBarIncomplete = false;
          prevBarRepeat = false;
          prevBarDuration = createRational(0, 1);
        }
      }
    }
  }

  return {
    isPickup,
    firstMeasureNumber,
    totalMeasures: currentMeasure - 1,
    barToMeasure,
    splitMeasures,
  };
}

export function extractHarmonicSlices(abcSource, startMeasure, endMeasure) {
  if (!abcSource || !abcSource.trim()) {
    throw new Error('abcSource must be a non-empty string');
  }

  const prepared = prepareAbcForSemantics(abcSource);
  const tunes = abcjs.parseOnly(prepared);
  const tune = tunes?.[0];
  if (!tune) {
    throw new Error('Unable to parse ABC score');
  }

  const mapping = computeScoreMeasureMapping(tune);

  // Extract global key signature from ABC header (before any body lines)
  const headerPart = abcSource.split(/(?:\r?\n)(?=[A-Za-z]:|\s*$)/)[0] || '';
  const globalKeyMatch = abcSource.match(/^K:\s*([^\r\n%]+)/m);
  const globalKeyStr = globalKeyMatch ? globalKeyMatch[1].trim() : 'C';
  const defaultTuneKey = parseKeySignature(globalKeyStr);

  const declaredVoiceIds = collectDeclaredVoiceIds(abcSource);
  const bodyVoiceMarkers = collectBodyVoiceMarkers(abcSource);

  // Voice state preserved across lines/staves
  const voiceStates = new Map();
  const voiceKeys = new Map();
  const voiceAccidentals = new Map();

  const scoreEvents = [];

  for (const line of tune.lines || []) {
    let voiceSlot = 0;
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        const fallbackId = declaredVoiceIds[voiceSlot] || `voice-${voiceSlot + 1}`;
        const voiceId = resolveParsedVoiceId(voice, bodyVoiceMarkers, fallbackId);
        voiceSlot++;

        let state = voiceStates.get(voiceId);
        if (!state) {
          state = {
            measureNum: mapping.barToMeasure[0] ?? mapping.firstMeasureNumber,
            barIdx: 0,
            measureOffset: createRational(0, 1),
            prevMeasureContinuationOffset: createRational(0, 1),
            tupletMult: 1,
          };
          voiceStates.set(voiceId, state);
        }

        let currentKey = voiceKeys.get(voiceId) || defaultTuneKey;
        let activeAccidentals = voiceAccidentals.get(voiceId);
        if (!activeAccidentals) {
          activeAccidentals = new Map();
          voiceAccidentals.set(voiceId, activeAccidentals);
        }

        for (const el of voice) {
          if (el.el_type === 'key') {
            const rawKey = el.root ? `${el.root}${el.acc || ''} ${el.mode || ''}` : null;
            if (rawKey) {
              currentKey = parseKeySignature(rawKey);
              voiceKeys.set(voiceId, currentKey);
            }
            continue;
          }

          if (el.el_type === 'bar') {
            activeAccidentals.clear();
            state.barIdx++;
            const nextMeasure = mapping.barToMeasure[state.barIdx] ?? (state.measureNum + 1);
            if (nextMeasure === state.measureNum) {
              state.prevMeasureContinuationOffset = state.measureOffset;
              state.measureOffset = createRational(0, 1);
            } else {
              state.measureNum = nextMeasure;
              state.measureOffset = createRational(0, 1);
              state.prevMeasureContinuationOffset = createRational(0, 1);
            }
            continue;
          }

          if (el.el_type === 'note' && typeof el.duration === 'number') {
            if (el.startTriplet && el.tripletMultiplier) state.tupletMult = el.tripletMultiplier;

            const durationQL = createRational(Math.round(el.duration * 4 * state.tupletMult * 4096), 4096);
            const isRest = Boolean(el.rest);
            const resolvedPitches = [];

            if (!isRest && Array.isArray(el.pitches)) {
              for (const p of el.pitches) {
                if (typeof p.pitch !== 'number') continue;
                const pNum = p.pitch;
                const step = PITCH_STEPS[((pNum % 7) + 7) % 7];
                const octave = 4 + Math.floor(pNum / 7);

                let accidental = '';
                if (p.accidental) {
                  if (p.accidental === 'sharp') accidental = '#';
                  else if (p.accidental === 'flat') accidental = 'b';
                  else if (p.accidental === 'dblsharp') accidental = '##';
                  else if (p.accidental === 'dblflat') accidental = 'bb';
                  else if (p.accidental === 'natural') accidental = '';
                  activeAccidentals.set(`${step}${octave}`, accidental);
                  activeAccidentals.set(step, accidental);
                } else if (activeAccidentals.has(`${step}${octave}`)) {
                  accidental = activeAccidentals.get(`${step}${octave}`);
                } else if (activeAccidentals.has(step)) {
                  accidental = activeAccidentals.get(step);
                } else {
                  if (currentKey.sharps.includes(step)) accidental = '#';
                  else if (currentKey.flats.includes(step)) accidental = 'b';
                }

                resolvedPitches.push(`${step}${accidental}${octave}`);
              }
            }

            resolvedPitches.sort((a, b) => pitchHeight(a) - pitchHeight(b));

            scoreEvents.push({
              voiceId,
              measure: state.measureNum,
              offset: addRational(state.prevMeasureContinuationOffset, state.measureOffset),
              duration: durationQL,
              soundingPitches: resolvedPitches,
              literalBass: resolvedPitches[0] || null,
              isRest,
              localKey: currentKey.name,
            });

            state.measureOffset = addRational(state.measureOffset, durationQL);
            if (el.endTriplet) state.tupletMult = 1;
          }
        }
      }
    }
  }

  // Determine effective start and end
  const effectiveStart = Math.max(startMeasure, mapping.firstMeasureNumber);
  const effectiveEnd = Math.max(endMeasure, effectiveStart);

  const slices = [];

  for (let m = effectiveStart; m <= effectiveEnd; m++) {
    const measureEvents = scoreEvents.filter((e) => e.measure === m);
    const priorSustained = scoreEvents.filter((e) => e.measure < m && !e.isRest);

    const onsetPoints = new Set();
    onsetPoints.add(0);

    for (const ev of measureEvents) {
      onsetPoints.add(ev.offset.num / ev.offset.den);
      const endQ = addRational(ev.offset, ev.duration);
      onsetPoints.add(endQ.num / endQ.den);
    }

    const sortedOnsets = Array.from(onsetPoints).sort((a, b) => a - b);

    for (let i = 0; i < sortedOnsets.length - 1; i++) {
      const tStartNum = sortedOnsets[i];
      const tEndNum = sortedOnsets[i + 1];
      const tStart = createRational(Math.round(tStartNum * 4096), 4096);
      const tEnd = createRational(Math.round(tEndNum * 4096), 4096);
      const sliceDur = subRational(tEnd, tStart);
      if (sliceDur.num <= 0) continue;

      const activePitches = new Set();
      let sliceLocalKey = defaultTuneKey.name;

      for (const ev of measureEvents) {
        if (ev.isRest) continue;
        const evStart = ev.offset;
        const evEnd = addRational(ev.offset, ev.duration);
        if (compareRational(evStart, tStart) <= 0 && compareRational(evEnd, tEnd) >= 0) {
          for (const p of ev.soundingPitches) activePitches.add(p);
          sliceLocalKey = ev.localKey;
        }
      }

      // Check sustained notes from earlier measures
      for (const ev of priorSustained) {
        const measuresDiff = m - ev.measure;
        const elapsedSinceStart = addRational(createRational(measuresDiff * 4, 1), tStart);
        if (compareRational(ev.duration, elapsedSinceStart) > 0) {
          for (const p of ev.soundingPitches) activePitches.add(p);
        }
      }

      if (activePitches.size > 0) {
        const sortedPitches = Array.from(activePitches).sort((a, b) => pitchHeight(a) - pitchHeight(b));
        slices.push({
          sliceId: `m${m}@${rationalToText(tStart)}`,
          position: {
            measure: m,
            offsetQuarterLength: rationalToText(tStart),
          },
          durationQuarterLength: rationalToText(sliceDur),
          soundingPitches: sortedPitches,
          literalBass: sortedPitches[0],
          localKey: sliceLocalKey,
        });
      }
    }
  }

  // Key detection: preserve explicit written key from tune header
  // If passage is in an excerpt that starts after an excerpt key change, use that key
  let passageKey = defaultTuneKey.name;
  if (slices.length > 0 && slices[0].localKey) {
    passageKey = slices[0].localKey;
  }

  return {
    passageKey,
    slices,
    measureCount: effectiveEnd - effectiveStart + 1,
  };
}
