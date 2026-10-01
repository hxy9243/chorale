import abcjs from 'abcjs';
import {
  buildScoreTiming, computeScoreMeasureMapping, createRational,
  addRational, subRational, compareRational, rationalToText,
} from '../../shared/score-timing.mjs';
import { prepareAbcWithMap, createVoiceResolver, collectVoiceContextFields, isNotationOffset } from '../../shared/abc-source.mjs';

export { computeScoreMeasureMapping, createRational, addRational, subRational, compareRational, rationalToText };

export class ScoreSemanticsError extends Error {
  constructor(code, message) { super(message); this.name = 'ScoreSemanticsError'; this.code = code; }
}
const fail = (code, message) => { throw new ScoreSemanticsError(code, message); };
const unsupported = (message) => fail('ANALYSIS_UNSUPPORTED_NOTATION', message);
const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const ALTERATIONS = { natural: 0, sharp: 1, flat: -1, dblsharp: 2, dblflat: -2 };
const MODES = {
  '': 'major', maj: 'major', major: 'major', ion: 'ionian', ionian: 'ionian',
  m: 'minor', min: 'minor', minor: 'minor', aeo: 'aeolian', aeolian: 'aeolian',
  dor: 'dorian', dorian: 'dorian', phr: 'phrygian', phrygian: 'phrygian',
  lyd: 'lydian', lydian: 'lydian', mix: 'mixolydian', mixolydian: 'mixolydian',
  loc: 'locrian', locrian: 'locrian',
};
const ABC_MODES = { major: '', minor: 'm', ionian: 'ion', aeolian: 'aeo', dorian: 'dor', phrygian: 'phr', lydian: 'lyd', mixolydian: 'mix', locrian: 'loc' };
const conventionalKeys = new Map();
const keyFields = new Map();
const clefFields = new Map();
const ZERO = createRational(0);
const MAX_SOURCE_BYTES = 2_000_000;
const MAX_EVENTS = 50_000;
const MAX_SLICES = 8192;

function alteration(value) {
  if (!Object.hasOwn(ALTERATIONS, value)) unsupported(`Unsupported accidental: ${value}. Microtonal pitches are not approximated.`);
  return ALTERATIONS[value];
}
function accidentalTable(parsed) {
  const table = Object.fromEntries(STEPS.map((step) => [step, 0]));
  for (const item of parsed?.accidentals || []) {
    const step = item.note?.toUpperCase();
    if (!STEPS.includes(step)) unsupported('Unrecognized key-signature pitch.');
    table[step] = alteration(item.acc);
  }
  return table;
}
function conventionalTable(tonic, mode) {
  const id = `${tonic} ${mode}`;
  if (!conventionalKeys.has(id)) {
    const tune = abcjs.parseOnly(`X:1\nM:4/4\nL:1/4\nK:${tonic}${ABC_MODES[mode]}\nz4|`)[0];
    if (tune?.warnings?.length || !tune?.lines?.[0]?.staff?.[0]?.key) {
      conventionalKeys.set(id, null);
    } else conventionalKeys.set(id, accidentalTable(tune.lines[0].staff[0].key));
  }
  return conventionalKeys.get(id);
}
function keyContext(parsed) {
  const table = accidentalTable(parsed);
  const root = parsed?.root;
  const mode = MODES[String(parsed?.mode || '').toLowerCase()];
  const tonic = /^[A-G]$/.test(root || '') ? `${root}${parsed.acc || ''}` : null;
  const expected = tonic && mode ? conventionalTable(tonic, mode) : null;
  // Explicit/custom signature alterations are authoritative for pitches, but
  // don't imply a conventional functional key suitable for Roman numerals.
  const label = expected && STEPS.every((step) => expected[step] === table[step]) ? `${tonic} ${mode}` : null;
  return { table, tonic, mode, label };
}

