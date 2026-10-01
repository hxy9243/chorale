/** Shared, layout-independent written timing. All public positions use quarter lengths. */
const gcd = (a, b) => {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right) [left, right] = [right, left % right];
  return left;
};

const fromBigInts = (num, den) => {
  if (den === 0n) throw new RangeError('Rational denominator must not be zero.');
  if (den < 0n) { num = -num; den = -den; }
  const divisor = gcd(num, den);
  const numerator = Number(num / divisor);
  const denominator = Number(den / divisor);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError('Rational exceeds the safe integer range.');
  }
  return Object.freeze({ num: numerator, den: denominator });
};

export const createRational = (num, den = 1) => {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) {
    throw new RangeError('Rational numerator and denominator must be safe integers.');
  }
  return fromBigInts(BigInt(num), BigInt(den));
};

const assertRational = (value) => {
  if (!value || !Number.isSafeInteger(value.num) || !Number.isSafeInteger(value.den)
    || value.den <= 0 || gcd(BigInt(value.num), BigInt(value.den)) !== 1n) {
    throw new RangeError('Expected a reduced rational with a positive denominator.');
  }
};

export const addRational = (left, right) => {
  assertRational(left); assertRational(right);
  return fromBigInts(BigInt(left.num) * BigInt(right.den) + BigInt(right.num) * BigInt(left.den),
    BigInt(left.den) * BigInt(right.den));
};
export const subRational = (left, right) => {
  assertRational(left); assertRational(right);
  return fromBigInts(BigInt(left.num) * BigInt(right.den) - BigInt(right.num) * BigInt(left.den),
    BigInt(left.den) * BigInt(right.den));
};
export const compareRational = (left, right) => {
  assertRational(left); assertRational(right);
  const difference = BigInt(left.num) * BigInt(right.den) - BigInt(right.num) * BigInt(left.den);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};
export const rationalToText = (value) => {
  assertRational(value);
  return value.den === 1 ? String(value.num) : `${value.num}/${value.den}`;
};
const multiply = (left, right) => {
  assertRational(left); assertRational(right);
  return fromBigInts(BigInt(left.num) * BigInt(right.num), BigInt(left.den) * BigInt(right.den));
};

/** Recover a simple rational represented by an abcjs number, never quantize a time grid. */
export const fromNumber = (value, maximumDenominator = 65_536) => {
  if (!Number.isFinite(value)) throw new RangeError('Rational value must be finite.');
  if (!Number.isSafeInteger(maximumDenominator) || maximumDenominator <= 0) {
    throw new RangeError('Maximum denominator must be a positive safe integer.');
  }
  if (Number.isSafeInteger(value)) return createRational(value);
  const sign = value < 0 ? -1 : 1;
  const target = Math.abs(value);
  let remainder = target;
  let previousNum = 0; let num = 1;
  let previousDen = 1; let den = 0;
  while (true) {
    const coefficient = Math.floor(remainder);
    const nextNum = coefficient * num + previousNum;
    const nextDen = coefficient * den + previousDen;
    if (!Number.isSafeInteger(nextNum) || !Number.isSafeInteger(nextDen)
      || nextDen > maximumDenominator) break;
    [previousNum, num] = [num, nextNum];
    [previousDen, den] = [den, nextDen];
    if (Math.abs(num / den - target) <= Number.EPSILON * 16) {
      return createRational(sign * num, den);
    }
    const fraction = remainder - coefficient;
    if (fraction <= Number.EPSILON) break;
    remainder = 1 / fraction;
  }
  if (den > 0 && Math.abs(num / den - target) <= 1e-12) return createRational(sign * num, den);
  throw new RangeError('Rational value cannot be represented within the denominator limit.');
};

