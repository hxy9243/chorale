import abcjs from 'abcjs';
import { parseKeySignature } from 'abc-utils';

import { prepareAbcForPlayback } from '../utils/abcAudio';
import { extractScore } from './scoreSnapshot';
import {
  addRationalDurations,
  compareRationalDurations,
  createRationalDuration,
  type RationalDuration,
} from './rational';

export type AbcTextRange = Readonly<{ start: number; end: number }>;

export type AbcHeaderLine = Readonly<{
  range: AbcTextRange;
  tag: string;
  text: string;
  value: string;
  label?: string;
}>;

export type AbcMeasureEvent = Readonly<{
  range: AbcTextRange;
  text: string;
  start: number;
  duration: number;
}>;

export type AbcMeasureCell = Readonly<{
  id: string;
  voiceId: string;
  measureNumber: number;
  range: AbcTextRange;
  text: string;
  duration: number;
  events: readonly AbcMeasureEvent[];
  editable: boolean;
}>;

export type AbcVoicePresentation = Readonly<{
  id: string;
  label: string;
  colorIndex: number;
  cells: readonly AbcMeasureCell[];
}>;

export type AbcPresentation = Readonly<{
  abc: string;
  headers: readonly AbcHeaderLine[];
  voices: readonly AbcVoicePresentation[];
  measureCount: number;
  boundaryRanges: readonly AbcTextRange[];
  rawOnlyRanges: readonly AbcTextRange[];
  warnings: readonly string[];
}>;

export type MeasureSystemsSnapshot = Readonly<{
  documentId: string;
  revision: number;
  measureCount: number;
  systems: readonly (readonly number[])[];
}>;

export type PlaybackSourceRanges = Readonly<{
  starts: readonly number[];
  ends: readonly number[];
}>;

type ParsedElement = {
  el_type?: string;
  startChar?: number;
  endChar?: number;
  duration?: number;
};

type ParsedTune = {
  lines?: Array<{ staff?: Array<{ voices?: ParsedElement[][] }> }>;
  warnings?: string[];
};

type MutableCell = {
  voiceId: string;
  measureNumber: number;
  minStart: number;
  maxEnd: number;
  ranges: AbcTextRange[];
  events: Array<{ range: AbcTextRange; start: number; duration: number }>;
};

type VoiceState = { measureNumber: number; hasEvents: boolean; elapsed: number };

const FATAL_WARNING = /meter|chord|key|parse|unclosed|cannot|invalid|bad|error|illegal/i;

const HEADER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  X: 'Reference',
  T: 'Title',
  C: 'Composer',
  A: 'Author / lyricist',
  M: 'Meter',
  L: 'Default note length',
  Q: 'Tempo',
  O: 'Origin',
  R: 'Rhythm',
  K: 'Key',
});

const sourceRange = (element: ParsedElement): AbcTextRange | null => (
  Number.isInteger(element.startChar)
  && Number.isInteger(element.endChar)
  && element.startChar! >= 0
  && element.endChar! > element.startChar!
    ? { start: element.startChar!, end: element.endChar! }
    : null
);

const collectDeclaredVoiceIds = (abc: string): string[] => {
  const ids: string[] = [];
  const add = (id: string) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const match of abc.matchAll(/^V:\s*([^\s]+)/gm)) add(match[1]);
  for (const match of abc.matchAll(/\[V:\s*([^\]\s]+)/g)) add(match[1]);
  return ids;
};

const collectHeaders = (abc: string): AbcHeaderLine[] => {
  const headers: AbcHeaderLine[] = [];
  let offset = 0;
  let titleCount = 0;
  for (const line of abc.split('\n')) {
    const match = line.match(/^([A-Za-z]):\s*(.*)$/);
    if (match) {
      const tag = match[1];
      const label = tag === 'T' && titleCount++ === 1 ? 'Subtitle' : HEADER_LABELS[tag];
      headers.push(Object.freeze({
        range: Object.freeze({ start: offset, end: offset + line.length }),
        tag,
        text: line,
        value: match[2].trim(),
        ...(label ? { label } : {}),
      }));
    }
    offset += line.length + 1;
    if (match?.[1] === 'K') break;
  }
  return headers;
};

const mergeRanges = (ranges: readonly AbcTextRange[]): AbcTextRange[] => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
};

