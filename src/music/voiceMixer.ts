import type abcjs from 'abcjs';
import { createVoiceResolver } from '../../shared/abc-source.mjs';
import { sourceOffsetMapper } from './abcPrograms';

export interface MixerVoice { id: string; label: string; index: number; program: number }
export interface VoiceMix { program?: number; muted?: boolean; solo?: boolean }
export type VoiceMixSettings = Readonly<Record<string, VoiceMix>>;

export function describeMixerVoices(tune: abcjs.TuneObject, abc: string): MixerVoice[] {
  if (typeof tune.setUpAudio !== 'function') return [];
  const sequence = tune.setUpAudio({});
  const resolveVoice = createVoiceResolver(abc, sourceOffsetMapper(abc));
  const ids: string[] = [];
  for (const line of tune.lines ?? []) {
    let slot = 0;
    for (const staff of line.staff ?? []) {
      if (String(staff.clef?.type) === 'TAB') continue;
      for (const voice of staff.voices ?? []) {
        ids[slot] ??= resolveVoice(voice, slot);
        slot++;
      }
    }
  }
  const voices = sequence.tracks.map((track, index) => {
    const title = track.find((event) => event.cmd === 'text' && event.type === 'name');
    const firstNote = track.find((event) => event.cmd === 'note' && event.startChar !== undefined && event.startChar >= 0);
    const sourceId = firstNote?.cmd === 'note' ? resolveVoice([firstNote], index) : undefined;
    const program = track.find((event) => event.cmd === 'program');
    return {
      id: sourceId ?? ids[index] ?? `accompaniment-${index - ids.length + 1}`,
      label: title?.cmd === 'text' && title.text.trim() && !/^\d+$/.test(title.text.trim()) ? title.text.trim()
        : index < ids.length ? `Voice ${index + 1}` : `Accompaniment ${index - ids.length + 1}`,
      index, program: program?.cmd === 'program' ? program.instrument : 0,
    };
  });
  return voices.map((voice) => voices.filter((entry) => entry.label === voice.label).length > 1
    ? { ...voice, label: `${voice.label} (Voice ${voice.index + 1})` } : voice);
}

export function isVoiceAudible(voice: MixerVoice, voices: readonly MixerVoice[], settings: VoiceMixSettings): boolean {
  const soloing = voices.some(({ id }) => settings[id]?.solo);
  return !settings[voice.id]?.muted && (!soloing || Boolean(settings[voice.id]?.solo));
}

/** Apply before soundfont loading; never mutate abcjs's source sequence. */
export function mixVoiceSequence(sequence: abcjs.AudioTracks, voices: readonly MixerVoice[], settings: VoiceMixSettings): abcjs.AudioTracks {
  return { ...sequence, tracks: sequence.tracks.map((track, index) => {
    const voice = voices.find((entry) => entry.index === index);
    if (!voice) return track.map((event) => ({ ...event }));
    const program = settings[voice.id]?.program;
    const audible = isVoiceAudible(voice, voices, settings);
    return track.map((event) => ({ ...event,
      ...(program !== undefined && (event.cmd === 'program' || event.cmd === 'note') ? { instrument: program } : {}),
      ...(event.cmd === 'note' && !audible ? { volume: 0 } : {}),
    }));
  }) };
}

export function readVoiceMix(documentId?: string): VoiceMixSettings {
  if (!documentId) return {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(`chorale.voiceMix.${documentId}`) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)).map(([id, value]) => {
      const mix = value as Record<string, unknown>;
      return [id, {
        ...(Number.isInteger(mix.program) && Number(mix.program) >= 0 && Number(mix.program) <= 128 ? { program: Number(mix.program) } : {}),
        muted: mix.muted === true, solo: mix.solo === true,
      }];
    }));
  } catch { return {}; }
}

export function writeVoiceMix(documentId: string | undefined, settings: VoiceMixSettings): void {
  if (!documentId) return;
  try { localStorage.setItem(`chorale.voiceMix.${documentId}`, JSON.stringify(settings)); } catch { /* Listening controls still work when storage is unavailable. */ }
}
