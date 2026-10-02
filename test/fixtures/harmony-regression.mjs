/**
 * Comprehensive regression fixtures for harmony analysis and score boundaries.
 * Freezes the 14 reported failure cases with explicit expected pitches, durations,
 * measure positions, and harmonic interpretations.
 */

export const HARMONY_REGRESSION_FIXTURES = [
  {
    id: '01-single-measure',
    title: 'Single-measure excerpt produces non-empty evidence',
    abcSource: `X:1
T:Single Measure
M:4/4
L:1/4
K:C
[CEG]4 |
`,
    range: { startMeasure: 1, endMeasure: 1 },
    expectedPassageKey: 'C major',
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'E4', 'G4'],
        literalBass: 'C4',
        candidate: { localKey: 'C major', root: 'C', quality: 'major', inversion: 'root' },
      },
    ],
  },
  {
    id: '02-all-rest-passage',
    title: 'All-rest passage produces empty slices without error or crash',
    abcSource: `X:1
T:All Rest
M:4/4
L:1/4
K:C
z4 | z4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedPassageKey: 'C major',
    expectedSlices: [],
  },
  {
    id: '03-named-voices-parallel',
    title: 'Named voices analyzed simultaneously in parallel rather than sequentially',
    abcSource: `X:1
T:Chorale Voices
M:4/4
L:1/4
K:C
V:S clef=treble name="Soprano"
c4 | d4 |
V:B clef=bass name="Bass"
C4 | G,4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedPassageKey: 'C major',
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'C5'],
        literalBass: 'C4',
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['G3', 'D5'],
        literalBass: 'G3',
      },
    ],
  },
  {
    id: '04-key-change-before-passage',
    title: 'Excerpt inherits active key signature and sounding accidentals from prior measures',
    abcSource: `X:1
T:Modulation Prior
M:4/4
L:1/4
K:C
c4 | [K:G] d4 | f4 |]
`,
    range: { startMeasure: 3, endMeasure: 3 },
    expectedPassageKey: 'G major',
    expectedSlices: [
      {
        position: { measure: 3, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['F#5'],
        literalBass: 'F#5',
        candidate: { localKey: 'G major' },
      },
    ],
  },
  {
    id: '05-intra-passage-key-change',
    title: 'Key changes inside analyzed range update local keys and sounding accidentals',
    abcSource: `X:1
T:Intra-Passage Key Change
M:4/4
L:1/4
K:C
c4 | [K:G] f4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C5'],
        literalBass: 'C5',
        candidate: { localKey: 'C major' },
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['F#5'],
        literalBass: 'F#5',
        candidate: { localKey: 'G major' },
      },
    ],
  },
  {
    id: '06-polytonal-voice-scoping',
    title: 'Voice-specific key signatures remain isolated to the declaring voice',
    abcSource: `X:1
T:Polytonal
M:4/4
L:1/4
K:C
V:1
c4 | [K:G] f4 |
V:2 clef=bass
C4 | F4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'C5'],
        literalBass: 'C4',
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['F4', 'F#5'],
        literalBass: 'F4',
      },
    ],
  },
  {
    id: '07-unit-note-length-meter',
    title: 'Unit note length L: and meter changes scale durations accurately in quarter length',
    abcSource: `X:1
T:Unit Length
M:4/4
L:1/8
K:C
c8 | [L:1/4] [M:3/4] c3 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C5'],
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '3',
        soundingPitches: ['C5'],
      },
    ],
  },
  {
    id: '08-mid-piece-clef-without-phantom-measure',
    title: 'Mid-piece clef directive does not create phantom measures',
    abcSource: `X:1
T:Clef Integrity
M:4/4
L:1/4
K:C
V:1 clef=treble
c4 |
V:1 clef=bass
C4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C5'],
        literalBass: 'C5',
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4'],
        literalBass: 'C4',
      },
    ],
  },
  {
    id: '09-directive-like-comments-and-quotes',
    title: 'Comments and quoted text resembling directives are strictly ignored',
    abcSource: `X:1
T:Comments Not Directives
M:4/4
L:1/4
K:C
% [K:G] clef=bass
"K:G" c4 | d4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedPassageKey: 'C major',
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C5'],
        candidate: { localKey: 'C major' },
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['D5'],
        candidate: { localKey: 'C major' },
      },
    ],
  },
  {
    id: '10-split-repeat-bars',
    title: 'Split repeat bars preserve measure numbering and offsets',
    abcSource: `X:1
T:Split Repeat
M:4/4
L:1/4
K:C
c4 | d2 :|: d2 | e4 |
`,
    range: { startMeasure: 1, endMeasure: 3 },
    expectedSlices: [
      { position: { measure: 1, offsetQuarterLength: '0' }, durationQuarterLength: '4', soundingPitches: ['C5'] },
      { position: { measure: 2, offsetQuarterLength: '0' }, durationQuarterLength: '2', soundingPitches: ['D5'] },
      { position: { measure: 2, offsetQuarterLength: '2' }, durationQuarterLength: '2', soundingPitches: ['D5'] },
      { position: { measure: 3, offsetQuarterLength: '0' }, durationQuarterLength: '4', soundingPitches: ['E5'] },
    ],
  },
  {
    id: '11-pickups-and-missing-final-barlines',
    title: 'Pickup measure numbered as 0 and pieces without final barlines terminate cleanly',
    abcSource: `X:1
T:Pickup
M:4/4
L:1/4
K:C
c2 | e4 | g4
`,
    range: { startMeasure: 0, endMeasure: 2 },
    expectedSlices: [
      { position: { measure: 0, offsetQuarterLength: '0' }, durationQuarterLength: '2', soundingPitches: ['C5'] },
      { position: { measure: 1, offsetQuarterLength: '0' }, durationQuarterLength: '4', soundingPitches: ['E5'] },
      { position: { measure: 2, offsetQuarterLength: '0' }, durationQuarterLength: '4', soundingPitches: ['G5'] },
    ],
  },
  {
    id: '12-sustained-notes-across-measures',
    title: 'Sustained notes from prior measures remain sounding across measure boundaries',
    abcSource: `X:1
T:Sustained Across Bars
M:4/4
L:1/4
K:C
V:1
c4 | d4 |
V:2
C8 |
`,
    range: { startMeasure: 2, endMeasure: 2 },
    expectedSlices: [
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'D5'],
        literalBass: 'C4',
      },
    ],
  },
  {
    id: '13-ties-and-tuplets',
    title: 'Ties across barlines and tuplets calculate exact rational timing',
    abcSource: `X:1
T:Ties & Tuplets
M:4/4
L:1/4
K:C
[C-EG]4 | [CEG]4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'E4', 'G4'],
        literalBass: 'C4',
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['C4', 'E4', 'G4'],
        literalBass: 'C4',
      },
    ],
  },
  {
    id: '14-minor-and-modal-keys',
    title: 'Preserves explicit minor and modal keys without defaulting to major',
    abcSource: `X:1
T:Minor Mode
M:4/4
L:1/4
K:Dm
[DFA]4 | [A,^CE]4 |
`,
    range: { startMeasure: 1, endMeasure: 2 },
    expectedPassageKey: 'D minor',
    expectedSlices: [
      {
        position: { measure: 1, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['D4', 'F4', 'A4'],
        literalBass: 'D4',
        candidate: { localKey: 'D minor', root: 'D', quality: 'minor', romanNumeral: 'i' },
      },
      {
        position: { measure: 2, offsetQuarterLength: '0' },
        durationQuarterLength: '4',
        soundingPitches: ['A3', 'C#4', 'E4'],
        literalBass: 'A3',
        candidate: { localKey: 'D minor', root: 'A', quality: 'major', romanNumeral: 'V' },
      },
    ],
  },
];