function parseKeyField(value) {
  if (value.length > 4096) fail('ANALYSIS_TOO_COMPLEX', 'Key/clef field exceeds the analysis limit.');
  if (!keyFields.has(value)) {
    const tune = abcjs.parseOnly(`X:1\nM:4/4\nL:1/4\nK:${value}\nz4|`)[0];
    if (tune?.warnings?.length || !tune?.lines?.[0]?.staff?.[0]) unsupported('Unsupported key or clef field.');
    if (keyFields.size >= 256) keyFields.delete(keyFields.keys().next().value);
    keyFields.set(value, tune.lines[0].staff[0]);
  }
  return keyFields.get(value);
}
function applyClefField(current, text, type) {
  if (text.length > 4096) fail('ANALYSIS_TOO_COMPLEX', 'Voice field exceeds the analysis limit.');
  const cacheKey = JSON.stringify([current.octave, current.transpose, text, type]);
  if (clefFields.has(cacheKey)) return clefFields.get(cacheKey);
  const suffix = current.octave === 0 ? '' : `${current.octave < 0 ? '-' : '+'}${Math.abs(current.octave) === 2 ? '15' : '8'}`;
  const field = type === 'voice' ? `V:analysis ${text}` : `[K:${text}]`;
  const tune = abcjs.parseOnly(`X:1\nM:4/4\nL:1/4\nK:C clef=treble${suffix} transpose=${current.transpose}\n${field}\nC4|`)[0];
  if (tune?.warnings?.length || !tune?.lines?.[0]?.staff?.[0]) unsupported('Unsupported voice or clef field.');
  const staff = tune.lines[0].staff[0];
  let selected = staff.clef;
  for (const voice of staff.voices || []) for (const element of voice) {
    if (element.el_type === 'clef') selected = element;
  }
  const result = clefContext(selected);
  if (clefFields.size >= 256) clefFields.delete(clefFields.keys().next().value);
  clefFields.set(cacheKey, result);
  return result;
}

