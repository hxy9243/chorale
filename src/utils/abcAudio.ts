import type abcjs from 'abcjs';

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
 * abcjs also crashes while engraving a tuplet whose first event is an
 * invisible rest (`(3x...`) because it tries to anchor the tuplet number to a
 * glyph that was intentionally not created. A visible rest has the same silent
 * duration and does create an anchor, so use one during engraving and hide that
 * synthetic glyph after rendering.
 *
 * Because this same ABC is rendered, engraving, audio, seeking, duration, and
 * cursor callbacks all share one timing model.
 * Whitespace preserves source offsets used by score selection.
 */
const TUPLET_INVISIBLE_REST_PATTERN = /(\(\d(?::\d*){0,2}[ \t]*)x/g;

export function prepareAbcForPlayback(abc: string): string {
  if (!abc) return '';
  return abc
    .replace(
      /\[Q:[^\]]+\]|\[I:staff\s+[+-]?\d+\]/gi,
      (directive) => ' '.repeat(directive.length),
    )
    .replace(TUPLET_INVISIBLE_REST_PATTERN, '$1z');
}

type EngravedSelectable = {
  absEl?: {
    abcelem?: {
      startChar?: number;
    };
  };
  svgEl?: SVGElement;
};

type TuneWithEngraver = abcjs.TuneObject & {
  engraver?: {
    selectables?: EngravedSelectable[];
  };
};

/**
 * Restores the visual intent of invisible rests promoted solely to work around
 * abcjs's triplet-anchor crash. The SVG group remains in layout so the tuplet
 * bracket keeps a valid anchor and all timing stays unchanged.
 */
export function hideSyntheticTupletRests(
  originalAbc: string,
  tunes: abcjs.TuneObject[] | null | undefined,
): void {
  if (!originalAbc || !tunes?.length) return;

  const offsets = new Set<number>();
  for (const match of originalAbc.matchAll(TUPLET_INVISIBLE_REST_PATTERN)) {
    if (match.index !== undefined) {
      // abcjs includes the tuplet marker in the first event's source range.
      offsets.add(match.index);
    }
  }
  if (offsets.size === 0) return;

  for (const tune of tunes as TuneWithEngraver[]) {
    for (const selectable of tune.engraver?.selectables ?? []) {
      if (!offsets.has(selectable.absEl?.abcelem?.startChar ?? -1)) continue;
      selectable.svgEl?.setAttribute('visibility', 'hidden');
      selectable.svgEl?.setAttribute('aria-hidden', 'true');
      selectable.svgEl?.setAttribute('pointer-events', 'none');
    }
  }
}