const ZERO = createRational(0);
const ONE = createRational(1);
const FOUR = createRational(4);
// Keep the native mapper bounded too; analysis consumers cannot guard after expansion.
const MAX_WRITTEN_MEASURES = 16_384;
const MAX_TIMING_ENTRIES = 100_000;
const MAX_VOICES = 128;
const MAX_FRAGMENTS_PER_VOICE = MAX_WRITTEN_MEASURES * 2;
const DEFAULT_METER = Object.freeze({ type: 'specified', value: [{ num: '4', den: '4' }] });

export class UnsupportedScoreTimingError extends Error {
  constructor(message, code = 'UNSUPPORTED_SCORE_TIMING') {
    super(message);
    this.name = 'UnsupportedScoreTimingError';
    this.code = code;
  }
}

const tooComplex = (message) => {
  throw new UnsupportedScoreTimingError(message, 'SCORE_TOO_COMPLEX');
};

const meterDuration = (meter) => {
  if (!meter) return FOUR;
  if (meter.type === 'none') return null;
  if (meter.type === 'common_time' || meter.type === 'cut_time') return FOUR;
  // Some parsed-tune adapters expose the explicit fractions without abcjs's type tag.
  // Their meter is still unambiguous; unknown tagged meter kinds remain unsupported.
  if ((meter.type !== undefined && meter.type !== 'specified') || !meter.value?.length) {
    throw new UnsupportedScoreTimingError(`Unsupported meter: ${meter.type || 'unknown'}.`, 'UNSUPPORTED_METER');
  }
  let duration = ZERO;
  for (const part of meter.value) {
    const components = String(part.num).split('+');
    if (!components.every((component) => /^\d+$/.test(component)) || !/^\d+$/.test(String(part.den))) {
      throw new UnsupportedScoreTimingError('Unsupported meter fraction.', 'UNSUPPORTED_METER');
    }
    const numerator = components.reduce((sum, component) => sum + Number(component), 0);
    const fraction = createRational(numerator, Number(part.den));
    if (fraction.num <= 0) throw new UnsupportedScoreTimingError('Meter must be positive.', 'UNSUPPORTED_METER');
    duration = addRational(duration, multiply(fraction, FOUR));
  }
  return duration;
};
const equalMeter = (left, right) => left === null || right === null
  ? left === right : compareRational(left, right) === 0;
const repeatEnd = (type = '') => /right_repeat|double_repeat|dbl_repeat|:\|/.test(type);
const maxDuration = (left, right) => compareRational(left, right) >= 0 ? left : right;

