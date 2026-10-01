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
