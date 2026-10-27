// BWV 269 (Riemenschneider 1), not BWV 371; 371 is the collection size.
// Independent note-level commentary cross-checked against Andrew Jones's analysis,
// proofread by Dmitri Tymoczko and Hamish Robb. Reduction alternatives are explicit.
// https://github.com/cuthbertLab/music21/blob/master/music21/corpus/bach/choraleAnalyses/riemenschneider001.rntxt
export const DEFAULT_SCORE_TITLE = "Aus meines Herzens Grunde, BWV 269";
export const DEFAULT_SCORE_COMPOSER = "J.S. Bach";
export const DEFAULT_SCORE_METER = "3/4";
export const DEFAULT_SCORE_KEY = "G";

export const DEFAULT_SCORE_ABC = "X:1\nT:Aus meines Herzens Grunde, BWV 269\nC:J.S. Bach\n%%score { ( 1 2 ) | ( 3 4 ) }\nL:1/4\nQ:1/4=70\nM:3/4\nI:linebreak $\nK:G\nV:1 treble nm=\"Piano\" snm=\"Pno.\"\nV:2 treble \nV:3 bass \nV:4 bass \nV:1\n G | G2 d | B3/2 A/ G | G3/2 A/ B | %4\n !fermata!A2 B | d2 c | B A2 | !fermata!G2 :|$ %8\n B | (B c) d | d3/2 c/ B | !fermata!A2 G | %12\n B2 c | d2 c | !fermata!B3 |$ !fermata!G2 B | %16\n d2 c | B2 A | G3/2 A/ B | A2 B | %20\n d2 c | B A2 | !fermata!G2 |]\nV:2\n D | E D D | D2 B, | E/D/ E/F/ G | %4\n F2 G | D E F | G2 F | D2 :|$ %8\n G- | G/F/ E/F/ G- | G/A/ G/F/ G | F2 E | %12\n E F/G/ A | A G3/2 F/ | G2 =F |$ E2 G | %16\n A3/2 G/ F | G2 F- | F/E/ E/F/ G | F2 G | %20\n A2 G/F/ | G2 F | D2 |]\nV:3\n B, | B, C/B,/ A, | G, F, G, | C/B,/ C D | %4\n D2 D | A, B, C | D E D/C/ | B,2 :|$ %8\n D | D C B,/A,/ | B,/C/ D D | D2 B, | %12\n G, B, E | D2 D | D3 |$ C2 D | %16\n D/C/ B, C | D2 D/C/ | G, C D | D2 D | %20\n D2 E | E2 D/C/ | B,2 |]\nV:4\n G,, | G, E, F, | G, D, E, | C, B,,/A,,/ G,, | %4\n !fermata!D,2 G,, | F,, G,, A,, | B,, C, D, | !fermata!G,,2 :|$ %8\n G,, | G,, A,, B,, | B,,3/2 A,,/ G,, | !fermata!D,2 E,- | %12\n E, D, C, | B,,3/2 C,/ D, | G,,/A,,/ B,, G,, |$ !fermata!C,2 G,, | %16\n F,, G,, A,, | B,, G,, D, | E,/D,/C,/B,,/A,,/G,,/ | !fermata!D,2 G,- | %20\n G, F, E,- | E,/D,/ C, D, | !fermata!G,,2 |]\n";

