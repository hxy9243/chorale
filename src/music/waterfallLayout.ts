import type { WaterfallNote } from './waterfallPlayback';

export const WATERFALL_COLORS = ['#539b92', '#7697b6', '#bf8874', '#8a9585', '#aa8caf', '#ba9d64'];
export const isBlackKey = (pitch: number): boolean => [1, 3, 6, 8, 10].includes(pitch % 12);
export const pitchLabel = (pitch: number): string => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`;
export interface PianoKey { midiPitch: number; x: number; width: number; black: boolean }

/** Complete octaves preserve recognizable two/three black-key groupings. */
export function pianoKeys(notes: readonly WaterfallNote[]): PianoKey[] {
  const pitches = notes.map((note) => note.midiPitch).filter((pitch) => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127);
  const low = pitches.length ? pitches.reduce((min, pitch) => Math.min(min, pitch), 127) : 48;
  const high = pitches.length ? pitches.reduce((max, pitch) => Math.max(max, pitch), 0) : 71;
  let start = Math.floor(low / 12) * 12;
  let end = Math.min(127, Math.floor(high / 12) * 12 + 11);
  while (end - start < 23) {
    if (start >= 12) start -= 12;
    else end = 23;
  }
  const keys: PianoKey[] = [];
  let whiteIndex = 0;
  for (let pitch = start; pitch <= end; pitch++) {
    const black = isBlackKey(pitch);
    keys.push({ midiPitch: pitch, black, x: black ? whiteIndex - 0.31 : whiteIndex, width: black ? 0.62 : 1 });
    if (!black) whiteIndex++;
  }
  return keys;
}

interface NoteInterval { note: WaterfallNote; maxEnd: number; left: NoteInterval | null; right: NoteInterval | null }
export interface NoteWindow { root: NoteInterval | null }
export function indexNoteWindow(notes: readonly WaterfallNote[]): NoteWindow {
  const sorted = [...notes].sort((a, b) => a.onsetSeconds - b.onsetSeconds);
  const build = (start: number, end: number): NoteInterval | null => {
    if (start >= end) return null;
    const mid = (start + end) >>> 1;
    const note = sorted[mid];
    const left = build(start, mid);
    const right = build(mid + 1, end);
    return { note, left, right, maxEnd: Math.max(note.onsetSeconds + note.durationSeconds, left?.maxEnd ?? 0, right?.maxEnd ?? 0) };
  };
  return { root: build(0, sorted.length) };
}

/** Interval subtrees prune expired history even beneath a very long held note. */
export function visibleNotes(index: NoteWindow, time: number, lookAhead = 5): WaterfallNote[] {
  const result: WaterfallNote[] = [];
  const visit = (node: NoteInterval | null) => {
    if (!node || node.maxEnd <= time) return;
    visit(node.left);
    if (node.note.onsetSeconds > time + lookAhead) return;
    if (node.note.onsetSeconds + node.note.durationSeconds > time) result.push(node.note);
    visit(node.right);
  };
  visit(index.root);
  return result;
}

/** Bottom edge meets the keyboard at onset; a held note disappears into it. */
export function noteGeometry(note: WaterfallNote, time: number, keyboardY: number, lookAhead = 5) {
  const pixelsPerSecond = keyboardY / lookAhead;
  const bottom = keyboardY - (note.onsetSeconds - time) * pixelsPerSecond;
  const top = bottom - note.durationSeconds * pixelsPerSecond;
  return { y: Math.max(0, top), height: Math.max(0, Math.min(keyboardY, bottom) - Math.max(0, top)), bottom };
}
