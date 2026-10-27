import type abcjs from 'abcjs';
import { createVoiceResolver, isNotationOffset, prepareAbcWithMap } from '../../shared/abc-source.mjs';

export interface SourceProgram { voiceId: string | null; program: number; offset: number; end: number; programStart: number; programEnd: number; channel?: number }

/** Read real MIDI fields, ignoring quoted text, lyrics and ordinary comments. */
export function sourcePrograms(abc: string): SourceProgram[] {
  const declarations = [...abc.matchAll(/^[ \t]*V:\s*([^\s%]+)|\[V:\s*([^\]\s%]+)/gm)]
    .filter((match) => isNotationOffset(abc, match.index));
  let voice = declarations[0]?.[1] ?? declarations[0]?.[2] ?? 'voice-1';
  let body = false;
  const programs: SourceProgram[] = [];
  const tokens = /^[ \t]*V:\s*([^\s%]+)[^\r\n]*|\[V:\s*([^\]\s%]+)[^\]]*\]|^[ \t]*K:[^\r\n]*|^[ \t]*(?:%%MIDI\s+|I:MIDI[=\s]+)program\s+(?:\d+\s+)?(\d+)[^\r\n]*|\[I:MIDI[=\s]+program\s+(?:\d+\s+)?(\d+)\s*\]/gmi;
  for (const match of abc.matchAll(tokens)) {
    if (!/^[ \t]*%%MIDI/.test(match[0]) && !isNotationOffset(abc, match.index)) continue;
    if (match[1] || match[2]) { voice = match[1] ?? match[2]; continue; }
    if (/^[ \t]*K:/i.test(match[0])) { body = true; continue; }
    const program = Number(match[3] ?? match[4]);
    const prefix = /program\s+(?:(\d+)\s+)?/i.exec(match[0])!;
    const programStart = match.index + prefix.index + prefix[0].length;
    if (program >= 0 && program <= 128) programs.push({ voiceId: body ? voice : null, program,
      offset: match.index, end: match.index + match[0].length,
      programStart, programEnd: programStart + (match[3] ?? match[4]).length,
      ...(prefix[1] ? { channel: Number(prefix[1]) } : {}) });
  }
  return programs;
}

export function sourceOffsetMapper(abc: string): (offset: number) => number {
  const mapping = prepareAbcWithMap(abc);
  const carriageReturns = [...mapping.prepared.matchAll(/\r/g)].map((match) => match.index);
  return (offset) => {
    let raw = offset;
    for (const position of carriageReturns) { if (position <= raw) raw++; else break; }
    return mapping.toOriginalOffset(raw);
  };
}

type ProgramItem = { el_type: string; startChar?: number; cmd?: string; params?: number[] };
type ProgramTune = { formatting: { midi?: Record<string, number[]> }; lines: { staff?: { clef?: { type?: string }; voices: ProgramItem[][] }[] }[] };

/** abcjs drops MIDI fields before a newly-created voice's first note. Restore
 * source-scoped events after parsing, before synthesis (also used by exports). */
export function restoreSourcePrograms(tunes: abcjs.TuneObject[], abc: string): void {
  const fields = sourcePrograms(abc);
  if (!fields.length) return;
  const globalField = fields.filter((field) => field.voiceId === null).at(-1);
  const globalProgram = globalField?.program ?? 0;
  const toOriginal = sourceOffsetMapper(abc);
  const resolve = createVoiceResolver(abc, toOriginal);
  for (const rawTune of tunes) {
    if (!rawTune.lines || !rawTune.formatting) continue;
    const tune = rawTune as unknown as ProgramTune;
    tune.formatting.midi = { ...tune.formatting.midi, program: globalField?.channel !== undefined ? [globalField.channel, globalProgram] : [globalProgram] };
    const applied = new Set<SourceProgram>();
    for (const line of tune.lines) {
      let slot = 0;
      for (const staff of line.staff ?? []) {
        if (staff.clef?.type === 'TAB') continue;
        for (let index = 0; index < staff.voices.length; index++) {
          const voice = staff.voices[index];
          const id = resolve(voice, slot++);
          const pending = fields.filter((field) => field.voiceId === id);
          const restored: ProgramItem[] = [];
          for (const item of voice) {
            if (item.el_type === 'midi' && item.cmd === 'program') continue;
            if (item.startChar !== undefined && item.startChar >= 0) {
              const offset = toOriginal(item.startChar);
              for (const field of pending) if (!applied.has(field) && field.end <= offset) {
                restored.push({ el_type: 'midi', cmd: 'program', params: [field.program], startChar: -1 });
                applied.add(field);
              }
            }
            restored.push(item);
          }
          staff.voices[index] = restored;
        }
      }
    }
  }
}