const meaningfulRawRanges = (
  abc: string,
  represented: readonly AbcTextRange[],
): AbcTextRange[] => {
  const merged = mergeRanges(represented);
  const gaps: AbcTextRange[] = [];
  let cursor = 0;
  for (let i = 0; i < merged.length; i += 1) {
    const range = merged[i];
    if (range.start > cursor) {
      let isAllWhitespace = true;
      for (let j = cursor; j < range.start; j += 1) {
        const code = abc.charCodeAt(j);
        if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
          isAllWhitespace = false;
          break;
        }
      }
      if (!isAllWhitespace) {
        const text = abc.slice(cursor, range.start);
        const ignored = text
          .replace(/^V:\s*[^\s]+.*$/gm, '')
          .replace(/\[V:\s*[^\]\s]+\]/g, '')
          .trim();
        if (ignored) gaps.push({ start: cursor, end: range.start });
      }
    }
    cursor = Math.max(cursor, range.end);
  }
  if (abc.length > cursor) {
    let isAllWhitespace = true;
    for (let j = cursor; j < abc.length; j += 1) {
      const code = abc.charCodeAt(j);
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
        isAllWhitespace = false;
        break;
      }
    }
    if (!isAllWhitespace) {
      const text = abc.slice(cursor);
      const ignored = text
        .replace(/^V:\s*[^\s]+.*$/gm, '')
        .replace(/\[V:\s*[^\]\s]+\]/g, '')
        .trim();
      if (ignored) gaps.push({ start: cursor, end: abc.length });
    }
  }
  return gaps;
};

const sameLine = (abc: string, range: AbcTextRange) => (
  !abc.slice(range.start, range.end).includes('\n')
);

export const buildAbcPresentation = (abc: string): AbcPresentation => {
  if (!abc.trim()) throw new Error('ABC source is empty.');
  const tunes = abcjs.parseOnly(prepareAbcForPlayback(abc)) as unknown as ParsedTune[];
  if (tunes.length !== 1 || !tunes[0]) {
    throw new Error('Formatted ABC supports exactly one tune.');
  }
  const tune = tunes[0];
  const fatalWarnings = tune.warnings?.filter((warning) => FATAL_WARNING.test(warning)) || [];
  if (fatalWarnings.length) throw new Error(fatalWarnings.join('; '));

  const declaredVoiceIds = collectDeclaredVoiceIds(abc);
  const encounteredVoiceIds: string[] = [];
  const states = new Map<string, VoiceState>();
  const cells = new Map<string, MutableCell>();
  const voiceCellsMap = new Map<string, MutableCell[]>();
  const boundaryRanges: AbcTextRange[] = [];
  let voiceSlot = 0;

  for (const line of tune.lines || []) {
    voiceSlot = 0;
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        const voiceId = declaredVoiceIds[voiceSlot] || `voice-${voiceSlot + 1}`;
        if (!encounteredVoiceIds.includes(voiceId)) {
          encounteredVoiceIds.push(voiceId);
          voiceCellsMap.set(voiceId, []);
        }
        const state = states.get(voiceId) || { measureNumber: 1, hasEvents: false, elapsed: 0 };
        for (const element of voice) {
          const range = sourceRange(element);
          if (element.el_type === 'bar') {
            if (range) {
              boundaryRanges.push(range);
              const key = `${voiceId}:${state.measureNumber}`;
              let cell = cells.get(key);
              if (!cell) {
                cell = {
                  voiceId,
                  measureNumber: state.measureNumber,
                  minStart: range.start,
                  maxEnd: range.end,
                  ranges: [range],
                  events: [],
                };
                cells.set(key, cell);
                voiceCellsMap.get(voiceId)?.push(cell);
              } else {
                cell.ranges.push(range);
                cell.minStart = Math.min(cell.minStart, range.start);
                cell.maxEnd = Math.max(cell.maxEnd, range.end);
              }
            }
            if (state.hasEvents) {
              state.measureNumber += 1;
              state.hasEvents = false;
              state.elapsed = 0;
            }
            continue;
          }
          if (!range) continue;
          const key = `${voiceId}:${state.measureNumber}`;
          let cell = cells.get(key);
          if (!cell) {
            cell = {
              voiceId,
              measureNumber: state.measureNumber,
              minStart: range.start,
              maxEnd: range.end,
              ranges: [range],
              events: [],
            };
            cells.set(key, cell);
            voiceCellsMap.get(voiceId)?.push(cell);
          } else {
            cell.ranges.push(range);
            cell.minStart = Math.min(cell.minStart, range.start);
            cell.maxEnd = Math.max(cell.maxEnd, range.end);
          }
          if (element.el_type === 'note' && typeof element.duration === 'number') {
            const duration = Math.max(0, element.duration);
            cell.events.push({ range, start: state.elapsed, duration });
            state.elapsed += duration;
            state.hasEvents = true;
          }
        }
        states.set(voiceId, state);
        voiceSlot += 1;
      }
    }
  }

  const voices = encounteredVoiceIds.map((voiceId, colorIndex) => {
    const rawVoiceCells = (voiceCellsMap.get(voiceId) || [])
      .filter((cell) => cell.ranges.length > 0)
      .sort((a, b) => a.measureNumber - b.measureNumber);
    const voiceCells = rawVoiceCells.map<AbcMeasureCell>((cell) => {
      const range = {
        start: cell.minStart,
        end: cell.maxEnd,
      };
      const text = abc.slice(range.start, range.end);
      const events = cell.events.map((event) => ({
        ...event,
        text: abc.slice(event.range.start, event.range.end).trim(),
      }));
      return {
        id: `${voiceId}:${cell.measureNumber}`,
        voiceId,
        measureNumber: cell.measureNumber,
        range,
        text,
        duration: Math.max(0, ...events.map((event) => event.start + event.duration)),
        events,
        editable: Boolean(text.trim()) && sameLine(abc, range) && !text.includes('%'),
      };
    });
    return {
      id: voiceId,
      label: voiceId.startsWith('voice-') ? `Voice ${colorIndex + 1}` : voiceId,
      colorIndex,
      cells: voiceCells,
    };
  });

  if (!voices.length || !voices.some(({ cells: voiceCells }) => voiceCells.length)) {
    throw new Error('Formatted ABC could not identify any measures.');
  }

  const headers = collectHeaders(abc);
  const cellRanges = voices.flatMap(({ cells: voiceCells }) => voiceCells.map(({ range }) => range));
  const rawOnlyRanges = meaningfulRawRanges(abc, [
    ...headers.map(({ range }) => range),
    ...cellRanges,
    ...boundaryRanges,
  ]);
  const measureCount = Math.max(0, ...voices.map(({ cells: voiceCells }) => voiceCells.at(-1)?.measureNumber || 0));

  return Object.freeze({
    abc,
    headers: Object.freeze(headers),
    voices: Object.freeze(voices),
    measureCount,
    boundaryRanges: Object.freeze(mergeRanges(boundaryRanges)),
    rawOnlyRanges: Object.freeze(rawOnlyRanges),
    warnings: Object.freeze(rawOnlyRanges.length ? ['Additional source is available in Raw Source.'] : []),
  });
};

