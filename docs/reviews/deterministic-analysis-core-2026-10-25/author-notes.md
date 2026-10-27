# Author notes: held-out pilot passages

These six original four-measure passages were authored by GPT-6 Astra High for a small held-out pilot. The reference entries are **provisional authored expectations, not independently established ground truth**. A later reviewer should check the ABC parsing, sounding pitches, durations, and each asserted event before scoring system output.

## Shared notation and reference conventions

- Every passage has exactly four written measures, M:4/4 and L:1/4, with no repeat signs. Each explicit voice has four quarter-note beats per measure.
- The key is C major, and no accidental or transposing clef is used. ABC uppercase C is C4; lowercase c is C5; C, is C3; C,, is C2. Clefs only choose notation display.
- Measure numbers are one-based. Beat 1 is the first quarter-note beat; all cited beat positions are integers.
- SATB voice order is explicitly S, A, T, B. The keyboard and contrapuntal controls have only two explicit voices each.
- Finding from/to fields identify the earlier and later sonority for a transition. For a static finding, from equals to and marks its first cited onset; prose describes any continuing duration.
- Parallel fifths include compound fifths (positive interval modulo 12 equals 7); parallel octaves include octave-equivalent intervals (positive interval modulo 12 equals 0). Both parts must move in the same nonzero direction. These labels do not automatically include direct/hidden fifths or octaves.
- Simultaneous crossing means that a nominally higher part sounds strictly below a nominally lower part.
- Temporal overlap uses adjacent named voices: a new upper pitch lies below the prior lower pitch, or a new lower pitch lies above the prior upper pitch. Equal pitches do not meet this strict definition. An overlap may coincide with crossing; a system may suppress that duplicate if it explains its convention.
- Ordinary sustained notes remain sounding when another voice attacks. A tied continuation is not an attack. A rest breaks a continuous voice-leading comparison for the resting voice.
- Illustrative broad SATB ranges are S C4–G5, A G3–D5, T C3–G4, and B E2–C4. These are advisory assumptions, not universal vocal limits.
- The usual upper-voice spacing advice is at most an octave between S/A and A/T. A wider T/B gap is not by itself a violation of that rule.
- Pitch objects map a voice ID to one exact pitch for a static finding, or to its earlier and later pitches for a transition.

## Pilot coverage

| ID | Intended role |
| --- | --- |
| astra-01 | Clean SATB factual-check control, including held voices and oblique perfect-interval arrivals |
| astra-02 | One isolated compound parallel-fifth transition in outer voices |
| astra-03 | Two crossed sonorities plus temporal overlap, including a later overlap without a simultaneous crossing |
| astra-04 | Tied high note, sustained spacing/range advisory, lower-part parallel octaves, rest gap, and valid later parallel octaves |
| astra-05 | Chordal keyboard applicability control: RH chords must not silently become three independently encoded voices |
| astra-06 | Clean two-part factual-check control with contrary and oblique motion |

## Scope and caveats

The clean controls are clean for the specified pitch, interval, crossing, overlap, and applicable range/spacing checks. They are not claims of ideal historical chorale harmonization or strict species counterpoint. Passing these six short examples cannot establish general musical judgment, parser completeness, robustness to repeats, or correction quality.

A small author-side arithmetic sanity check of explicitly entered MIDI pitch sequences found the intended perfect-interval and overlap transitions for the SATB passages. This did not invoke the product implementation, did not parse the ABC, and is **not independent verification**. In particular, independent verification should confirm the treatment of held notes, ties, rests, chordal voices, and duplicate crossing/overlap reports.

Public titles, questions, and ABC contain no answer labels. Only the separate reference objects and this author note disclose expected observations.

