import type { Annotation } from "../types/document";

export const DEFAULT_SCORE_TITLE = "J.S. Bach BWV 371";
export const DEFAULT_SCORE_COMPOSER = "J.S. Bach";
export const DEFAULT_SCORE_METER = "3/4";
export const DEFAULT_SCORE_KEY = "G";

export const DEFAULT_SCORE_ABC = "X:1\nT:J.S. Bach BWV 371\nC:J.S. Bach\n%%score { ( 1 2 ) | ( 3 4 ) }\nL:1/4\nQ:1/4=70\nM:3/4\nI:linebreak $\nK:G\nV:1 treble nm=\"Piano\" snm=\"Pno.\"\nV:2 treble \nV:3 bass \nV:4 bass \nV:1\n G | G2 d | B3/2 A/ G | G3/2 A/ B | %4\n !fermata!A2 B | d2 c | B A2 | !fermata!G2 :|$ %8\n B | (B c) d | d3/2 c/ B | !fermata!A2 G | %12\n B2 c | d2 c | !fermata!B3 |$ !fermata!G2 B | %16\n d2 c | B2 A | G3/2 A/ B | A2 B | %20\n d2 c | B A2 | !fermata!G2 |]\nV:2\n D | E D D | D2 B, | E/D/ E/F/ G | %4\n F2 G | D E F | G2 F | D2 :|$ %8\n G- | G/F/ E/F/ G- | G/A/ G/F/ G | F2 E | %12\n E F/G/ A | A G3/2 F/ | G2 =F |$ E2 G | %16\n A3/2 G/ F | G2 F- | F/E/ E/F/ G | F2 G | %20\n A2 G/F/ | G2 F | D2 |]\nV:3\n B, | B, C/B,/ A, | G, F, G, | C/B,/ C D | %4\n D2 D | A, B, C | D E D/C/ | B,2 :|$ %8\n D | D C B,/A,/ | B,/C/ D D | D2 B, | %12\n G, B, E | D2 D | D3 |$ C2 D | %16\n D/C/ B, C | D2 D/C/ | G, C D | D2 D | %20\n D2 E | E2 D/C/ | B,2 |]\nV:4\n G,, | G, E, F, | G, D, E, | C, B,,/A,,/ G,, | %4\n !fermata!D,2 G,, | F,, G,, A,, | B,, C, D, | !fermata!G,,2 :|$ %8\n G,, | G,, A,, B,, | B,,3/2 A,,/ G,, | !fermata!D,2 E,- | %12\n E, D, C, | B,,3/2 C,/ D, | G,,/A,,/ B,, G,, |$ !fermata!C,2 G,, | %16\n F,, G,, A,, | B,, G,, D, | E,/D,/C,/B,,/A,,/G,,/ | !fermata!D,2 G,- | %20\n G, F, E,- | E,/D,/ C, D, | !fermata!G,,2 |]\n";