export type AbcCellEditResult =
  | Readonly<{ ok: true; abc: string; presentation: AbcPresentation }>
  | Readonly<{ ok: false; error: string }>;

export type AbcMeasureEdit = Readonly<{
  cellId: string;
  replacement: string;
}>;

const literalRanges = (abc: string, ranges: readonly AbcTextRange[]) => (
  ranges.map((range) => abc.slice(range.start, range.end))
);

const allCells = (presentation: AbcPresentation) => presentation.voices.flatMap(({ cells }) => cells);

const cleanedReplacement = (target: AbcMeasureCell, replacement: string) => {
  const leadingWhitespace = target.text.match(/^\s*/)?.[0] || '';
  const trailingWhitespace = target.text.match(/\s*$/)?.[0] || '';
  return `${leadingWhitespace}${replacement.trim()}${trailingWhitespace}`;
};

const validatePreservedPresentation = (
  presentation: AbcPresentation,
  candidate: string,
  targetIds: ReadonlySet<string>,
): AbcPresentation => {
  const next = buildAbcPresentation(candidate);
  if (literalRanges(next.abc, next.boundaryRanges).join('\0') !== literalRanges(presentation.abc, presentation.boundaryRanges).join('\0')) {
    throw new Error('Measure or repeat boundaries must be edited in Raw Source.');
  }
  if (next.measureCount !== presentation.measureCount) throw new Error('Measure structure changed. Use Raw Source.');
  if (next.voices.map(({ id }) => id).join('\0') !== presentation.voices.map(({ id }) => id).join('\0')) {
    throw new Error('Voice order changed.');
  }
  if (next.headers.map(({ text }) => text).join('\0') !== presentation.headers.map(({ text }) => text).join('\0')) {
    throw new Error('Header fields changed.');
  }
  const nextById = new Map(allCells(next).map((cell) => [cell.id, cell]));
  for (const cell of allCells(presentation)) {
    const replacement = nextById.get(cell.id);
    if (!replacement || (!targetIds.has(cell.id) && replacement.text !== cell.text)) {
      throw new Error('Measure structure changed. Use Raw Source.');
    }
  }
  for (const id of targetIds) {
    if (!nextById.get(id)?.editable) throw new Error('The edited measure no longer has safe source ownership.');
  }
  return next;
};

