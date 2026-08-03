import abcjs from 'abcjs';

/**
 * Produces structurally safe ABC while preserving source offsets.
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
 * This ABC is the common timing model for engraving and synthesis. Whitespace
 * preserves source offsets used by score selection.
 */
const TUPLET_INVISIBLE_REST_PATTERN = /(\(\d(?::\d*){0,2}[ \t]*)x/g;
const HAIRPIN_DECORATION_PATTERN = /![<>][()]!/g;

export function prepareAbcForPlayback(abc: string): string {
  if (!abc) return '';
  return abc
    .replace(
      /\[Q:[^\]]+\]|\[I:staff\s+[+-]?\d+\]/gi,
      (directive) => ' '.repeat(directive.length),
    )
    .replace(TUPLET_INVISIBLE_REST_PATTERN, '$1z');
}

/**
 * Removes hairpins only from synthesis.
 *
 * abcjs applies a fixed crescendo/diminuendo delta to each beat-accent volume.
 * A short diminuendo can therefore make weaker notes negative; the flattener
 * clamps those notes to volume zero and leaves later notes silent. Explicit
 * dynamics such as `!pp!` remain intact, and replacing only the hairpin tokens
 * with whitespace leaves notes, durations, and source offsets unchanged.
 */
export function prepareAbcForAudio(abc: string): string {
  return prepareAbcForPlayback(abc)
    .replace(HAIRPIN_DECORATION_PATTERN, (decoration) => ' '.repeat(decoration.length));
}

type ParsedTupletElement = {
  el_type?: string;
  duration?: number;
  startTriplet?: number;
  endTriplet?: boolean;
  tripletMultiplier?: number;
  tripletR?: number;
};

type ParsedAudioTune = abcjs.TuneObject & {
  lines?: Array<{
    staff?: Array<{
      voices?: ParsedTupletElement[][];
    }>;
  }>;
};

/**
 * abcjs's MIDI sequencer does not clear its active multiplier when the same
 * note both starts and ends an extended tuplet such as `(3:2:1C,3/2)`.
 * Applying the multiplier directly to that note and removing the tuplet state
 * prevents later measures in the voice from being shortened.
 */
function resolveSelfContainedTuplets(tunes: abcjs.TuneObject[]): void {
  for (const tune of tunes as ParsedAudioTune[]) {
    for (const line of tune.lines ?? []) {
      for (const staff of line.staff ?? []) {
        for (const voice of staff.voices ?? []) {
          for (const element of voice) {
            if (
              element.el_type !== 'note'
              || !element.startTriplet
              || !element.endTriplet
              || element.duration === undefined
              || element.tripletMultiplier === undefined
            ) continue;

            element.duration *= element.tripletMultiplier;
            delete element.startTriplet;
            delete element.endTriplet;
            delete element.tripletMultiplier;
            delete element.tripletR;
          }
        }
      }
    }
  }
}

const MAX_AUDIO_CACHE_SIZE = 50;
const audioTuneCache = new Map<string, abcjs.TuneObject[]>();

/**
 * Clears the in-memory ABC audio tune cache.
 */
export function clearAudioTuneCache(): void {
  audioTuneCache.clear();
}

export function bindAudioSynthesis(
  targetTune: abcjs.TuneObject,
  audioSourceTune: abcjs.TuneObject,
): boolean {
  if (typeof audioSourceTune?.setUpAudio !== 'function') return false;
  try {
    targetTune.setUpAudio = audioSourceTune.setUpAudio.bind(audioSourceTune);
    return true;
  } catch {
    return false;
  }
}

export function hideSvgNode(svgElement: SVGElement | null | undefined): void {
  if (!svgElement || typeof svgElement.setAttribute !== 'function') return;
  try {
    svgElement.setAttribute('visibility', 'hidden');
    svgElement.setAttribute('aria-hidden', 'true');
    svgElement.setAttribute('pointer-events', 'none');
  } catch {
    // Ignore DOM detachment errors
  }
}

/**
 * Keeps the engraved tune as the source of cursor and timing events while
 * supplying it with an equivalent, hairpin-safe synthesis event stream.
 */
export function configureAudioPlayback(
  originalAbc: string,
  tunes: abcjs.TuneObject[] | null | undefined,
): void {
  if (!originalAbc || !tunes?.length) return;
  if (typeof abcjs.parseOnly !== 'function') return;

  let audioTunes = audioTuneCache.get(originalAbc);
  if (!audioTunes) {
    audioTunes = abcjs.parseOnly(prepareAbcForAudio(originalAbc));
    resolveSelfContainedTuplets(audioTunes);

    if (audioTuneCache.size >= MAX_AUDIO_CACHE_SIZE) {
      const firstKey = audioTuneCache.keys().next().value;
      if (firstKey !== undefined) {
        audioTuneCache.delete(firstKey);
      }
    }
    audioTuneCache.set(originalAbc, audioTunes);
  }

  for (const [index, tune] of tunes.entries()) {
    const audioTune = audioTunes[index];
    if (audioTune) {
      bindAudioSynthesis(tune, audioTune);
    }
  }
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
      hideSvgNode(selectable.svgEl);
    }
  }
}