function collectVoiceFragments(tune, voiceIdFor) {
  const voices = new Map();
  const initialMeter = tune.getMeter?.() || DEFAULT_METER;
  let segmentIndex = 0;
  let entryCount = 0;
  for (const line of tune.lines || []) {
    let slot = 0;
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        if (segmentIndex >= MAX_TIMING_ENTRIES) tooComplex('Score has too many layout segments.');
        const voiceId = voiceIdFor(voice, slot++);
        let state = voices.get(voiceId);
        if (!state) {
          if (voices.size >= MAX_VOICES) tooComplex('Score has too many voices.');
          state = { voiceId, fragments: [], activeMeter: initialMeter, tuplet: ONE, current: null };
          voices.set(voiceId, state);
        }
        const setMeter = (meter) => {
          if (!meter) return;
          const nextDuration = meterDuration(meter);
          if (state.current?.hasNotes && !equalMeter(state.current.meter, nextDuration)) {
            throw new UnsupportedScoreTimingError('A meter change inside a written bar is unsupported.', 'UNSUPPORTED_METER_CHANGE');
          }
          state.activeMeter = meter;
          if (state.current && !state.current.hasNotes) state.current.meter = nextDuration;
        };
        setMeter(staff.meter);
        const metadata = { segmentIndex: segmentIndex++, staffKey: staff.key, staffClef: staff.clef,
          staffMeter: staff.meter || state.activeMeter };
        const current = () => {
          if (!state.current) {
            if (state.fragments.length >= MAX_FRAGMENTS_PER_VOICE) tooComplex('Score has too many written bar fragments.');
            state.current = { entries: [], duration: ZERO,
              meter: meterDuration(state.activeMeter), hasNotes: false, barType: '', multiRestEnd: false };
          }
          return state.current;
        };
        const close = () => {
          if (state.current?.hasNotes) {
            state.fragments.push(state.current);
            state.current = null;
          }
        };
        const append = (element, duration = ZERO) => {
          if (entryCount >= MAX_TIMING_ENTRIES) tooComplex('Score has too many timing entries.');
          entryCount++;
          const fragment = current();
          fragment.entries.push({ element, ...metadata, offset: fragment.duration, duration });
          if (element.el_type === 'note' && element.rest?.type !== 'spacer') {
            fragment.hasNotes = true;
            fragment.duration = addRational(fragment.duration, duration);
          }
        };
        for (const element of voice) {
          // A multi-rest ends its final virtual measure even without a following printed bar.
          if (state.current?.multiRestEnd && element.el_type !== 'bar') close();
          if (element.el_type === 'meter') {
            setMeter(element);
            append(element);
          } else if (element.el_type === 'bar') {
            append(element);
            current().barType = element.type || '';
            close(); // An empty leading repeat stays at offset zero and does not advance.
          } else if (element.el_type === 'note' && element.rest?.type === 'spacer') {
            // abcjs represents y as a note, but it is only horizontal layout space.
            append(element);
          } else if (element.el_type === 'note') {
            if (typeof element.duration !== 'number' || element.duration < 0) {
              throw new UnsupportedScoreTimingError('A note has an invalid duration.');
            }
            if (element.startTriplet && element.tripletMultiplier !== undefined) {
              state.tuplet = fromNumber(element.tripletMultiplier);
              if (state.tuplet.num <= 0) throw new UnsupportedScoreTimingError('A tuplet multiplier must be positive.');
            }
            if (element.rest?.type === 'multimeasure' || element.rest?.type === 'invisible-multimeasure') {
              const count = Number(element.rest.text ?? 1);
              if (!Number.isSafeInteger(count) || count <= 0) {
                throw new UnsupportedScoreTimingError('A multi-measure rest must have a positive integer count.');
              }
              if (count > MAX_WRITTEN_MEASURES
                || count > MAX_TIMING_ENTRIES - entryCount
                || count > MAX_FRAGMENTS_PER_VOICE - state.fragments.length) {
                tooComplex('Multi-measure rest exceeds the score timing limits.');
              }
              if (current().hasNotes) throw new UnsupportedScoreTimingError('A multi-measure rest inside a partial bar is unsupported.');
              const duration = meterDuration(state.activeMeter);
              if (!duration) throw new UnsupportedScoreTimingError('A multi-measure rest requires a meter.');
              for (let index = 0; index < count; index++) {
                append(element, duration);
                current().multiRestEnd = true;
                if (index + 1 < count) close();
              }
            } else {
              append(element, multiply(multiply(fromNumber(element.duration), FOUR), state.tuplet));
            }
            if (element.endTriplet) state.tuplet = ONE;
          } else {
            append(element);
          }
        }
      }
    }
  }
  for (const state of voices.values()) {
    if (state.current?.hasNotes || !state.fragments.length) {
      if (state.current) state.fragments.push(state.current);
    } else if (state.current?.entries.length) {
      // Preserve trailing state/bar events without inventing an empty measure.
      const last = state.fragments.at(-1);
      last.entries.push(...state.current.entries.map((entry) => ({ ...entry, offset: last.duration })));
    }
  }
  return [...voices.values()];
}

function groupWrittenMeasures(fragments) {
  const groups = [];
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index];
    const next = fragments[index + 1];
    const split = next && fragment.meter && equalMeter(fragment.meter, next.meter)
      && repeatEnd(fragment.barType) && compareRational(fragment.duration, fragment.meter) < 0
      && compareRational(next.duration, fragment.meter) < 0
      && compareRational(addRational(fragment.duration, next.duration), fragment.meter) === 0;
    if (groups.length >= MAX_WRITTEN_MEASURES) tooComplex('Score has too many written measures.');
    groups.push({ fragments: split ? [fragment, next] : [fragment],
      meter: fragment.meter,
      duration: split ? addRational(fragment.duration, next.duration) : fragment.duration,
      firstBar: index });
    if (split) index++;
  }
  return groups;
}