const parseMeterDuration = (meter: string): RationalDuration | null => {
  if (meter === 'C' || meter === 'C|') return createRationalDuration(1, 1);
  const match = meter.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return null;
  return createRationalDuration(Number(match[1]), Number(match[2]));
};

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};

const defaultLength = (abc: string, meter: string): RationalDuration => {
  const declared = abc.match(/^L:\s*(\d+)\s*\/\s*(\d+)\s*$/m);
  if (declared) return createRationalDuration(Number(declared[1]), Number(declared[2]));
  const duration = parseMeterDuration(meter);
  if (!duration) throw new Error('Measure completion requires a numeric meter. Use Raw Source.');
  return compareRationalDurations(duration, createRationalDuration(3, 4)) < 0
    ? createRationalDuration(1, 16)
    : createRationalDuration(1, 8);
};

const restLengthSuffix = (remaining: RationalDuration, unit: RationalDuration) => {
  let numerator = BigInt(remaining.numerator) * BigInt(unit.denominator);
  let denominator = BigInt(remaining.denominator) * BigInt(unit.numerator);
  const divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  if (numerator === 1n && denominator === 1n) return '';
  if (denominator === 1n) return numerator.toString();
  if (numerator === 1n) return `/${denominator}`;
  return `${numerator}/${denominator}`;
};

const normalizeCellDuration = (
  candidate: string,
  cellId: string,
): string => {
  const next = buildAbcPresentation(candidate);
  const target = allCells(next).find(({ id }) => id === cellId);
  if (!target) throw new Error('The edited measure is no longer available.');
  const score = extractScore(candidate);
  const measure = score.measures.find(({ measureNumber }) => measureNumber === target.measureNumber);
  if (!measure || measure.activeMeter === 'none') {
    throw new Error('Measure completion requires a numeric meter. Use Raw Source.');
  }
  const expected = parseMeterDuration(measure.activeMeter);
  if (!expected) throw new Error('Measure completion requires a numeric meter. Use Raw Source.');
  const used = measure.events
    .filter((event) => event.voiceId === target.voiceId)
    .reduce<RationalDuration>((maximum, event) => {
      const end = addRationalDurations(event.position.offset, event.duration);
      return compareRationalDurations(end, maximum) > 0 ? end : maximum;
    }, createRationalDuration(0, 1));
  const comparison = compareRationalDurations(used, expected);
  if (comparison > 0) {
    throw new Error(`Measure ${target.measureNumber}, voice ${target.voiceId} exceeds ${measure.activeMeter}.`);
  }
  if (comparison === 0) return candidate;
  const boundary = next.boundaryRanges
    .filter((range) => range.start >= target.range.start && range.end <= target.range.end)
    .at(-1);
  if (!boundary) throw new Error('This measure must be edited in Raw Source.');
  const remaining = createRationalDuration(
    expected.numerator * used.denominator - used.numerator * expected.denominator,
    expected.denominator * used.denominator,
  );
  const rest = `z${restLengthSuffix(remaining, defaultLength(candidate, measure.activeMeter))}`;
  const before = candidate.slice(0, boundary.start);
  const after = candidate.slice(boundary.start);
  const separator = /\s$/.test(before) ? '' : ' ';
  return `${before}${separator}${rest}${after}`;
};