// Additional literal regressions from the canonical timing/pitch review. These
// expectations are written explicitly, never regenerated from the implementation.
const slice = (measure, offset, duration, pitches, candidate) => ({
  position: { measure, offsetQuarterLength: offset }, durationQuarterLength: duration,
  soundingPitches: pitches, literalBass: pitches[0], ...(candidate ? { candidate } : {}),
});
const score = (body, { key = 'C', meter = '4/4', unit = '1/4' } = {}) =>
  `X:1\nM:${meter}\nL:${unit}\nK:${key}\n${body}`;
HARMONY_REGRESSION_FIXTURES.push(
  { id: '15-leading-repeat', title: 'A leading repeat does not consume measure 1',
    abcSource: score('|: C4 | D4 :|'), range: { startMeasure: 1, endMeasure: 2 },
    expectedSlices: [slice(1, '0', '4', ['C4']), slice(2, '0', '4', ['D4'])] },
  { id: '16-multirest', title: 'A four-measure rest leaves the next note at written measure 5',
    abcSource: score('Z4 | G4 |'), range: { startMeasure: 1, endMeasure: 5 },
    expectedSlices: [slice(5, '0', '4', ['G4'])] },
  { id: '17-line-independent-pickup', title: 'A pickup remains measure 0 across source systems',
    abcSource: score('C |\nD4 |\nE4 |'), range: { startMeasure: 0, endMeasure: 2 },
    expectedSlices: [slice(0, '0', '1', ['C4']), slice(1, '0', '4', ['D4']), slice(2, '0', '4', ['E4'])] },
  { id: '18-line-independent-split', title: 'Repeat fragments share a written measure across source lines',
    abcSource: score('C4 | D2 :|\nE2 | F4 |'), range: { startMeasure: 1, endMeasure: 3 },
    expectedSlices: [slice(1, '0', '4', ['C4']), slice(2, '0', '2', ['D4']), slice(2, '2', '2', ['E4']), slice(3, '0', '4', ['F4'])] },
  { id: '19-tied-accidental', title: 'A tied sharp survives a bar reset and ends before a fresh natural note',
    abcSource: score('^F4- | F4 | F4 |'), range: { startMeasure: 2, endMeasure: 3 },
    expectedSlices: [slice(2, '0', '4', ['F#4']), slice(3, '0', '4', ['F4'])] },
  { id: '20-accidental-octave', title: 'Accidentals do not leak to another octave',
    abcSource: score('^F2 f2 |'), range: { startMeasure: 1, endMeasure: 1 },
    expectedSlices: [slice(1, '0', '2', ['F#4']), slice(1, '2', '2', ['F5'])] },
  { id: '21-octave-clef', title: 'Octave-transposing clefs change sounding pitches and bass',
    abcSource: score('C4 |', { key: 'C clef=treble-8' }), range: { startMeasure: 1, endMeasure: 1 },
    expectedSlices: [slice(1, '0', '4', ['C3'])] },
  { id: '22-transposing-voice', title: 'Voice chromatic transposition changes sounding pitch and key context',
    abcSource: score('V:1 transpose=-2\nC4 |'), range: { startMeasure: 1, endMeasure: 1 }, expectedPassageKey: 'Bb major',
    expectedSlices: [slice(1, '0', '4', ['Bb3'], { localKey: 'Bb major' })] },
  { id: '23-carry-release', title: 'A carried note stops at its real release inside the selected measure',
    abcSource: score('V:S\nc4 | d4 |\nV:B\nC6 |'), range: { startMeasure: 2, endMeasure: 2 },
    expectedSlices: [slice(2, '0', '2', ['C4', 'D5']), slice(2, '2', '2', ['D5'])] },
  { id: '24-offset-carry-release', title: 'Carry-in includes the original nonzero onset',
    abcSource: score('V:S\nc4 | d4 |\nV:B\nz2 C4 |'), range: { startMeasure: 2, endMeasure: 2 },
    expectedSlices: [slice(2, '0', '2', ['C4', 'D5']), slice(2, '2', '2', ['D5'])] },
  { id: '25-three-four-carry', title: 'Sustained notes use actual 3/4 measure durations',
    abcSource: score('V:S\nc3 | d e f |\nV:B\nC6 |', { meter: '3/4' }), range: { startMeasure: 2, endMeasure: 2 },
    expectedSlices: [slice(2, '0', '1', ['C4', 'D5']), slice(2, '1', '1', ['C4', 'E5']), slice(2, '2', '1', ['C4', 'F5'])] },
  { id: '26-exact-tuplet', title: 'Real triplets have exact thirds and align subsequent beats',
    abcSource: score('(3CDE F2 G2 A2 |', { unit: '1/8' }), range: { startMeasure: 1, endMeasure: 1 },
    expectedSlices: [slice(1, '0', '1/3', ['C4']), slice(1, '1/3', '1/3', ['D4']), slice(1, '2/3', '1/3', ['E4']), slice(1, '1', '1', ['F4']), slice(1, '2', '1', ['G4']), slice(1, '3', '1', ['A4'])] },
  { id: '27-actual-modal-key', title: 'Dorian with clef parameters retains its modal key and natural pitches',
    abcSource: score('[FABc]4 |', { key: 'Ddor clef=treble' }), range: { startMeasure: 1, endMeasure: 1 }, expectedPassageKey: 'D dorian',
    expectedSlices: [slice(1, '0', '4', ['F4', 'A4', 'B4', 'C5'], { localKey: 'D dorian' })] },
  { id: '28-explicit-key-alteration', title: 'Explicit key-signature alterations affect pitches without inventing a functional key',
    abcSource: score('F4 |', { key: 'C ^F' }), range: { startMeasure: 1, endMeasure: 1 }, expectedPassageKey: null,
    expectedSlices: [slice(1, '0', '4', ['F#4'], { localKey: 'unknown', romanNumeral: 'unknown' })] },
  { id: '29-initial-voice-key', title: 'Initial staff keys are voice-local and conflicting contexts remain ambiguous',
    abcSource: score('V:S\n[K:G] F4 |\nV:B\nF4 |'), range: { startMeasure: 1, endMeasure: 1 }, expectedPassageKey: null,
    expectedSlices: [slice(1, '0', '4', ['F4', 'F#4'], { localKey: 'unknown', romanNumeral: 'unknown' })] },
  { id: '30-comment-within-range', title: 'Comments inside an analyzed range cannot swallow subsequent measures',
    abcSource: score('C4 | % ordinary comment\nF4 | F4 |'), range: { startMeasure: 1, endMeasure: 3 },
    expectedSlices: [slice(1, '0', '4', ['C4']), slice(2, '0', '4', ['F4']), slice(3, '0', '4', ['F4'])] },
  { id: '31-midbar-key', title: 'Mid-measure key changes preserve the measure and exact offset',
    abcSource: score('f2 [K:G] f2 | f4 |'), range: { startMeasure: 1, endMeasure: 2 }, expectedPassageKey: null,
    expectedSlices: [slice(1, '0', '2', ['F5'], { localKey: 'C major' }), slice(1, '2', '2', ['F#5'], { localKey: 'G major' }), slice(2, '0', '4', ['F#5'], { localKey: 'G major' })] },
  { id: '32-header-voice-declarations', title: 'Voice declarations before the global key do not lose accidentals',
    abcSource: 'X:1\nM:4/4\nL:1/4\nV:S\nV:B\nK:G\n[V:S] f4 | f4 |\n[V:B] F4 | F4 |',
    range: { startMeasure: 1, endMeasure: 2 }, expectedPassageKey: 'G major',
    expectedSlices: [slice(1, '0', '4', ['F#4', 'F#5']), slice(2, '0', '4', ['F#4', 'F#5'])] },
);
