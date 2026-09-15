# ABC Syntax, Engraving Rules & Ergonomics Guide

This guide establishes the mandatory syntax, engraving standards, vocal/instrumental ranges, and keyboard ergonomics when generating or editing ABC notation in Chorale.

---

## 1. ABC Notation Fundamentals

### A. Pitch and Octave Encoding
ABC maps scientific pitch notation relative to Middle C (C4):

| Octave Name | Pitch Range | ABC Syntax | Staff Representation |
| --- | --- | --- | --- |
| Deep Bass (Octave 2) | C2 – B2 | `C,,` – `B,,` | Far below Bass Clef |
| Bass (Octave 3) | C3 – B3 | `C,` – `B,` | Bass Clef |
| Middle (Octave 4) | C4 – B4 | `C` – `B` | Middle C on ledger; Treble Clef bottom |
| Treble (Octave 5) | c5 – b5 | `c` – `b` | Treble Clef upper |
| High Treble (Octave 6)| c6 – b6 | `c'` – `b'` | Above Treble Clef staff |
| Extreme (Octave 7) | c7 – b7 | `c''` – `b''` | Far above Treble Clef |

- **Middle C is `C`** (uppercase without commas or apostrophes).
- **C5 is `c`** (lowercase without commas or apostrophes).

### B. Accidentals & Key Signature Inheritance
- `^` = sharp (`^F` = F#)
- `_` = flat (`_B` = Bb)
- `=` = natural (`=F` = F natural)
- `^^` = double sharp, `__` = double flat
- **Key Signature Inheritance (CRITICAL)**:
  Key signatures (e.g., `K:G` = F#; `K:Eb` = Bb, Eb, Ab; `K:A` = F#, C#, G#) automatically apply to **every un-accidentalized note across all measures**.
  - In `K:G`, the written letter `F` renders and plays as **F#4**.
  - To specify F-natural in `K:G`, write `=F`.
  - **Never add redundant accidentals** to diatonic notes already governed by the key signature (e.g. do not write `^F` in `K:G` unless cancelling a prior natural in the same measure).
- **Measure Bar Scope**: An accidental applies to all subsequent occurrences of that pitch class within the same voice for that measure. The bar line `|` cancels all measure accidentals.

### C. Durations and Meter
- `L:1/8` sets the default unit note length to an eighth note.
- In `L:1/8`: `c` = eighth note, `c2` = quarter note, `c4` = half note, `c8` = whole note, `c/` or `c/2` = sixteenth note, `c3` = dotted quarter note.
- Triplets: `(3cde` renders three notes in the time of two.

### D. Tune Headers & Composer Attribution
- Standard tune header order: `X:1`, `T:<Title>`, `C:<Composer>`, `M:<Meter>`, `L:<Unit Note Length>`, `Q:<Tempo>`, `K:<Key>`.
- **Composer Attribution Invariant**: Always set the composer field `C:` (and the `create_new_file` `composer` parameter) to the **name of the current AI model + reasoning effort level** (e.g. `C:Gemini 3.8 Flash Medium`, `C:GPT-5.6 Sol High`). If emulating a historical style, keep the model name + effort in `C:` and place the style in the title or subtitle (e.g. `T:Sonata in G Major\nT:In the style of W.A. Mozart`).

---

## 2. Rhythmic Beaming & Phrasing Standards

### A. The Golden Beaming Rule: Spaces Control Beams
In ABC, **white space indicates beam breaks**. Notes connected without spaces are beamed together under a shared horizontal beam.

- **Incorrect** (unbeamed clutter):
  `c d e f g f e d` $\rightarrow$ renders 8 separate eighth notes with individual flags.
- **Correct** (properly beamed by metric beats):
  `cdef gfed` $\rightarrow$ renders two clean beams of 4 eighth notes each.

### B. Metric Beaming Rules
1. **Simple Quadruple (4/4 Meter)**:
   - Eighth notes: Beam in groups of 4 (`cdef gfed`) or groups of 2 (`cd ef gf ed`).
   - Sixteenth notes: Always beam in groups of 4 per quarter-note beat (`cdef edcB cdef g4`).
   - **The Golden Rule of Beat 3**: **NEVER beam across the middle of the measure** (between beats 2 and 3). The boundary between beat 2 and beat 3 must always be visible with a beam break:
     - Correct: `cdef gfed` or `cd ef gf ed`
     - Forbidden: `cdefgf ed` (crossing beat 3)
2. **Simple Triple (3/4 Meter)**:
   - Beam eighth notes by beat in pairs of 2: `cd ef ga`.
   - Never beam 6 eighth notes in two groups of 3 (`cde fga`) in 3/4 time, as this visually turns 3/4 into 6/8 (hemiola confusion).
3. **Compound Duple / Triple (6/8, 9/8, 12/8 Meter)**:
   - Pulse is the dotted quarter note.
   - Always beam in groups of 3 eighth notes:
     - 6/8: `cde fga` (two beamed groups of three).
     - 9/8: `cde fga bag` (three beamed groups of three).

### C. Phrasing, Ties, and Slurs
- **Ties** (same pitch sustained across beat or bar): `c2- | c2` or `[CEG]- | [CEG]`.
- **Slurs** (legato phrasing across different pitches): `(c d e f)` or `(3(cde)`.
- Put phrasing slurs around natural melodic motifs and breath groups (2 to 4 bars).

---

## 3. Instrument & Vocal Tessituras (Range Limits)

Never write pitches outside an instrument's physical capacity or a singer's comfortable range.

### A. SATB Vocal Ranges (Chorale & Choral Music)

| Voice Part | Standard Range | Safe Tessitura | Clef |
| --- | --- | --- | --- |
| **Soprano (S)** | C4 – A5 (`C` to `a`) | D4 – G5 (`D` to `g`) | `clef=treble` |
| **Alto (A)** | G3 – D5 (`G,` to `d`) | A3 – C5 (`A,` to `c`) | `clef=treble` |
| **Tenor (T)** | C3 – G4 (`C,` to `G`) | D3 – F4 (`D,` to `F`) | `clef=treble-8` or `clef=treble` |
| **Bass (B)** | E2 – D4 (`E,,` to `D`) | F2 – C4 (`F,,` to `C`) | `clef=bass` |

*Vocal Writing Invariants*:
- Avoid holding tenors above F4 or sopranos above G5 for extended passages.
- Avoid writing basses below F2 unless aiming for low sacred resonance.

### B. Standard Orchestral & Keyboard Instruments

- **Piano**: A0 – C8 (`A,,,` to `c''''`). Full 88 keys.
- **Violin**: G3 – E7 (`G,` to `e'''`). Lowest note is open G string (`G,`).
- **Viola**: C3 – E6 (`C,` to `e''`). Lowest note is open C string (`C,`). Clef: alto or treble.
- **Cello**: C2 – G4/C5 (`C,,` to `G` or `c`). Clef: bass, tenor.
- **Flute**: C4 – D7 (`C` to `d'''`). Clef: treble.
- **Oboe**: Bb3 – G6 (`_B,` to `g''`). Clef: treble.
- **Clarinet in Bb**: D3 – A6 written (`D,` to `a''`). Clef: treble.
- **Bassoon**: Bb1 – Eb4 (`_B,,,` to `_E`). Clef: bass.

---

## 4. Piano Work & Keyboard Ergonomics

When writing keyboard music (piano, organ, harpsichord), strict physical constraints must be observed:

### A. Single-Hand Stretch Constraints
- **Maximum Reachable Interval**: An adult hand can comfortably reach an **octave (8ve)** or a **major 9th**.
- **Forbidden Stretches**: Never write simultaneous solid (block) chord intervals of a **10th, 11th, or 12th** in a single hand unless explicitly notated as an arpeggiated chord (`!arpeggio![C,G,E]` or broken roll).
- **Chord Density**: Do not exceed 4 to 5 notes in a single hand chord.

### B. Grand Staff Distribution & Voice Layout
- Distribute piano music across two distinct voices:
  ```abc
  V:1 clef=treble name="Right Hand"
  V:2 clef=bass   name="Left Hand"
  ```
- **Avoid Hand Collisions & Voice Crossing**:
  - Keep LH notes strictly in the lower register and RH in the upper register.
  - Do not have the Left Hand cross above the Right Hand unless an explicit crossing technique is intended.
- **Low-Register Spacing (Bass Muddiness Invariant)**:
  - In the deep bass register (below C3 / `C,`), **never write close intervals (thirds or seconds)**. A chord like `[E,,G,,B,,]` sounds like muddy rumble on an acoustic piano.
  - In low registers, write **open fifths, octaves, or single bass roots** (e.g. `[C,,C,]` or `C,,2 G,,2`).
  - Reserve close-spaced thirds, sixths, and triads for the octave above Middle C (C4 to C6).

---

## 5. Multi-Voice Formatting Checklist

When writing multi-part scores in ABC:
1. Declare each voice in the header:
   ```abc
   V:1 clef=treble name="Soprano"
   V:2 clef=treble name="Alto"
   V:3 clef=bass   name="Tenor"
   V:4 clef=bass   name="Bass"
   ```
2. Align measure barlines across all voices:
   ```abc
   [V:1] c4 d4 | e4 d4 | c8 |]
   [V:2] G4 F4 | G4 F4 | E8 |]
   [V:3] E4 D4 | C4 B,4 | C8 |]
   [V:4] C,4 B,,4 | C,4 G,,4 | C,8 |]
   ```
3. Always verify that each voice has the exact same number of beats in each measure matching the meter `M:`.