export const applyAbcMeasureEdits = (
  presentation: AbcPresentation,
  edits: readonly AbcMeasureEdit[],
  normalize = true,
): AbcCellEditResult => {
  if (!edits.length) return { ok: false, error: 'No measure edits were supplied.' };
  const targets = new Map<string, AbcMeasureCell>();
  for (const edit of edits) {
    if (/\r|\n|%/.test(edit.replacement)) {
      return { ok: false, error: 'Formatted measure edits must stay on one line and cannot add comments.' };
    }
    const target = allCells(presentation).find(({ id }) => id === edit.cellId);
    if (!target?.editable) return { ok: false, error: 'This measure must be edited in Raw Source.' };
    if (targets.has(edit.cellId)) return { ok: false, error: 'A measure can only be edited once per action.' };
    targets.set(edit.cellId, target);
  }
  try {
    let candidate = [...edits]
      .sort((left, right) => targets.get(right.cellId)!.range.start - targets.get(left.cellId)!.range.start)
      .reduce((source, edit) => {
        const target = targets.get(edit.cellId)!;
        const replacement = cleanedReplacement(target, edit.replacement);
        return `${source.slice(0, target.range.start)}${replacement}${source.slice(target.range.end)}`;
      }, presentation.abc);
    validatePreservedPresentation(presentation, candidate, new Set(targets.keys()));
    if (normalize) {
      for (const cellId of targets.keys()) {
        candidate = normalizeCellDuration(candidate, cellId);
      }
    }
    const next = validatePreservedPresentation(presentation, candidate, new Set(targets.keys()));
    return { ok: true, abc: candidate, presentation: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'ABC validation failed.' };
  }
};

export const validateAbcMeasureEdit = (
  presentation: AbcPresentation,
  cellId: string,
  replacement: string,
): AbcCellEditResult => applyAbcMeasureEdits(presentation, [{ cellId, replacement }]);

type PitchStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

const transposeNoteToken = (
  acc: string | undefined,
  step: string,
  oct: string | undefined,
  dur: string | undefined,
  tie: string | undefined,
  keyAlterations: Record<PitchStep, number>,
  semitones: number,
): string => {
  const upperStep = step.toUpperCase() as PitchStep;
  const isLower = step >= 'a' && step <= 'g';

  let octave = isLower ? 5 : 4;
  if (oct) {
    for (const ch of oct) {
      if (ch === ',') octave -= 1;
      else if (ch === "'") octave += 1;
    }
  }

  let alter = 0;
  if (acc === '^^') alter = 2;
  else if (acc === '^') alter = 1;
  else if (acc === '=') alter = 0;
  else if (acc === '_') alter = -1;
  else if (acc === '__') alter = -2;
  else {
    alter = keyAlterations[upperStep] ?? 0;
  }

  let targetStep: PitchStep = upperStep;
  let targetOctave = octave;
  let targetAlter = alter;

  if (semitones === 12 || semitones === -12) {
    targetOctave = octave + semitones / 12;
  } else if (semitones === 1) {
    if (alter === 0) {
      if (upperStep === 'E') {
        targetStep = 'F';
        targetAlter = 0;
      } else if (upperStep === 'B') {
        targetStep = 'C';
        targetOctave = octave + 1;
        targetAlter = 0;
      } else {
        targetAlter = 1;
      }
    } else if (alter === 1) {
      if (upperStep === 'E') {
        targetStep = 'F';
        targetAlter = 1;
      } else if (upperStep === 'B') {
        targetStep = 'C';
        targetOctave = octave + 1;
        targetAlter = 1;
      } else {
        const nextStepMap: Record<PitchStep, PitchStep> = {
          C: 'D', D: 'E', E: 'F', F: 'G', G: 'A', A: 'B', B: 'C',
        };
        targetStep = nextStepMap[upperStep];
        targetAlter = 0;
      }
    } else if (alter === -1) {
      targetAlter = 0;
    } else if (alter === 2) {
      if (upperStep === 'E') {
        targetStep = 'F';
        targetAlter = 2;
      } else if (upperStep === 'B') {
        targetStep = 'C';
        targetOctave = octave + 1;
        targetAlter = 2;
      } else {
        const nextStepMap: Record<PitchStep, PitchStep> = {
          C: 'D', D: 'E', E: 'F', F: 'G', G: 'A', A: 'B', B: 'C',
        };
        targetStep = nextStepMap[upperStep];
        targetAlter = 1;
      }
    } else if (alter === -2) {
      targetAlter = -1;
    }
  } else if (semitones === -1) {
    if (alter === 0) {
      if (upperStep === 'C') {
        targetStep = 'B';
        targetOctave = octave - 1;
        targetAlter = 0;
      } else if (upperStep === 'F') {
        targetStep = 'E';
        targetAlter = 0;
      } else {
        targetAlter = -1;
      }
    } else if (alter === -1) {
      if (upperStep === 'C') {
        targetStep = 'B';
        targetOctave = octave - 1;
        targetAlter = -1;
      } else if (upperStep === 'F') {
        targetStep = 'E';
        targetAlter = -1;
      } else {
        const prevStepMap: Record<PitchStep, PitchStep> = {
          C: 'B', D: 'C', E: 'D', F: 'E', G: 'F', A: 'G', B: 'A',
        };
        targetStep = prevStepMap[upperStep];
        targetAlter = 0;
      }
    } else if (alter === 1) {
      targetAlter = 0;
    } else if (alter === 2) {
      targetAlter = 1;
    } else if (alter === -2) {
      if (upperStep === 'C') {
        targetStep = 'B';
        targetOctave = octave - 1;
        targetAlter = -2;
      } else if (upperStep === 'F') {
        targetStep = 'E';
        targetAlter = -2;
      } else {
        const prevStepMap: Record<PitchStep, PitchStep> = {
          C: 'B', D: 'C', E: 'D', F: 'E', G: 'F', A: 'G', B: 'A',
        };
        targetStep = prevStepMap[upperStep];
        targetAlter = -1;
      }
    }
  }

  const keyAlter = keyAlterations[targetStep] ?? 0;
  let accStr = '';
  if (targetAlter !== keyAlter) {
    if (targetAlter === 2) accStr = '^^';
    else if (targetAlter === 1) accStr = '^';
    else if (targetAlter === 0) accStr = '=';
    else if (targetAlter === -1) accStr = '_';
    else if (targetAlter === -2) accStr = '__';
  }

  const letter = targetOctave >= 5 ? targetStep.toLowerCase() : targetStep;
  let octMark = '';
  if (targetOctave > 5) {
    octMark = "'".repeat(targetOctave - 5);
  } else if (targetOctave < 4) {
    octMark = ','.repeat(4 - targetOctave);
  }

  return `${accStr}${letter}${octMark}${dur || ''}${tie || ''}`;
};

