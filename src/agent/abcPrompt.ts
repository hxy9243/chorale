export const ABC_SYNTAX_GUIDE = [
  '### ABC NOTATION GUIDE FOR MUSIC ANALYSIS',
  '- Pitch Octaves: C,,=C2, C,=C3, C=C4 (Middle C), c=C5, c\'=C6, c\'\'=C7. Uppercase C-B are Octave 4; lowercase c-b are Octave 5.',
  '- Accidentals: ^ = sharp (^F is F#), _ = flat (_B is Bb), = = natural (=F), ^^ = double sharp, __ = double flat. Accidental precedes pitch name.',
  '- Key Signature Inheritance (CRITICAL): Key signatures (e.g. K:G = 1 sharp: F#; K:Eb = 3 flats: Bb,Eb,Ab) apply automatically to EVERY un-accidentalized note across all measures. In K:G, note "F" is F#4, forming D-F#-A (D major / V), NOT D minor.',
  '- Measure Accidentals: An accidental persists for all subsequent notes of that pitch class in the same measure for that voice unless cancelled.',
  '- Note Durations: Default L:1/8 or L:1/4. Numbers multiply (c2 = 2x), slashes divide (c/2 = 1/2x), dots lengthen (c3/2 = 1.5x), (3cde = triplet.',
  '- Polyphonic Voices: Multi-voice scores use [V:voiceId] or V: headers. Simultaneous notes at the same measure offset across voices form vertical chords. [CEG] is a chord in a single voice.',
  '- Rests & Ties: z is a rest; - indicates a tie (e.g. c- | c).',
].join('\n');

export const MUSIC_THEORY_GUIDE = [
  '### MUSIC THEORY & ANALYSIS RULES',
  '- Vertical Alignment: Align notes across all [V:voiceId] lines at identical beat offsets to determine harmonic verticalities.',
  '- Bass Note & Inversions: Identify the lowest sounding voice as the bass. Triad inversions: root (5/3, e.g. I, IV, V), 1st inv (6/3, e.g. I6, ii6, V6), 2nd inv (6/4, e.g. Cadential I6/4 resolving to V, Passing 6/4). 7th chords: root (7, e.g. V7), 1st inv (6/5, e.g. V6/5), 2nd inv (4/3, e.g. V4/3), 3rd inv (4/2, e.g. V4/2 resolving to I6).',
  '- Non-Chord Tones (NCTs): Filter out suspensions (4-3, 7-6, 9-8: prepared on beat, dissonant, resolves down by step), passing tones (stepwise motion between chord tones), neighbor tones, appoggiaturas, and anticipations before naming harmonies.',
  '- Minor Key Harmony: In minor keys, dominant harmonies (V, V7) and leading-tone chords (vii°) feature the raised 7th scale degree (harmonic minor).',
  '- Cadences: PAC (V(7)->I, root position, soprano on 1), IAC (inverted or non-tonic in soprano, or vii°->I), HC (phrase ends on V), Phrygian HC (in minor: iv6->V with bass descending 6->5), Deceptive (V(7)->vi/VI), Plagal (IV->I).',
  '- Tonicization vs Modulation: A secondary dominant (e.g. V7/V, V/vi) that resolves and immediately returns to the home key is a tonicization. A true modulation establishes a new tonal center via a pivot chord (e.g. C: vi = G: ii) and confirms it with a cadence (e.g. PAC in G).',
  '- Chromatic Chords: Neapolitan 6th (N6/bII6: major triad on lowered 2 in 1st inv, resolving to V or I6/4->V), Augmented 6ths (It+6, Fr+6, Ger+6: b6 in bass and #4 in soprano resolving outward to 5).',
  '- Voice Leading: Check for parallel 5ths/8ves in similar motion between voices, voice crossing, and proper tendency-tone resolution (leading tone 7->1, chordal 7th 4->3).',
].join('\n');
