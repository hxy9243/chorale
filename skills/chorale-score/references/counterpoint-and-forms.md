# Counterpoint, Voice Leading, Chorale & Fugue Guide

This reference provides the rigorous contrapuntal rules, voice-leading invariants, harmonic principles, and formal structures for composing and analyzing 4-part chorales, fugues, and polyphonic works in Chorale.

---

## 1. The Core Invariants of 4-Part Counterpoint (SATB)

Chorale writing (in the tradition of J.S. Bach) requires four independent, melodically coherent voices: Soprano (S), Alto (A), Tenor (T), and Bass (B).

### A. Forbidden Parallels (Zero-Tolerance Rules)
1. **Parallel Perfect Fifths (P5 $\rightarrow$ P5)**: Two voices must never move in the same direction from one perfect fifth to another.
   - *Example violation*: Soprano moving `d $\rightarrow$ c` while Bass moves `G, $\rightarrow$ F,` (both are P5).
2. **Parallel Perfect Octaves (P8 $\rightarrow$ P8) & Unisons**: Two voices must never move in the same direction from one octave/unison to another.
   - *Example violation*: Alto moving `c $\rightarrow$ d` while Bass moves `C, $\rightarrow$ D,`.
3. **Consecutive Fifths/Octaves by Contrary Motion**: Moving from one fifth or octave to another in contrary motion is equally prohibited.
4. **Direct (Hidden) Fifths & Octaves**:
   - Occurs when the outer voices (Soprano and Bass) move in similar motion into a perfect fifth or octave, and the Soprano leaps.
   - *Acceptable exception*: Allowed only if the Soprano moves by step into the interval.

### B. Voice Spacing & Crossing Invariants
- **Upper Voice Distance**:
  - Distance between **Soprano and Alto** must never exceed **one octave (8ve)**.
  - Distance between **Alto and Tenor** must never exceed **one octave (8ve)**.
- **Bass Separation**:
  - The distance between **Tenor and Bass** may freely expand up to an octave and a fifth (12th) or two octaves, provided the harmonic foundation is solid.
- **Voice Crossing**:
  - Do NOT cross voices: Soprano must remain higher than Alto; Alto must remain higher than Tenor; Tenor must remain higher than Bass.
- **Voice Overlap**:
  - A lower voice should not move to a pitch higher than the preceding pitch of the voice immediately above it, and vice versa.

### C. Doubling Rules in Triads and Seventh Chords
- **Root Position Major & Minor Triads**:
  - Always double the **Root** (scale degree 1 in I, 4 in IV, 5 in V).
  - Never double the **leading tone** (scale degree 7) or any altered chromatic tendency tone.
  - Fifth may occasionally be omitted to yield a tripled root and single third.
- **First Inversion Triads (6/3 Chords)**:
  - Usually double the soprano note or the tonal degrees (1, 4, or 5).
  - In `ii°6` (diminished), always double the **third** (the bass note, scale degree 4), never the root (scale degree 2) or fifth.
- **Second Inversion Triads (6/4 Chords)**:
  - Always double the **Bass note** (the fifth of the chord).
- **Dominant Seventh Chords (V7)**:
  - Complete: Root, 3rd, 5th, 7th.
  - Incomplete: Double the root, include the 3rd and 7th, omit the 5th.

### D. Tendency Tone Resolutions
- **Leading Tone ($\hat{7}$)**:
  - In outer voices (Soprano or Bass), $\hat{7}$ **must resolve upward by step to $\hat{1}$** (e.g. B $\rightarrow$ C in C major).
  - In inner voices (Alto or Tenor), $\hat{7}$ may exceptionally drop to $\hat{5}$ (B $\rightarrow$ G) only to provide a complete tonic chord at a final cadence.
- **Chordal Seventh ($\hat{4}$ in V7)**:
  - Must **resolve downward by step** (e.g. F $\rightarrow$ E in G7 $\rightarrow$ C).
- **Suspensions**:
  - A suspension must be **prepared** as a consonant note on a weak beat, **held/suspended** into a dissonance on a strong beat, and **resolved downward by step** to a consonance on the following weak beat.
  - Standard suspensions: **4–3**, **7–6**, **9–8** in upper voices; **2–3** (bass suspension).

---

