import abcjs from 'abcjs';
import { prepareAbcForAudio } from '../utils/abcAudio';
import { sourceOffsetMapper, sourcePrograms, restoreSourcePrograms } from './abcPrograms';
import { createVoiceResolver } from '../../shared/abc-source.mjs';
import { describeMixerVoices, type MixerVoice, type VoiceMixSettings } from './voiceMixer';

export interface MixerStaff extends MixerVoice {
  voiceIds: string[];
  trackIndexes: number[];
  starts: number[];
  mixed: boolean;
}

const staffCache = new Map<string, MixerStaff[]>();

/** Staff groups come from the parsed score, never from voice names or clefs. */
export function describeMixerStaves(_renderedTune: abcjs.TuneObject, abc: string): MixerStaff[] {
  const cached = staffCache.get(abc);
  if (cached) return cached;
  // Visual engraving expands multi-measure rests; use source-length parse
  // offsets for editing, so later staves never target shifted characters.
  const tune = abcjs.parseOnly(prepareAbcForAudio(abc))[0];
  if (!tune) return [];
  restoreSourcePrograms([tune], abc);
  const voices = describeMixerVoices(tune, abc);
  const toOriginal = sourceOffsetMapper(abc);
  const resolve = createVoiceResolver(abc, toOriginal);
  const staves = new Map<string, MixerStaff>();
  for (const line of tune.lines ?? []) {
    let slot = 0;
    for (const staff of line.staff ?? []) {
      if (String(staff.clef?.type) === 'TAB') continue;
      const ids: string[] = [];
      const starts: number[] = [];
      for (const voice of staff.voices ?? []) {
        ids.push(resolve(voice, slot++));
        const first = voice.find((element) => element.el_type === 'note' && element.startChar >= 0);
        if (first && 'startChar' in first) starts.push(toOriginal(first.startChar));
      }
      if (!ids.length) continue;
      const id = `staff:${JSON.stringify([...ids].sort())}`;
      if (staves.has(id)) continue;
      const tracks = voices.filter((voice) => ids.includes(voice.id));
      const program = tracks[0]?.program ?? 0;
      staves.set(id, { id, label: `Staff ${staves.size + 1}`, index: staves.size, program,
        voiceIds: ids, starts, trackIndexes: tracks.map((track) => track.index),
        mixed: tracks.some((track) => track.program !== program) });
    }
  }
  const result = [...staves.values()];
  if (staffCache.size >= 8) staffCache.delete(staffCache.keys().next().value!);
  staffCache.set(abc, result);
  return result;
}

/** Programs are always read from ABC; local settings only control audibility. */
export function staffListeningMix(voices: readonly MixerVoice[], staves: readonly MixerStaff[], settings: VoiceMixSettings): VoiceMixSettings {
  return Object.fromEntries(voices.map((voice) => {
    const staff = staves.find((entry) => entry.trackIndexes.includes(voice.index));
    const mix = staff ? settings[staff.id] : undefined;
    return [voice.id, { muted: mix?.muted === true, solo: mix?.solo === true }];
  }));
}

/** Change only program instructions and insert an initial override for each part. */
export function setStaffInstrument(abc: string, staff: MixerStaff, program: number): string {
  if (!Number.isInteger(program) || program < 0 || program > 128) throw new Error('Invalid instrument');
  const edits: { start: number; end: number; text: string }[] = sourcePrograms(abc)
    .filter((field) => field.voiceId !== null && staff.voiceIds.includes(field.voiceId))
    .map((field) => ({ start: field.programStart, end: field.programEnd, text: String(program) }));
  for (const start of staff.starts) {
    // A previous button edit already installed the initial voice instruction.
    if (/\[I:MIDI[=\s]+program\s+(?:\d+\s+)?\d+\]\s*$/i.test(abc.slice(0, start))) continue;
    edits.push({ start, end: start, text: ` [I:MIDI=program ${program}] ` });
  }
  let result = abc;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
