import abcjs from 'abcjs';

import { prepareAbcForPlayback } from '../utils/abcAudio';

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

const literalRanges = (abc: string, ranges: readonly AbcTextRange[]) => (
  ranges.map((range) => abc.slice(range.start, range.end))
);

export const validateAbcMeasureEdit = (
  presentation: AbcPresentation,
  cellId: string,
  replacement: string,
): AbcCellEditResult => {
  if (/\r|\n|%/.test(replacement)) {
    return { ok: false, error: 'Formatted measure edits must stay on one line and cannot add comments.' };
  }
  const target = presentation.voices.flatMap(({ cells }) => cells).find(({ id }) => id === cellId);
  if (!target?.editable) return { ok: false, error: 'This measure must be edited in Raw Source.' };
  const leadingWhitespace = target.text.match(/^\s*/)?.[0] || '';
  const trailingWhitespace = target.text.match(/\s*$/)?.[0] || '';
  const replacementWithSpacing = `${leadingWhitespace}${replacement.trim()}${trailingWhitespace}`;
  const candidate = `${presentation.abc.slice(0, target.range.start)}${replacementWithSpacing}${presentation.abc.slice(target.range.end)}`;
  try {
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
    const oldCells = presentation.voices.flatMap(({ cells }) => cells).filter(({ id }) => id !== cellId);
    const newCells = next.voices.flatMap(({ cells }) => cells).filter(({ id }) => id !== cellId);
    if (oldCells.length !== newCells.length || oldCells.some((cell, index) => (
      cell.id !== newCells[index]?.id || cell.text !== newCells[index]?.text
    ))) {
      throw new Error('Measure structure changed. Use Raw Source.');
    }
    const nextTarget = next.voices.flatMap(({ cells }) => cells).find(({ id }) => id === cellId);
    if (!nextTarget?.editable) throw new Error('The edited measure no longer has safe source ownership.');
    return { ok: true, abc: candidate, presentation: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'ABC validation failed.' };
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