## 2. Chorale Architecture & Cadential Formulas

In Lutheran chorale settings (Bach style):
1. **Phrasing and Fermatas**:
   - Each poetic line concludes with a **fermata** (`H` in ABC notation, e.g. `c4 H |`).
   - The fermata in a chorale marks a structural pause and cadence point, not an indefinite hold.
2. **Cadence Types**:
   - **Perfect Authentic Cadence (PAC)**: `V(7) $\rightarrow$ I`, both chords in root position, Soprano resolves to the tonic pitch ($\hat{1}$).
   - **Imperfect Authentic Cadence (IAC)**: `V $\rightarrow$ I` where either chord is inverted, or the Soprano ends on $\hat{3}$ or $\hat{5}$.
   - **Half Cadence (HC)**: Phrase ends on root-position `V`, preceded by `I`, `ii6`, `IV`, or `I6/4`.
   - **Phrygian Half Cadence**: Specific to minor keys. `iv6 $\rightarrow$ V`, with the Bass descending $\hat{6} \rightarrow \hat{5}$ by half step and the Soprano ascending $\hat{4} \rightarrow \hat{5}$ or descending $\hat{1} \rightarrow \hat{7}$.
   - **Deceptive Cadence (DC)**: `V(7) $\rightarrow$ vi` (or `VI` in minor). Soprano resolves $\hat{7} \rightarrow \hat{1}$; Bass moves up by step to $\hat{6}$; third of `vi` is doubled.

### Example: 4-Bar Bach Chorale Phrase (ABC)
```abc
X:1
T:Chorale Phrase Example
C:J.S. Bach Style
M:C
L:1/4
K:G
V:1 clef=treble name="Soprano"
V:2 clef=treble name="Alto"
V:3 clef=bass   name="Tenor"
V:4 clef=bass   name="Bass"
% Measure 1 - 4
[V:1] G  A  B  c  | d2  B2  | c  B  A2  | G4 H |]
[V:2] D  D  D  E  | D2  G2  | G  G  (G F)| D4 H |]
[V:3] B, C  B, A, | B,2 d2  | e  d  (d c)| B,4 H |]
[V:4] G,, F,, G,, A,, | B,,2 G,2 | C  G,  D2  | G,,4 H |]
```

---

## 3. Fugue Architecture & Contrapuntal Devices

A fugue is an imitative contrapuntal composition built upon a single melodic subject.

### A. Anatomical Sections of a Fugue
1. **Exposition**:
   - **Subject (Dux)**: Stated alone in the tonic key by the first voice.
   - **Answer (Comes)**: Stated by the second voice in the dominant key (V).
     - *Real Answer*: Exact interval-for-interval transposition up a 5th / down a 4th.
     - *Tonal Answer*: Adjusted intervals to preserve tonic stability; specifically, if the subject begins with a prominent tonic-dominant leap ($\hat{1} \rightarrow \hat{5}$), the answer begins with a dominant-tonic leap ($\hat{5} \rightarrow \hat{1}$).
   - **Countersubject**: Accompanying line in the first voice against the answer, written in strict **invertible counterpoint** (voices can exchange top/bottom positions without producing forbidden 4ths or parallels).
   - Remaining voices enter alternately with Subject and Answer until all voices are active.
2. **Episodes**:
   - Sections where the complete subject is absent.
   - Built on fragments of the subject or countersubject organized into harmonic sequences (circle of fifths).
   - Function: Modulate to related keys (relative major/minor, subdominant, dominant).
3. **Middle Entries**:
   - Restatements of the subject in closely related keys (e.g. in C major: entries in G major, A minor, D minor, F major).
4. **Stretto**:
   - Overlapping statements of the subject, where voice 2 enters before voice 1 has finished stating the subject.
   - Creates intense climactic momentum towards the conclusion.
5. **Pedal Point & Final Coda**:
   - Dominant pedal point preparing the final return of the subject in the tonic key.
   - Tonic pedal point anchoring the final authentic cadence.

### B. Contrapuntal Transformation Devices
- **Inversion**: Melodic intervals flipped upside down (ascending step becomes descending step).
- **Augmentation**: Durations doubled (quarter notes become half notes).
- **Diminution**: Durations halved (quarter notes become eighth notes).
- **Retrograde**: Melodic line played backwards.
