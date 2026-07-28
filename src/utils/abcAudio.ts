/**
 * Produces the ABC used by both engraving and synthesis.
 *
 * abcjs cannot apply a tempo change in one voice halfway through a sustained
 * note or rest in another voice. Removing body-level tempo changes keeps every
 * voice on the header tempo.
 *
 * abcjs also does not support inline `I:staff` changes. When one immediately
 * follows a decoration, abcjs parses the letters in "staff" as notes and adds
 * an invisible bar, shifting that voice in both engraving and synthesis.
 * Removing the unsupported directive leaves the notes on their declared staff
 * while preserving their rhythm.
 *
 * Because this same ABC is rendered, engraving, audio, seeking, duration, and
 * cursor callbacks all share one timing model.
 * Whitespace preserves source offsets used by score selection.
 */
export function prepareAbcForPlayback(abc: string): string {
  if (!abc) return '';
  return abc.replace(
    /\[Q:[^\]]+\]|\[I:staff\s+[+-]?\d+\]/gi,
    (directive) => ' '.repeat(directive.length),
  );
}
