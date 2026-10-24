export interface AbcCompletion {
  label: string;
  insert: string;
  detail: string;
  aliases?: readonly string[];
}

export interface AbcCompletionResult {
  from: number;
  to: number;
  items: readonly AbcCompletion[];
}

const decorations: readonly AbcCompletion[] = [
  { label: 'fermata', insert: '!fermata!', detail: 'Hold the note' },
  { label: 'trill', insert: '!trill!', detail: 'Trill ornament' },
  { label: 'accent', insert: '!accent!', detail: 'Accented note' },
  { label: 'staccato', insert: '.', detail: 'Short articulation' },
  { label: 'tenuto', insert: '!tenuto!', detail: 'Sustain the full note' },
  { label: 'mordent', insert: '!mordent!', detail: 'Mordent ornament' },
  { label: 'turn', insert: '!turn!', detail: 'Turn ornament' },
  { label: 'piano', insert: '!p!', detail: 'Soft dynamic', aliases: ['p'] },
  { label: 'pianissimo', insert: '!pp!', detail: 'Very soft dynamic', aliases: ['pp'] },
  { label: 'mezzo piano', insert: '!mp!', detail: 'Moderately soft dynamic', aliases: ['mp'] },
  { label: 'mezzo forte', insert: '!mf!', detail: 'Moderately loud dynamic', aliases: ['mf'] },
  { label: 'forte', insert: '!f!', detail: 'Loud dynamic', aliases: ['f'] },
  { label: 'fortissimo', insert: '!ff!', detail: 'Very loud dynamic', aliases: ['ff'] },
  { label: 'crescendo', insert: '!<(!', detail: 'Begin getting louder' },
  { label: 'end crescendo', insert: '!<)!', detail: 'End crescendo' },
  { label: 'diminuendo', insert: '!>(!', detail: 'Begin getting softer' },
  { label: 'end diminuendo', insert: '!>)!', detail: 'End diminuendo' },
];

const symbols: readonly AbcCompletion[] = [
  { label: 'sharp', insert: '^', detail: 'Raise the following note a semitone' },
  { label: 'flat', insert: '_', detail: 'Lower the following note a semitone' },
  { label: 'natural', insert: '=', detail: 'Cancel the following accidental' },
  { label: 'rest', insert: 'z', detail: 'Rest for one default note length' },
  { label: 'triplet', insert: '(3', detail: 'Three notes in the time of two' },
  { label: 'key', insert: '[K:C]', detail: 'Inline key signature' },
  { label: 'meter', insert: '[M:4/4]', detail: 'Inline time signature' },
  { label: 'tempo', insert: '[Q:1/4=120]', detail: 'Inline tempo marking' },
];

/** Complete only the token at the caret; note letters, quoted chord names and
 * comments remain literal ABC. No parsing, network requests, or source mutation. */
export function getAbcCompletions(
  value: string,
  caret: number,
  voices: readonly string[] = [],
  explicit = false,
): AbcCompletionResult | null {
  const before = value.slice(0, caret);
  // Quoted chord names and annotations can contain arbitrary words and symbols.
  let quoted = false;
  for (let index = 0; index < before.length; index++) {
    if (before[index] === '\\') { index++; continue; }
    if (before[index] === '"') quoted = !quoted;
    if (before[index] === '%' && !quoted) return null;
  }
  if (quoted) return null;

  const inline = before.match(/\[(?:[KVMQL]:?)?[^[\]]*$/);
  const bang = before.match(/![^!\s]*$/);
  // A closing decoration delimiter is not the beginning of another decoration.
  const openBang = bang && (before.match(/!/g)?.length ?? 0) % 2 === 1 ? bang : null;
  const word = before.match(/[A-Za-z][A-Za-z-]*$/);
  let token = inline?.[0] ?? openBang?.[0] ?? word?.[0] ?? '';
  if (inline && !/^\[(?:[KVMQL](?::.*)?)?$/i.test(token)) return null;
  if (!explicit && !inline && !openBang && token.length < 2) return null;
  if (!token && !explicit) return null;
  if (!inline && !openBang && /^[A-Ga-gzZxX][0-9/]*$/.test(token)) {
    if (!explicit) return null;
    token = '';
  }
  // Do not open a menu immediately after a completed decoration/directive.
  if (!explicit && (before.endsWith('!') && !openBang || before.endsWith(']'))) return null;

  const directives: AbcCompletion[] = [
    ...['C', 'G', 'D', 'F', 'Bb', 'Am', 'Em', 'Dm'].map((key) => ({ label: `Key ${key}`, insert: `[K:${key}]`, detail: 'Inline key signature' })),
    ...voices.map((voice) => ({ label: `Voice ${voice}`, insert: `[V:${voice}]`, detail: 'Switch to a declared voice' })),
    ...['4/4', '3/4', '6/8', '2/4'].map((meter) => ({ label: `Meter ${meter}`, insert: `[M:${meter}]`, detail: 'Inline time signature' })),
    { label: 'Default length 1/8', insert: '[L:1/8]', detail: 'Default note length' },
    { label: 'Tempo 120', insert: '[Q:1/4=120]', detail: 'Inline tempo' },
  ];
  const catalog = inline ? directives : openBang ? decorations.filter((item) => item.insert.startsWith('!')) : [...decorations, ...symbols];
  const query = token.toLowerCase();
  const items = catalog.filter((item) => item.insert.toLowerCase().startsWith(query)
    || item.label.toLowerCase().startsWith(query)
    || item.aliases?.some((alias) => alias.startsWith(query))).slice(0, 8);
  if (!items.length) return null;
  const from = caret - token.length;
  const suffix = value.slice(caret);
  const remaining = openBang ? suffix.match(/^[^!\s|]*!?/)?.[0]
    : inline ? suffix.match(/^[^\]\s|]*\]?/)?.[0]
    : token ? suffix.match(/^[A-Za-z-]*/)?.[0] : '';
  const to = caret + (remaining?.length ?? 0);
  return { from, to, items };
}