export const transposeAbcMeasureNotes = (
  source: string,
  keyAlterations: Record<PitchStep, number>,
  semitones: number,
): string => {
  return source.replace(
    /"[^"]*"|\[[A-Za-z]:[^\]]*\]|![^!]*!|[zZx]\d*(?:\/+\d*)?|(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)(\d*(?:\/+\d*)?)(-?)/g,
    (match, acc, step, oct, dur, tie) => {
      if (!step) return match;
      return transposeNoteToken(acc, step, oct, dur, tie, keyAlterations, semitones);
    },
  );
};

/** Transposes complete Measure Source text with its active musical context. */
export const transposeAbcMeasureText = (
  presentation: AbcPresentation,
  cellId: string,
  source: string,
  semitones: number,
) => {
  if (![1, -1, 12, -12].includes(semitones)) {
    throw new Error('Transpose must be one semitone or one octave.');
  }
  const target = allCells(presentation).find(({ id }) => id === cellId);
  if (!target?.editable) throw new Error('This measure must be edited in Raw Source.');
  const score = extractScore(presentation.abc);
  const measure = score.measures.find(({ measureNumber }) => measureNumber === target.measureNumber);
  if (!measure) {
    throw new Error('Measure not found in score.');
  }
  const bar = source.match(/(\|[:|[\]]*\s*)$/);
  const barText = bar?.[1] || '';
  const body = bar ? source.slice(0, source.length - barText.length) : source;
  if (!body.trim()) throw new Error('Select complete notes to transpose.');

  let keyAlterations: Record<PitchStep, number> = {
    C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0,
  };
  try {
    const rawKey = measure.activeKey && measure.activeKey !== 'none' ? measure.activeKey : 'C';
    const info = parseKeySignature(rawKey);
    if (info?.alterations) {
      keyAlterations = info.alterations;
    }
  } catch {
    // Fallback to C major
  }

  const transformedBody = transposeAbcMeasureNotes(body, keyAlterations, semitones);
  if (!transformedBody.trim()) throw new Error('Could not transpose the selected ABC source.');
  return `${transformedBody}${barText}`;
};

