/**
 * Produces the ABC used by both engraving and synthesis.
 *
 * abcjs cannot apply a tempo change in one voice halfway through a sustained
 * note or rest in another voice. Removing body-level tempo changes keeps every
 * voice on the header tempo and, because this same ABC is rendered, preserves
 * a single timing model for audio, seeking, duration, and cursor callbacks.
 * Whitespace preserves source offsets used by score selection.
 */
export function prepareAbcForPlayback(abc: string): string {
  if (!abc) return '';
  return abc.replace(/\[Q:[^\]]+\]/g, (tempo) => ' '.repeat(tempo.length));
}