function clefContext(parsed = {}) {
  const type = parsed.type || 'treble';
  if (/perc/i.test(type)) unsupported('Percussion staves do not have conventional pitched harmony.');
  const shift = /([+-])(8|15)$/.exec(type);
  const octave = shift ? (shift[1] === '-' ? -1 : 1) * (shift[2] === '15' ? 2 : 1) : 0;
  const transpose = parsed.transpose ?? 0;
  if (!Number.isSafeInteger(transpose) || Math.abs(transpose) > 96) unsupported('Unsupported chromatic voice transposition.');
  return { octave, transpose };
}
function spellPitch(stepIndex, octave, alter) {
  const step = STEPS[((stepIndex % 7) + 7) % 7];
  const name = `${step}${alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)}${octave}`;
  return { step, octave, alter, name, height: 12 * (octave + 1) + SEMITONES[((stepIndex % 7) + 7) % 7] + alter };
}
function transposePitch(pitch, semitones) {
  if (!semitones) return pitch;
  const sign = Math.sign(semitones);
  const magnitude = Math.abs(semitones);
  const intervalSteps = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][magnitude % 12] + 7 * Math.floor(magnitude / 12);
  const diatonic = pitch.octave * 7 + STEPS.indexOf(pitch.step) + sign * intervalSteps;
  const stepIndex = ((diatonic % 7) + 7) % 7;
  const octave = Math.floor(diatonic / 7);
  const naturalHeight = 12 * (octave + 1) + SEMITONES[stepIndex];
  return spellPitch(stepIndex, octave, pitch.height + semitones - naturalHeight);
}
function soundingKey(context, clef) {
  if (!context.label) return null;
  if (!clef.transpose) return context.label;
  const match = /^([A-G])([#b]*)$/.exec(context.tonic);
  if (!match) return null;
  const alter = [...match[2]].reduce((sum, acc) => sum + (acc === '#' ? 1 : -1), 0);
  const shifted = transposePitch(spellPitch(STEPS.indexOf(match[1]), 4, alter), clef.transpose);
  return `${shifted.step}${shifted.alter > 0 ? '#'.repeat(shifted.alter) : 'b'.repeat(-shifted.alter)} ${context.mode}`;
}
export function pitchHeight(name) {
  const match = /^([A-G])([#b]*)(-?\d+)$/.exec(name);
  if (!match) fail('ANALYSIS_INVALID_PITCH', `Invalid sounding pitch: ${name}`);
  const alter = [...match[2]].reduce((sum, acc) => sum + (acc === '#' ? 1 : -1), 0);
  return spellPitch(STEPS.indexOf(match[1]), Number(match[3]), alter).height;
}

/** Compatibility helper; use parsed key accidental tables for score traversal. */
export function parseKeySignature(value) {
  const tune = abcjs.parseOnly(`X:1\nM:4/4\nL:1/4\nK:${value || 'C'}\nz4|`)[0];
  if (tune?.warnings?.length) unsupported('Invalid key signature.');
  const parsed = keyContext(tune?.lines?.[0]?.staff?.[0]?.key);
  return { ...parsed, name: parsed.label, sharps: STEPS.filter((s) => parsed.table[s] > 0), flats: STEPS.filter((s) => parsed.table[s] < 0) };
}

/** Parse once, preserve original source provenance, and normalize per-pitch releases. */
export function extractScoreEvents(abcSource) {
  if (typeof abcSource !== 'string' || !abcSource.trim()) fail('ANALYSIS_INVALID_SCORE', 'ABC source must be non-empty.');
  if (Buffer.byteLength(abcSource, 'utf8') > MAX_SOURCE_BYTES) fail('ANALYSIS_TOO_COMPLEX', 'ABC exceeds the analysis source limit.');
  for (const match of abcSource.matchAll(/&/g)) {
    const lineStart = abcSource.lastIndexOf('\n', match.index) + 1;
    const metadata = /^[ \t]*[A-UW-Z]:/.test(abcSource.slice(lineStart));
    if (!metadata && isNotationOffset(abcSource, match.index)) unsupported('Voice overlays (&) are not yet supported by harmony analysis.');
  }
  const fields = collectVoiceContextFields(abcSource);
  const initialStaff = parseKeyField(fields.headerKey);
  const { prepared, toOriginalOffset } = prepareAbcWithMap(abcSource);
  const tunes = abcjs.parseOnly(prepared);
  if (tunes.length !== 1 || !tunes[0]) unsupported('Analysis requires exactly one ABC tune.');
  const tune = tunes[0];
  if (tune.formatting?.midi?.transpose?.some((value) => Number(value) !== 0)
    || tune.formatting?.midi?.channel?.some((value) => Number(value) === 10)) {
    unsupported('MIDI transposition/percussion directives are not supported; use a pitched voice transpose field.');
  }
  if (tune.warnings?.length) unsupported(`ABC parser diagnostics: ${tune.warnings.map((w) => String(w).replace(/<[^>]*>/g, '')).join('; ')}`);
  const timing = buildScoreTiming(tune, { voiceIdFor: createVoiceResolver(abcSource, toOriginalOffset) });
  if (timing.voices.length > 128) fail('ANALYSIS_TOO_COMPLEX', 'Analysis supports at most 128 voices.');
  const events = [];
  const contexts = new Map();
  let entryCount = 0;
  let pitchCount = 0;

  for (const voice of timing.voices) {
    let context = keyContext(initialStaff.key);
    let clef = clefContext(initialStaff.clef);
    const voiceFields = fields.fields.filter((field) => field.voiceId === voice.voiceId);
    let fieldIndex = 0;
    const barAccidentals = new Map();
    const ties = new Map();
    const changes = [];
    contexts.set(voice.voiceId, changes);
    const recordContext = (at) => {
      const label = soundingKey(context, clef);
      const last = changes.at(-1);
      if (last && compareRational(last.at, at) === 0) last.label = label;
      else if (!last || last.label !== label) changes.push({ at, label });
    };

    for (const entry of voice.entries) {
      if (++entryCount > MAX_EVENTS) fail('ANALYSIS_TOO_COMPLEX', 'Score has too many analysis events.');
      const el = entry.element;
      if (el.el_type === 'midi' && (el.cmd === 'transpose' || (el.cmd === 'channel' && el.params?.includes(10)))) {
        unsupported('Inline MIDI transposition/percussion directives are not supported.');
      }
      const sourceOffset = Number.isInteger(el.startChar) ? toOriginalOffset(el.startChar) : -1;
      while (fieldIndex < voiceFields.length && voiceFields[fieldIndex].offset <= sourceOffset) {
        const field = voiceFields[fieldIndex++];
        if (field.type === 'key' && /^(?:[A-G]|none|HP|Hp|exp\b|[_^=])/.test(field.value)) {
          context = keyContext(parseKeyField(field.value).key);
          barAccidentals.clear();
        }
        clef = applyClefField(clef, field.value, field.type);
      }
      recordContext(entry.absoluteOffset);
      // Source-scoped fields above survive staff compaction/shared-staff layouts;
      // reapplying staff.key here would leak another voice's signature.
      if (el.el_type === 'key' || el.el_type === 'clef') continue;
      if (el.el_type === 'bar') { barAccidentals.clear(); continue; }
      if (el.el_type !== 'note') continue;
      if (el.gracenotes?.length) unsupported('Grace-note timing is not yet supported by harmony analysis.');
      if (el.rest) continue;
      if (!el.pitches?.length) unsupported('A sounding note has no supported parsed pitch.');
      pitchCount += el.pitches.length;
      if (pitchCount > MAX_EVENTS) fail('ANALYSIS_TOO_COMPLEX', 'Score has too many analysis pitches.');
      if (compareRational(entry.duration, ZERO) <= 0) unsupported('Zero-duration sounding notes are not supported.');
      const end = addRational(entry.absoluteOffset, entry.duration);
      for (let index = 0; index < el.pitches.length; index++) {
        const p = el.pitches[index];
        if (!Number.isInteger(p.pitch)) unsupported('Unrecognized parsed pitch.');
        const stepIndex = ((p.pitch % 7) + 7) % 7;
        const step = STEPS[stepIndex];
        const writtenOctave = 4 + Math.floor(p.pitch / 7);
        const writtenId = `${step}${writtenOctave}`;
        let alter;
        if (p.accidental) {
          alter = alteration(p.accidental);
          barAccidentals.set(writtenId, alter);
        } else alter = barAccidentals.has(writtenId) ? barAccidentals.get(writtenId) : context.table[step];
        const pitch = transposePitch(spellPitch(stepIndex, writtenOctave + clef.octave, alter), clef.transpose);
        const sourceRange = Number.isInteger(el.startChar) && Number.isInteger(el.endChar)
          ? { start: toOriginalOffset(el.startChar), end: toOriginalOffset(el.endChar) } : null;
        const sourceId = `${voice.voiceId}@${sourceRange?.start ?? entryCount}:${sourceRange?.end ?? entryCount}#${index}`;
        if (p.endTie) {
          const active = ties.get(writtenId);
          if (!active || compareRational(active.end, entry.absoluteOffset) !== 0) {
            fail('ANALYSIS_INVALID_TIE', `Unresolved tied continuation in voice ${voice.voiceId}, measure ${entry.measure}.`);
          }
          active.end = end;
          active.sourceEventIds.push(sourceId);
          if (sourceRange) active.sourceRanges.push(sourceRange);
          if (!p.startTie) ties.delete(writtenId);
        } else {
          if (ties.has(writtenId)) fail('ANALYSIS_INVALID_TIE', `A tied pitch in voice ${voice.voiceId} has no contiguous continuation.`);
          const event = { id: sourceId, voiceId: voice.voiceId, start: entry.absoluteOffset, end, pitch: pitch.name,
            sourceEventIds: [sourceId], sourceRanges: sourceRange ? [sourceRange] : [], measure: entry.measure, offset: entry.offset };
          events.push(event);
          if (p.startTie) ties.set(writtenId, event);
        }
      }
    }
    if (ties.size) fail('ANALYSIS_INVALID_TIE', `Unfinished tie in voice ${voice.voiceId}.`);
  }
  return { ...timing, events, contexts };
}

function contextAt(changes, point) {
  let low = 0; let high = changes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareRational(changes[middle].at, point) <= 0) low = middle + 1; else high = middle;
  }
  return low ? changes[low - 1].label : null;
}

/** Exact onset/release sweep clipped to authoritative written measure intervals. */
export function extractHarmonicSlices(abcSource, startMeasure = 1, endMeasure = startMeasure) {
  if (!Number.isInteger(startMeasure) || !Number.isInteger(endMeasure) || startMeasure < 0 || endMeasure < startMeasure) {
    fail('INVALID_RANGE', 'Analysis requires a non-negative, ordered written-measure range.');
  }
  if (endMeasure - startMeasure + 1 > 16) fail('ANALYSIS_RANGE_TOO_LARGE', 'Analysis accepts at most 16 written measures.');
  const score = extractScoreEvents(abcSource);
  const selected = score.measures.filter((m) => m.measure >= startMeasure && m.measure <= endMeasure);
  if (selected.length !== endMeasure - startMeasure + 1) fail('INVALID_RANGE', 'The requested written-measure range is not present in this score.');
  const slices = [];
  let evidencePitchCount = 0;
  for (const measure of selected) {
    const finish = addRational(measure.start, measure.duration);
    const relevant = score.events.filter((event) => compareRational(event.start, finish) < 0 && compareRational(event.end, measure.start) > 0);
    const boundaries = new Map([[rationalToText(measure.start), measure.start], [rationalToText(finish), finish]]);
    const changes = new Map();
    const active = new Map();
    const addChange = (at, type, event) => {
      const id = rationalToText(at);
      boundaries.set(id, at);
      if (!changes.has(id)) changes.set(id, { starts: [], ends: [] });
      changes.get(id)[type].push(event);
    };
    for (const event of relevant) {
      if (compareRational(event.start, measure.start) < 0) active.set(event.id, event);
      else addChange(event.start, 'starts', event);
      if (compareRational(event.end, finish) < 0) addChange(event.end, 'ends', event);
    }
    for (const voiceId of new Set(relevant.map((event) => event.voiceId))) {
      for (const change of score.contexts.get(voiceId) || []) {
        if (compareRational(change.at, measure.start) > 0 && compareRational(change.at, finish) < 0) boundaries.set(rationalToText(change.at), change.at);
      }
    }
    const points = [...boundaries.values()].sort(compareRational);
    if (slices.length + points.length > MAX_SLICES + 1) fail('ANALYSIS_TOO_COMPLEX', 'Analysis exceeds the slice-count limit.');
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i]; const end = points[i + 1];
      const delta = changes.get(rationalToText(start));
      for (const event of delta?.ends || []) active.delete(event.id);
      for (const event of delta?.starts || []) active.set(event.id, event);
      if (!active.size) continue;
      evidencePitchCount += [...active.values()].reduce((sum, event) => sum + 1 + event.sourceEventIds.length, 0);
      if (evidencePitchCount > MAX_EVENTS * 4) fail('ANALYSIS_TOO_COMPLEX', 'Analysis evidence exceeds the pitch-reference limit.');
      const soundingPitches = [...new Set([...active.values()].map((event) => event.pitch))].sort((a, b) => pitchHeight(a) - pitchHeight(b) || a.localeCompare(b));
      const labels = new Set([...new Set([...active.values()].map((event) => event.voiceId))]
        .map((id) => contextAt(score.contexts.get(id) || [], start)));
      const localKey = labels.size === 1 && !labels.has(null) ? [...labels][0] : null;
      const offset = subRational(start, measure.start);
      slices.push({ sliceId: `m${measure.measure}@${rationalToText(offset)}`, position: { measure: measure.measure, offsetQuarterLength: rationalToText(offset) },
        durationQuarterLength: rationalToText(subRational(end, start)), soundingPitches, literalBass: soundingPitches[0], localKey,
        sourceEventIds: [...new Set([...active.values()].flatMap((event) => event.sourceEventIds))] });
    }
  }
  const keys = new Set(slices.map((slice) => slice.localKey));
  if (!slices.length && selected.length) {
    const start = selected[0].start;
    const end = addRational(selected.at(-1).start, selected.at(-1).duration);
    for (const changes of score.contexts.values()) {
      keys.add(contextAt(changes, start));
      for (const change of changes) {
        if (compareRational(change.at, start) > 0 && compareRational(change.at, end) < 0) keys.add(change.label);
      }
    }
  }
  const passageKey = keys.size === 1 && !keys.has(null) ? [...keys][0] : null;
  return { passageKey, slices, measureCount: selected.length };
}