export const validateAbcHeaderEdit = (
  presentation: AbcPresentation,
  headerRange: AbcTextRange,
  replacementText: string,
  tag?: string,
): AbcCellEditResult => {
  if (/\r|\n/.test(replacementText)) {
    return { ok: false, error: 'Header edits must stay on one line.' };
  }
  let cleanReplacement = replacementText.trim();
  if (!cleanReplacement) {
    return { ok: false, error: 'Header line cannot be empty.' };
  }
  if (tag && !cleanReplacement.startsWith(`${tag}:`) && !cleanReplacement.startsWith(`${tag.toLowerCase()}:`)) {
    cleanReplacement = `${tag}:${cleanReplacement}`;
  }
  const candidate = `${presentation.abc.slice(0, headerRange.start)}${cleanReplacement}${presentation.abc.slice(headerRange.end)}`;
  try {
    const next = buildAbcPresentation(candidate);
    return { ok: true, abc: candidate, presentation: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'ABC header validation failed.' };
  }
};

export const resolvePlaybackMeasure = (
  presentation: AbcPresentation,
  startCharArray: readonly number[] | undefined,
  endCharArray: readonly number[] | undefined,
): number | null => {
  const starts = startCharArray || [];
  const ends = endCharArray || [];
  const measures = new Set<number>();
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = ends[index] ?? start + 1;
    const matched = presentation.voices.flatMap(({ cells }) => cells).find(({ range }) => (
      start < range.end && end > range.start
    ));
    if (!matched) return null;
    measures.add(matched.measureNumber);
  }
  return measures.size === 1 ? [...measures][0] : null;
};

export type RawLineSegment = Readonly<{
  text: string;
  measureNumber?: number;
  isSelected?: boolean;
  isPlaying?: boolean;
}>;

export type RawLineAnalysis = Readonly<{
  lineNumber: number;
  text: string;
  start: number;
  end: number;
  explanation?: string;
  voice?: { id: string; colorIndex: number };
  isSelected: boolean;
  isPlaying: boolean;
  measureNumbers: readonly number[];
  segments: readonly RawLineSegment[];
}>;

export const HEADER_EXPLANATIONS: Readonly<Record<string, string>> = Object.freeze({
  X: 'Reference',
  T: 'Title',
  C: 'Composer',
  A: 'Author / lyricist',
  M: 'Meter',
  L: 'Default note length',
  Q: 'Tempo',
  O: 'Origin',
  R: 'Rhythm',
  K: 'Key',
  V: 'Voice',
  P: 'Parts',
  W: 'Words',
  w: 'Words / lyrics',
  N: 'Notes',
  Z: 'Transcription notes',
  B: 'Book',
  S: 'Source',
  D: 'Discography',
  F: 'File URL',
});