export const DEFAULT_SCORE_ANNOTATIONS = [
  {
    "id": "ann-807cc037",
    "span": {
      "startMeasure": 0,
      "endMeasure": 0
    },
    "label": "I — opening pickup",
    "body": "The opening pickup lasts one quarter note in 3/4 and contains G–B–D over bass G. Measure references in this analysis use Chorale's written indices: pickup 0, then measures 1–21. Roman numerals use G major throughout; local C-major function is explicitly identified in m. 14. Passing sonorities and incomplete or implied chords are distinguished in the individual notes.",
    "source": "assistant",
    "createdAt": "2026-10-27T06:45:06.008Z",
    "updatedAt": "2026-10-27T06:45:06.008Z",
    "kind": "chord",
    "position": {
      "measure": 0,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G",
    "romanNumeral": "I"
  },
  {
    "id": "ann-ce32d542",
    "span": {
      "startMeasure": 1,
      "endMeasure": 1
    },
    "label": "vi6 – IV6 – V6",
    "body": "Beat 1 literally contains G–B–E over G (Em/G, vi6); the Jones analysis in music21 instead prolongs the pickup tonic through this beat. At beat 2, C–E–G supports its IV6 reading, with alto D as an added non-chord tone. Tenor C moves to B at beat 2-and, producing the literal Em7 sonority E–G–B–D. These are alternative ways of reducing the moving inner voices, not interchangeable names for the same pitch collection. Beat 3 is D/F#, V6.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:44:55.305Z",
    "kind": "chord",
    "position": {
      "measure": 1,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Em/G – C/E – D/F#",
    "romanNumeral": "vi6 – IV6 – V6"
  },
  {
    "id": "ann-a832ce03",
    "span": {
      "startMeasure": 2,
      "endMeasure": 2
    },
    "label": "I – V – vi",
    "body": "Following the Jones/music21 harmonic reduction, beat 1 is G, beat 2 is dominant, and beat 3 is Em. The soprano B lasts into beat 2, where D–F#–B momentarily spells Bm/D (iii6); it descends to A at beat 2-and, completing D major. The main label treats this B–A motion as a 6–5 delay within the dominant rather than a separate structural iii chord.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.790Z",
    "kind": "chord",
    "position": {
      "measure": 2,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G – D – Em",
    "romanNumeral": "I – V – vi"
  },
  {
    "id": "ann-d7a8573e",
    "span": {
      "startMeasure": 3,
      "endMeasure": 3
    },
    "label": "IV – vii°6 – I",
    "body": "C major governs the opening. At beat 1-and, alto E–D–E and tenor C–B–C supply lower neighbors over C. At beat 2, the descending bass B gives the passing sonority Cmaj7/B (IVmaj4/2). At beat 2-and, A–C–F# is F#dim/A, vii°6, resolving to G at beat 3. This diminished triad may also imply D7/A with its root D omitted; D is not actually sounding in that slice.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.803Z",
    "kind": "chord",
    "position": {
      "measure": 3,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "C – F#dim/A – G",
    "romanNumeral": "IV – vii°6 – I"
  },
  {
    "id": "ann-1c28b747",
    "span": {
      "startMeasure": 4,
      "endMeasure": 4
    },
    "label": "V (HC) – I",
    "body": "Root-position D major, with A in the soprano, closes the phrase on a half cadence during beats 1–2. G major on beat 3 begins the next phrase.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.812Z",
    "kind": "chord",
    "position": {
      "measure": 4,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D – G",
    "romanNumeral": "V (HC) – I"
  },
  {
    "id": "ann-c0a3ba9d",
    "span": {
      "startMeasure": 5,
      "endMeasure": 5
    },
    "label": "V6 – vi6/5 – vii°6",
    "body": "Beat 1 is D/F#, V6. Beat 2 contains G–B–D–E: Em7/G, vi6/5, not a root-position vi triad. Beat 3 contains A–C–F# (C doubled): F#dim/A, vii°6. A dominant-seventh interpretation is V4/3 with root D omitted, not a complete D7/A chord. It resolves to G/B in m. 6.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.823Z",
    "kind": "chord",
    "position": {
      "measure": 5,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D/F# – Em7/G – F#dim/A",
    "romanNumeral": "V6 – vi6/5 – vii°6"
  },
  {
    "id": "ann-f293eda0",
    "span": {
      "startMeasure": 6,
      "endMeasure": 6
    },
    "label": "I6 – ii6/5 – V – V7",
    "body": "Beat 1 is G/B. Beat 2 has C–E–G–A: Am7/C, ii6/5. Beat 3 begins with D–F#–A (V); tenor D descends to C on beat 3-and to introduce the dominant seventh. The tenor moves D–E–D–C, not G–F#: there is no tenor 4–3 suspension. Alto G moves to F# exactly when the bass arrives on D, so there is no alto suspension here either.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.833Z",
    "kind": "chord",
    "position": {
      "measure": 6,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B – Am7/C – D – D7",
    "romanNumeral": "I6 – ii6/5 – V – V7"
  },
  {
    "id": "ann-7432e336",
    "span": {
      "startMeasure": 7,
      "endMeasure": 7
    },
    "label": "I (PAC); I pickup after repeat",
    "body": "The root-position D7 at the end of m. 6 resolves to G with soprano A–G and bass D–G: a perfect authentic cadence. The cadential bar lasts two quarter notes. After the repeat, a separate one-quarter-note pickup begins the second section on G major with soprano B and alto G tied into m. 8.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.842Z",
    "kind": "chord",
    "position": {
      "measure": 7,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G",
    "romanNumeral": "I (PAC); I pickup after repeat"
  },
  {
    "id": "ann-be172b51",
    "span": {
      "startMeasure": 8,
      "endMeasure": 8
    },
    "label": "I – ii – vii°6 – I6",
    "body": "Beat 1 is G; alto G–F#–E passes downward into beat 2. Beat 2 contains A–C–E with C doubled: Am (ii), not Am7, because G is absent. At beat 2-and, F# replaces E, producing F#dim/A (vii°6; alternatively rootless V4/3). Beat 3 is G/B. Tenor B–A–B across the barline gives a lower neighbor on beat 3-and.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.851Z",
    "kind": "chord",
    "position": {
      "measure": 8,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G – Am – F#dim/A – G/B",
    "romanNumeral": "I – ii – vii°6 – I6"
  },
  {
    "id": "ann-79441325",
    "span": {
      "startMeasure": 9,
      "endMeasure": 9
    },
    "label": "I6 – V4/3 – I",
    "body": "G/B governs beats 1–2. At beat 1-and the alto's G–A–G upper neighbor coincides with passing tenor C in B–C–D. Beat 2-and contains all four notes A–C–D–F#: complete D7/A, V4/3. Beat 3 resolves to G. Unlike the rootless dominant readings in mm. 5 and 15, D is actually present here.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.860Z",
    "kind": "chord",
    "position": {
      "measure": 9,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B – D7/A – G",
    "romanNumeral": "I6 – V4/3 – I"
  },
  {
    "id": "ann-96d8aaba",
    "span": {
      "startMeasure": 10,
      "endMeasure": 10
    },
    "label": "V (HC) – vi",
    "body": "D major on beats 1–2 closes the phrase on a half cadence. Em on beat 3 starts the next phrase; its bass E is tied into m. 11. The phrase break makes a half cadence followed by a new beginning more informative than treating the whole bar simply as a deceptive cadence.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.870Z",
    "kind": "chord",
    "position": {
      "measure": 10,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D – Em",
    "romanNumeral": "V (HC) – vi"
  },
  {
    "id": "ann-12d4a8a7",
    "span": {
      "startMeasure": 11,
      "endMeasure": 11
    },
    "label": "vi – iii6 – ii6",
    "body": "Beat 1 is Em, beat 2 contains D–F#–B (Bm/D, iii6), and beat 3 is C–E–A (Am/C, ii6). At beat 2-and, alto F# rises to G, briefly producing G/D (I6/4) over the middle bass note of E–D–C. The Jones/music21 reference gives iii6 as the main reading and explicitly offers I6/4 as a variant. There is no chromatic secondary dominant or established E-minor modulation in this passage.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.880Z",
    "kind": "chord",
    "position": {
      "measure": 11,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Em – Bm/D – Am/C",
    "romanNumeral": "vi – iii6 – ii6"
  },
  {
    "id": "ann-10ab28ac",
    "span": {
      "startMeasure": 12,
      "endMeasure": 12
    },
    "label": "I6 – V7 (alto 4–3)",
    "body": "The Jones/music21 analysis treats beats 1–2 as G/B (I6) and beat 3 as V7. Alto A at beat 1 delays G until beat 2; the initial B–D–A can also be described literally as Bm7 without its fifth, but it need not receive a separate harmonic label. Bass C at beat 2-and is passing under G and D, not a complete C-major triad. Alto G is prepared over B on beat 2, retained over bass D at beat 3, and resolves to F# at beat 3-and: a genuine alto 4–3 suspension over D7. Soprano C supplies the seventh; the fifth A is omitted during beat 3.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.891Z",
    "kind": "chord",
    "position": {
      "measure": 12,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B – D7",
    "romanNumeral": "I6 – V7"
  },
  {
    "id": "ann-27f3080b",
    "span": {
      "startMeasure": 13,
      "endMeasure": 13
    },
    "label": "I – I6 – V7/IV",
    "body": "Beat 1 is G, with passing bass A at beat 1-and leading to G/B on beat 2. At beat 3, alto F-natural combines with G–B–D to form G7, V7/IV. Its seventh F resolves down to E in m. 14, while bass G moves to C. The tonic arrival after m. 12 has soprano B rather than G, so it is not a PAC in G.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.903Z",
    "kind": "chord",
    "position": {
      "measure": 13,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G – G/B – G7",
    "romanNumeral": "I – I6 – V7/IV"
  },
  {
    "id": "ann-3488ba8e",
    "span": {
      "startMeasure": 14,
      "endMeasure": 14
    },
    "label": "IV (local C: I) – I",
    "body": "G7 from m. 13 resolves to root-position C major on beats 1–2; alto F-natural resolves to E. This is IV in the home key, locally tonicized as C: I. The soprano arrives on G, the fifth of C, so the local authentic cadence is imperfect, not perfect. G major on beat 3 begins the next phrase. The short tonicization alone does not require a sustained modulation to C.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.915Z",
    "kind": "chord",
    "position": {
      "measure": 14,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "C – G",
    "romanNumeral": "IV (local C: I) – I"
  },
  {
    "id": "ann-6b05e1f3",
    "span": {
      "startMeasure": 15,
      "endMeasure": 15
    },
    "label": "V6 – V6/5 – I – vii°6",
    "body": "Beat 1 is D/F#; tenor C enters at beat 1-and, giving complete D7/F#, V6/5. Alto A is consonant in that dominant and remains sounding over the new bass G at beat 2, then resolves to G on beat 2-and while the bass stays G: a genuine alto 9–8 suspension over tonic. Beat 3 is A–C–F# with C doubled: F#dim/A (vii°6), alternatively V4/3 with root D omitted. Unlike m. 5, the middle harmony does not contain E and is not Em7/G.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.927Z",
    "kind": "chord",
    "position": {
      "measure": 15,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D/F# – D7/F# – G – F#dim/A",
    "romanNumeral": "V6 – V6/5 – I – vii°6"
  },
  {
    "id": "ann-eae421c8",
    "span": {
      "startMeasure": 16,
      "endMeasure": 16
    },
    "label": "I6 – I – V – V7",
    "body": "Beat 1 is G/B, beat 2 is root-position G, and beat 3 begins with D major. Tenor D–C on beat 3-and introduces D7. Alto F# is tied forward into m. 17.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.937Z",
    "kind": "chord",
    "position": {
      "measure": 16,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B – G – D – D7",
    "romanNumeral": "I6 – I – V – V7"
  },
  {
    "id": "ann-1728c645",
    "span": {
      "startMeasure": 17,
      "endMeasure": 17
    },
    "label": "Descending bass: vi area – IV – I",
    "body": "The bass descends E–D–C–B–A–G in eighth notes. Over the first E, upper voices contain G and a prepared alto F# tied from m. 16; an E-minor tonic substitute is implied, but B is absent and F# is a dissonance. Alto F# resolves down to E at beat 1-and while the bass moves to D; the literal sonority there is E–G–D, an incomplete Em7/D. Beat 2 is clear C major. At beat 2-and, F#–A–C sounds over passing bass B. Beat 3 has a G-major upper triad over passing bass A, with root-position G reached only at beat 3-and. The label summarizes the harmonic direction, not a sequence of complete root-position triads.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.948Z",
    "kind": "explanation"
  },
  {
    "id": "ann-3353c997",
    "span": {
      "startMeasure": 18,
      "endMeasure": 18
    },
    "label": "V (HC) – I",
    "body": "D major on beats 1–2 closes the phrase on a half cadence, marked by the bass fermata. Beat 3 is G major. Its bass G ties into m. 19, where it becomes a suspension beneath the new dominant upper voices.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.959Z",
    "kind": "chord",
    "position": {
      "measure": 18,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D – G",
    "romanNumeral": "V (HC) – I"
  },
  {
    "id": "ann-232800f1",
    "span": {
      "startMeasure": 19,
      "endMeasure": 19
    },
    "label": "V6 with bass suspension – IV6",
    "body": "At beat 1, upper voices D–A–D enter over bass G tied from the preceding tonic. Bass G resolves down to F# on beat 2, completing D/F# (V6). Against alto A this is a prepared 2–3 bass suspension, not a separate tonic chord on beat 1. Beat 3 is C/E (IV6). Alto G–F#–G across the next barline makes F# at beat 3-and a lower neighbor; bass E is tied into m. 20.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.970Z",
    "kind": "chord",
    "position": {
      "measure": 19,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D/F# (G–F# bass delay) – C/E",
    "romanNumeral": "V6 with bass suspension – IV6"
  },
  {
    "id": "ann-2c48e638",
    "span": {
      "startMeasure": 20,
      "endMeasure": 20
    },
    "label": "vi – vi4/2 – ii6/5 – V – V7",
    "body": "Beat 1 is E–G–B: Em (vi). Bass D at beat 1-and gives E–G–B–D, Em7/D (vi4/2). Beat 2 is C–E–G–A, Am7/C (ii6/5). Beat 3 begins with D major; tenor C enters at beat 3-and to form D7. Tenor E moves to D at the same instant as bass D arrives, then descends to C: no tenor 4–3 suspension occurs. Alto G likewise resolves to F# at the chord onset rather than being held over it. The Jones/music21 reference omits the brief Em7/D from its structural labels; vi4/2 here explicitly identifies that passing eighth-note sonority.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.981Z",
    "kind": "chord",
    "position": {
      "measure": 20,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Em – Em7/D – Am7/C – D – D7",
    "romanNumeral": "vi – vi4/2 – ii6/5 – V – V7"
  },
  {
    "id": "ann-be09e49d",
    "span": {
      "startMeasure": 21,
      "endMeasure": 21
    },
    "label": "I (PAC)",
    "body": "The final D7 from m. 20 resolves to root-position G. Soprano A–G, bass D–G, and tenor C–B support a perfect authentic cadence. This closing bar lasts two quarter notes, complementing the one-quarter-note opening pickup.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:05.992Z",
    "kind": "chord",
    "position": {
      "measure": 21,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G",
    "romanNumeral": "I (PAC)"
  },
  {
    "id": "ann-range-01",
    "span": {
      "startMeasure": 1,
      "endMeasure": 2
    },
    "label": "Opening harmony: reference and alternatives",
    "kind": "explanation",
    "body": "Cross-checked against Andrew Jones's BWV 269 analysis, proofread by Dmitri Tymoczko and Hamish Robb, in music21: https://github.com/cuthbertLab/music21/blob/master/music21/corpus/bach/choraleAnalyses/riemenschneider001.rntxt . That reference prolongs tonic through m. 1 beat 1 and gives IV6 at beat 2. Our note-level reading identifies the opening Em/G and the later Em7 slice explicitly. In m. 2, both use a broader dominant function for the B–A soprano delay. These are differences in harmonic reduction, not a single definitive labeling.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:06.008Z"
  },
  {
    "id": "ann-range-02",
    "span": {
      "startMeasure": 6,
      "endMeasure": 7
    },
    "label": "Cadence: I6 – ii6/5 – V – V7 – I",
    "kind": "voice-leading",
    "body": "In m. 6 the bass ascends B–C–D under G/B, Am7/C, and D major. Tenor C enters on beat 3-and to make D7, then resolves to B over tonic G in m. 7. Soprano A–G and root-position bass D–G establish a perfect authentic cadence. Neither tenor E nor alto G is held into the dominant onset, so there is no 4–3 suspension here.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:06.008Z"
  },
  {
    "id": "ann-range-03",
    "span": {
      "startMeasure": 11,
      "endMeasure": 12
    },
    "label": "Diatonic descent and alto suspension",
    "kind": "voice-leading",
    "body": "Measure 11 moves through Em, Bm/D, and Am/C; alto F#–G briefly gives G/D over the passing middle bass note. The reference explicitly allows both iii6 and I6/4 readings of that middle stage. In m. 12, I6 leads to V7 with a prepared alto G resolving to F# after the dominant bass arrives. The written passage contains no chromatic secondary dominant supporting the former E-minor modulation claim.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-10-27T06:45:06.008Z"
  }
];