export function buildScoreTiming(tune, { voiceIdFor = (_voice, slot) => `voice-${slot + 1}` } = {}) {
  const states = collectVoiceFragments(tune || {}, voiceIdFor);
  for (const state of states) state.groups = groupWrittenMeasures(state.fragments);
  const count = Math.max(1, ...states.map((state) => state.groups.length));
  const intervals = [];
  for (let index = 0; index < count; index++) {
    const groups = states.flatMap((state) => state.groups[index] ? [state.groups[index]] : []);
    const meter = groups.length ? groups[0].meter : meterDuration(tune?.getMeter?.() || DEFAULT_METER);
    if (groups.some((group) => !equalMeter(group.meter, meter))) {
      throw new UnsupportedScoreTimingError(`Incompatible voice meters at written bar ${index + 1}.`, 'UNSUPPORTED_POLYMETER');
    }
    const notated = groups.reduce((duration, group) => maxDuration(duration, group.duration), ZERO);
    // Durations spanning a barline belong to the originating note, not to the measure grid.
    const duration = notated.num === 0 ? (meter || ZERO)
      : meter && compareRational(notated, meter) > 0 ? meter : notated;
    intervals.push({ meter, notated, duration });
  }
  const isPickup = count > 1 && intervals[0].meter !== null && intervals[1].meter !== null
    && intervals[0].notated.num > 0
    && compareRational(intervals[0].notated, intervals[0].meter) < 0
    && compareRational(intervals[1].notated, intervals[1].meter) >= 0;
  const firstMeasureNumber = isPickup ? 0 : 1;
  let start = ZERO;
  const measures = intervals.map((interval, index) => {
    const result = { measure: firstMeasureNumber + index, start, duration: interval.duration };
    start = addRational(start, interval.duration);
    return result;
  });
  const splitMeasures = new Set();
  const voices = states.map((state) => {
    const entries = [];
    const barToMeasure = [];
    for (let index = 0; index < state.groups.length; index++) {
      const group = state.groups[index];
      const measure = measures[index];
      let fragmentOffset = ZERO;
      if (group.fragments.length > 1) splitMeasures.add(measure.measure);
      for (const fragment of group.fragments) {
        barToMeasure.push(measure.measure);
        for (const entry of fragment.entries) {
          const offset = addRational(fragmentOffset, entry.offset);
          entries.push({ ...entry, measure: measure.measure, offset,
            absoluteOffset: addRational(measure.start, offset) });
        }
        fragmentOffset = addRational(fragmentOffset, fragment.duration);
      }
    }
    return { voiceId: state.voiceId, entries, barToMeasure };
  });
  // Compatibility map follows the most complete voice; voices never consume one another's bar indices.
  const reference = voices.reduce((best, voice) => {
    const last = voice.barToMeasure.at(-1) ?? -1;
    const bestLast = best?.barToMeasure.at(-1) ?? -1;
    return last > bestLast || (last === bestLast && voice.barToMeasure.length > (best?.barToMeasure.length || 0))
      ? voice : best;
  }, null);
  const barToMeasure = reference?.barToMeasure.length ? [...reference.barToMeasure] : [firstMeasureNumber];
  const measureToBars = new Map();
  barToMeasure.forEach((measure, index) => {
    if (!measureToBars.has(measure)) measureToBars.set(measure, []);
    measureToBars.get(measure).push(index);
  });
  return { measures, voices, mapping: { isPickup, firstMeasureNumber,
    totalMeasures: measures.at(-1).measure, barToMeasure, measureToBars, splitMeasures } };
}

export const computeScoreMeasureMapping = (tune, options) => buildScoreTiming(tune, options).mapping;