export const analyzeRawAbcLines = (
  abcCode: string,
  presentation: AbcPresentation | null,
  activeAnchor: { startMeasure: number; endMeasure: number } | null | undefined,
  playingMeasure: number | null | undefined,
): readonly RawLineAnalysis[] => {
  const lines = abcCode.split('\n');
  const declaredVoices: string[] = [];
  const voiceColorMap = new Map<string, number>();

  if (presentation) {
    presentation.voices.forEach((v) => {
      declaredVoices.push(v.id);
      voiceColorMap.set(v.id, v.colorIndex);
    });
  } else {
    for (const match of abcCode.matchAll(/^V:\s*([^\s]+)/gm)) {
      if (!declaredVoices.includes(match[1])) {
        declaredVoices.push(match[1]);
        voiceColorMap.set(match[1], declaredVoices.length - 1);
      }
    }
    for (const match of abcCode.matchAll(/\[V:\s*([^\]\s]+)/g)) {
      if (!declaredVoices.includes(match[1])) {
        declaredVoices.push(match[1]);
        voiceColorMap.set(match[1], declaredVoices.length - 1);
      }
    }
  }

  let titleCount = 0;
  let currentVoiceId: string | null = null;
  let offset = 0;
  const result: RawLineAnalysis[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    const start = offset;
    const end = offset + text.length;
    offset = end + 1;

    const headerMatch = text.match(/^([A-Za-z]):\s*(.*)$/);
    let explanation: string | undefined;
    if (headerMatch) {
      const tag = headerMatch[1];
      const val = headerMatch[2].trim();
      let label: string | undefined;
      if (tag === 'T') {
        titleCount += 1;
        label = titleCount === 1 ? 'Title' : 'Subtitle';
      } else {
        label = HEADER_EXPLANATIONS[tag];
      }
      if (label && val) {
        explanation = `${label}: ${val}`;
      } else if (label) {
        explanation = label;
      }
      if (tag === 'V') {
        const vId = val.split(/\s+/)[0];
        if (vId) currentVoiceId = vId;
      }
    }

    const inlineVoiceMatch = text.match(/\[V:\s*([^\]\s]+)/);
    if (inlineVoiceMatch) {
      currentVoiceId = inlineVoiceMatch[1];
    }

    let lineVoice: { id: string; colorIndex: number } | undefined;
    const lineCells: AbcMeasureCell[] = [];
    if (presentation) {
      for (const voice of presentation.voices) {
        for (const cell of voice.cells) {
          if (cell.range.start < end && cell.range.end > start) {
            lineCells.push(cell);
            if (!lineVoice) {
              lineVoice = { id: voice.id, colorIndex: voice.colorIndex };
            }
          }
        }
      }
    }

    if (!lineVoice && currentVoiceId && voiceColorMap.has(currentVoiceId) && !headerMatch) {
      lineVoice = { id: currentVoiceId, colorIndex: voiceColorMap.get(currentVoiceId)! };
    } else if (!lineVoice && headerMatch && headerMatch[1] === 'V') {
      const vId = headerMatch[2].trim().split(/\s+/)[0];
      if (vId && voiceColorMap.has(vId)) {
        lineVoice = { id: vId, colorIndex: voiceColorMap.get(vId)! };
      }
    }

    const measureNumbers = Object.freeze(
      Array.from(new Set(lineCells.map((c) => c.measureNumber))).sort((a, b) => a - b),
    );
    const isSelected = measureNumbers.some((m) => Boolean(
      activeAnchor && m >= activeAnchor.startMeasure && m <= activeAnchor.endMeasure,
    ));
    const isPlaying = measureNumbers.some((m) => Boolean(
      playingMeasure && m === playingMeasure,
    ));

    const segments: RawLineSegment[] = [];
    if (lineCells.length > 0) {
      const sortedCells = [...lineCells].sort((a, b) => a.range.start - b.range.start);
      let lineCursor = start;

      for (let idx = 0; idx < sortedCells.length; idx += 1) {
        const cell = sortedCells[idx];

        let cellStart = lineCursor;
        if (idx === 0 && lineCursor < cell.range.start) {
          const prefixText = abcCode.slice(lineCursor, cell.range.start);
          const voiceTagMatch = prefixText.match(/^(\s*\[V:[^\]]+\]\s*)/);
          if (voiceTagMatch) {
            const prefixEnd = lineCursor + voiceTagMatch[0].length;
            segments.push(Object.freeze({
              text: abcCode.slice(lineCursor, prefixEnd),
            }));
            lineCursor = prefixEnd;
            cellStart = prefixEnd;
          }
        } else if (idx > 0 && lineCursor < cell.range.start) {
          const betweenText = abcCode.slice(lineCursor, cell.range.start);
          if (betweenText.includes('[V:')) {
            segments.push(Object.freeze({
              text: betweenText,
            }));
            lineCursor = cell.range.start;
            cellStart = cell.range.start;
          }
        }

        const cellEnd = Math.min(end, Math.max(cellStart, cell.range.end));

        if (cellStart > lineCursor) {
          segments.push(Object.freeze({
            text: abcCode.slice(lineCursor, cellStart),
          }));
        }

        if (cellEnd > cellStart) {
          const m = cell.measureNumber;
          const cellSelected = Boolean(activeAnchor && m >= activeAnchor.startMeasure && m <= activeAnchor.endMeasure);
          const cellPlaying = Boolean(playingMeasure && m === playingMeasure);
          segments.push(Object.freeze({
            text: abcCode.slice(cellStart, cellEnd),
            measureNumber: m,
            isSelected: cellSelected,
            isPlaying: cellPlaying,
          }));
          lineCursor = cellEnd;
        }
      }

      if (lineCursor < end) {
        segments.push(Object.freeze({
          text: abcCode.slice(lineCursor, end),
        }));
      }
    } else {
      segments.push(Object.freeze({ text }));
    }

    result.push(Object.freeze({
      lineNumber: i + 1,
      text,
      start,
      end,
      ...(explanation ? { explanation } : {}),
      ...(lineVoice ? { voice: lineVoice } : {}),
      isSelected,
      isPlaying,
      measureNumbers,
      segments: Object.freeze(segments),
    }));
  }

  return Object.freeze(result);
};
