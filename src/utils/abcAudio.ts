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

export interface PreparedAbcWithMap {
  prepared: string;
  toOriginalOffset: (offset: number) => number;
}

/**
 * Prepares ABC source for abcjs parsing, audio synthesis, and engraving.
 *
 * 1. Replaces unsupported inline directives (`[Q:...]`, `[I:staff ...]`) with spaces
 *    to preserve rhythm and exact character offsets.
 * 2. Rewrites invisible tuplet rests (`(3x...`) to visible rests (`(3z...`) to avoid
 *    abcjs layout crashes.
 * 3. Converts empty or whitespace-only lines in between to ABC comment lines (`%`) so
 *    that abcjs does not treat empty lines as premature tune terminators.
 *
 * Provides `toOriginalOffset` to accurately map any character offset in `prepared`
 * back to the original offset in `abc`.
 */
export function prepareAbcWithMap(abc: string): PreparedAbcWithMap {
  if (!abc) {
    return { prepared: '', toOriginalOffset: (offset: number) => offset };
  }

  const sanitized = abc
    .replace(
      /\[Q:[^\]]+\]|\[I:staff\s+[+-]?\d+\]/gi,
      (directive) => ' '.repeat(directive.length),
    )
    .replace(TUPLET_INVISIBLE_REST_PATTERN, '$1z');

  // abcjs treats blank lines as the end of a tune.
  // Converting blank lines in between to comment lines (%) allows abcjs to continue
  // parsing across empty lines without terminating the tune.
  const parts = sanitized.split(/(\r?\n)/);
  const insertedIndices: number[] = [];
  let currentOffset = 0;

  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const isTrailingEmpty = i === parts.length - 1 && line === '';
    if (!isTrailingEmpty && /^\s*$/.test(line)) {
      if (line.length > 0) {
        // Line already contains whitespace: replace the first character with '%' to preserve length
        parts[i] = '%' + line.slice(1);
      } else {
        // Completely empty line (0 characters): insert '%'
        parts[i] = '%';
        insertedIndices.push(currentOffset);
      }
    }
    currentOffset += parts[i].length;
    if (i + 1 < parts.length) {
      currentOffset += parts[i + 1].length;
    }
  }

  const prepared = parts.join('');

  const toOriginalOffset = (offset: number): number => {
    if (insertedIndices.length === 0) return offset;
    let shift = 0;
    for (const idx of insertedIndices) {
      if (idx < offset) {
        shift++;
      } else {
        break;
      }
    }
    return Math.max(0, offset - shift);
  };

  return { prepared, toOriginalOffset };
}

export function prepareAbcForPlayback(abc: string): string {
  if (!abc) return '';
  return prepareAbcWithMap(abc).prepared;
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

/**
 * Produces ABC specifically prepared for visual SVG score engraving.
 *
 * 1. Expands multi-measure rests (Z<count> / X<count>) into individual bar-delimited
 *    rests (Z|Z|...) so that abcjs's layout engine maintains strict vertical alignment
 *    across polyphonic staves when systems wrap, and so that generated DOM classes
 *    (.abcjs-mm<index>) match canonical measure numbers.
 *
 * 2. Rewrites unrepresentable odd note durations (e.g. 10 sixteenths / 5 eighths)
 *    into tied glyphs (A8-A2) for clean rendering without warning artifacts.
 */
export function prepareAbcForEngraving(abc: string): string {
  const prepared = prepareAbcForPlayback(abc);
  const withExpandedRests = prepared.replace(
    /\b([ZX])(\d+)\b/g,
    (_, restChar, countStr) => {
      const count = Number(countStr);
      if (!Number.isSafeInteger(count) || count <= 1) return `${restChar}${countStr}`;
      return Array(count).fill(restChar).join('|');
    },
  );
  return withExpandedRests.replace(
    /([_^=]*[A-Ga-g][,']*)10(?=[^0-9]|$)/g,
    '$18-$12',
  );
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

  const { toOriginalOffset } = prepareAbcWithMap(originalAbc);
  for (const tune of tunes as TuneWithEngraver[]) {
    for (const selectable of tune.engraver?.selectables ?? []) {
      const char = selectable.absEl?.abcelem?.startChar;
      if (char === undefined) continue;
      const mappedChar = toOriginalOffset(char);
      if (!offsets.has(mappedChar) && !offsets.has(char)) continue;
      hideSvgNode(selectable.svgEl);
    }
  }
}

export interface InitAbcjsSynthOptions {
  visualObj: abcjs.TuneObject;
  audioContext?: AudioContext | null;
  soundFontVolumeMultiplier?: number;
  pan?: number[];
  soundFontUrl?: string;
}

/**
 * Initializes an abcjs CreateSynth instance with remote SoundFont, falling back
 * to the built-in synthesizer if network fetch fails.
 */
export async function initAbcjsSynth(
  createSynth: any,
  options: InitAbcjsSynthOptions,
): Promise<void> {
  const soundFontUrl = options.soundFontUrl ?? 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/';
  const soundFontVolumeMultiplier = options.soundFontVolumeMultiplier ?? 0.8;

  const baseOptions: Record<string, unknown> = {
    soundFontVolumeMultiplier,
  };
  if (options.pan) {
    baseOptions.pan = options.pan;
  }

  const primaryInitOptions: Record<string, unknown> = {
    visualObj: options.visualObj,
    options: {
      ...baseOptions,
      soundFontUrl,
    },
  };
  if (options.audioContext) {
    primaryInitOptions.audioContext = options.audioContext;
  }

  const fallbackInitOptions: Record<string, unknown> = {
    visualObj: options.visualObj,
    options: {
      ...baseOptions,
    },
  };
  if (options.audioContext) {
    fallbackInitOptions.audioContext = options.audioContext;
  }

  try {
    await createSynth.init(primaryInitOptions);
  } catch (sfErr) {
    console.warn('SoundFont remote init failed, using built-in synth:', sfErr);
    await createSynth.init(fallbackInitOptions);
  }
}