export const DEFAULT_SCORE_ANNOTATIONS: readonly Annotation[] = [
  {
    "id": "ann-ce32d542",
    "span": {
      "startMeasure": 1,
      "endMeasure": 1
    },
    "label": "vi - V6",
    "body": "Begins after the G (I) pickup. Tonic prolongation moves through vi (Em/G) with passing eighths in tenor to first-inversion dominant V6 (D/F#).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 1,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Em - D/F#",
    "romanNumeral": "vi - V6"
  },
  {
    "id": "ann-a832ce03",
    "span": {
      "startMeasure": 2,
      "endMeasure": 2
    },
    "label": "I - vi",
    "body": "Root position tonic I (G) steps down via passing dominant bass to submediant vi (Em).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 2,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G - Em",
    "romanNumeral": "I - vi"
  },
  {
    "id": "ann-d7a8573e",
    "span": {
      "startMeasure": 3,
      "endMeasure": 3
    },
    "label": "IV - I",
    "body": "Subdominant IV (C major) expands with stepwise moving eighths in alto and bass, resolving to I (G).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 3,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "C - G",
    "romanNumeral": "IV - I"
  },
  {
    "id": "ann-1c28b747",
    "span": {
      "startMeasure": 4,
      "endMeasure": 4
    },
    "label": "V - I",
    "body": "Half cadence (HC) on dominant V (D major) with fermata; beat 3 provides a tonic G (I) pickup to m. 5.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 4,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D - G",
    "romanNumeral": "V - I"
  },
  {
    "id": "ann-c0a3ba9d",
    "span": {
      "startMeasure": 5,
      "endMeasure": 5
    },
    "label": "V6 - V4/3",
    "body": "Ascending parallel stepwise motion in bass (F#-G-A) driving from V6 through vi to second-inversion dominant seventh V4/3 (D7/A).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 5,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D/F# - D7/A",
    "romanNumeral": "V6 - V4/3"
  },
  {
    "id": "ann-f293eda0",
    "span": {
      "startMeasure": 6,
      "endMeasure": 6
    },
    "label": "I6 - ii7 - V7",
    "body": "First-inversion tonic I6 (G/B) proceeds through pre-dominant ii7 (Am7) to cadential dominant V7 (D7) with a tenor 4-3 suspension.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 6,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B - Am7 - D7",
    "romanNumeral": "I6 - ii7 - V7"
  },
  {
    "id": "ann-7432e336",
    "span": {
      "startMeasure": 7,
      "endMeasure": 7
    },
    "label": "I (PAC)",
    "body": "Perfect Authentic Cadence (PAC) in G major (I) with fermata closing the Stollen (repeated section).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 7,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G",
    "romanNumeral": "I"
  },
  {
    "id": "ann-2d078622",
    "span": {
      "startMeasure": 8,
      "endMeasure": 8
    },
    "label": "I",
    "body": "Tonic G major harmony (I) on beat 3 introducing the second section (Abgesang).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 8,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G",
    "romanNumeral": "I"
  },
  {
    "id": "ann-be172b51",
    "span": {
      "startMeasure": 9,
      "endMeasure": 9
    },
    "label": "I - ii7 - I6",
    "body": "Stepwise scalar ascent in soprano (B-C-D) and bass (G-A-B) expanding tonic harmony from I through passing ii7 to I6.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 9,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G - Am7 - G/B",
    "romanNumeral": "I - ii7 - I6"
  },
  {
    "id": "ann-79441325",
    "span": {
      "startMeasure": 10,
      "endMeasure": 10
    },
    "label": "I6 - I",
    "body": "Tonic prolongation over stepwise descending bass (B-A-G) settling onto root position I (G).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 10,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B - G",
    "romanNumeral": "I6 - I"
  },
  {
    "id": "ann-96d8aaba",
    "span": {
      "startMeasure": 11,
      "endMeasure": 11
    },
    "label": "V - vi",
    "body": "Phrase ends on dominant V (D major) with fermata (HC); beat 3 initiates the next phrase with submediant vi (Em).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 11,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D - Em",
    "romanNumeral": "V - vi"
  },
  {
    "id": "ann-12d4a8a7",
    "span": {
      "startMeasure": 12,
      "endMeasure": 12
    },
    "label": "vi - ii",
    "body": "Stepwise bass descent (E-D-C) moving from vi (Em) through passing motion to pre-dominant ii (Am).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 12,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Em - Am",
    "romanNumeral": "vi - ii"
  },
  {
    "id": "ann-10ab28ac",
    "span": {
      "startMeasure": 13,
      "endMeasure": 13
    },
    "label": "iii7 - V7",
    "body": "Harmonic motion through iii7 (Bm7) and IV (C) arriving on dominant seventh V7 (D7).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 13,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Bm7 - D7",
    "romanNumeral": "iii7 - V7"
  },
  {
    "id": "ann-27f3080b",
    "span": {
      "startMeasure": 14,
      "endMeasure": 14
    },
    "label": "I - V7/IV",
    "body": "Tonic I (G major) introduces chromatic inflection F natural (=F) in alto on beat 3, creating secondary dominant V7/IV (G7) to tonicize C major.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 14,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G - G7",
    "romanNumeral": "I - V7/IV"
  },
  {
    "id": "ann-3488ba8e",
    "span": {
      "startMeasure": 15,
      "endMeasure": 15
    },
    "label": "IV - I",
    "body": "Resolution of secondary dominant V7/IV to subdominant IV (C major) with fermata; beat 3 provides tonic G (I) pickup.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 15,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "C - G",
    "romanNumeral": "IV - I"
  },
  {
    "id": "ann-6b05e1f3",
    "span": {
      "startMeasure": 16,
      "endMeasure": 16
    },
    "label": "V6 - V4/3",
    "body": "Parallel motivic return of m. 5: ascending bass F#-G-A supporting V6 moving through I to V4/3 (D7/A).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 16,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D/F# - D7/A",
    "romanNumeral": "V6 - V4/3"
  },
  {
    "id": "ann-eae421c8",
    "span": {
      "startMeasure": 17,
      "endMeasure": 17
    },
    "label": "I6 - V",
    "body": "First-inversion tonic I6 (G/B) leads into root position dominant V (D major).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 17,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G/B - D",
    "romanNumeral": "I6 - V"
  },
  {
    "id": "ann-1728c645",
    "span": {
      "startMeasure": 18,
      "endMeasure": 18
    },
    "label": "vi - IV - I",
    "body": "Virtuosic scalar bass descent (E-D-C-B-A-G in eighth notes) traversing vi (Em), IV (C), and resolving to I (G).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 18,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Em - C - G",
    "romanNumeral": "vi - IV - I"
  },
  {
    "id": "ann-3353c997",
    "span": {
      "startMeasure": 19,
      "endMeasure": 19
    },
    "label": "V - I",
    "body": "Penultimate phrase boundary half cadence on dominant V (D major) with fermata; beat 3 gives tonic G (I) pickup.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 19,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D - G",
    "romanNumeral": "V - I"
  },
  {
    "id": "ann-232800f1",
    "span": {
      "startMeasure": 20,
      "endMeasure": 20
    },
    "label": "V6 - IV6",
    "body": "Descending bass line (G-F#-E) moving through first-inversion dominant V6 (D/F#) to first-inversion subdominant IV6 (C/E).",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 20,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "D/F# - C/E",
    "romanNumeral": "V6 - IV6"
  },
  {
    "id": "ann-2c48e638",
    "span": {
      "startMeasure": 21,
      "endMeasure": 21
    },
    "label": "ii7 - V7",
    "body": "Pre-dominant ii7 (Am7) leads to dominant seventh V7 (D7) with an expressive 4-3 suspension in the tenor voice.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 21,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "Am7 - D7",
    "romanNumeral": "ii7 - V7"
  },
  {
    "id": "ann-be09e49d",
    "span": {
      "startMeasure": 22,
      "endMeasure": 22
    },
    "label": "I (PAC)",
    "body": "Final Perfect Authentic Cadence (PAC) in G major (I) bringing the chorale to a complete, stable resolution.",
    "source": "assistant",
    "createdAt": "2026-09-19T22:12:53.428Z",
    "updatedAt": "2026-09-19T22:12:53.428Z",
    "kind": "chord",
    "position": {
      "measure": 22,
      "offset": {
        "numerator": 0,
        "denominator": 1
      }
    },
    "chordSymbol": "G",
    "romanNumeral": "I"
  }
] as const;
