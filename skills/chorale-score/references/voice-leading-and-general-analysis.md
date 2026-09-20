# Voice Leading & General Score Analysis Guide

This guide establishes the analytical principles, voice-leading mechanics, non-chord tone taxonomy, formal phrase structures, and diagnostic frameworks for conducting comprehensive musical score analysis in Chorale.

---

## 1. Linear Voice Leading Foundations

Voice leading governs how individual horizontal melodic lines interact to produce vertical harmonic coherence.

### A. Melodic Contour & The Law of Leap Recovery
1. **Conjunct (Stepwise) Preference**: Melodic lines should proceed predominantly by step (seconds) with occasional small leaps (thirds).
2. **Consonant Leaps**: When leaping, use consonant intervals (3rds, 4ths, 5ths, 6ths, octaves). Strictly avoid melodic augmented intervals (e.g. augmented second $\text{A}2$, augmented fourth $\text{A}4$) and major sevenths ($\text{M}7$).
3. **The Law of Leap Recovery**: Any melodic leap larger than a third should be balanced or "recovered" by immediate stepwise motion in the opposite direction.
   - *Example*: An ascending leap of an octave ($C \rightarrow c$) should be followed by a descending step ($c \rightarrow b$ or $c \rightarrow a$).
4. **Focal Point Principle**: A well-crafted melodic phrase has a single highest pitch (climax or melodic peak) reached only once, rather than repeated jagged spikes.

### B. The Four Types of Contrapuntal Motion

| Motion Type | Definition | Contrapuntal Assessment |
| --- | --- | --- |
| **Contrary Motion** | Voices move in opposite directions (one ascends, one descends). | **Ideal**. Maximizes voice independence. |
| **Oblique Motion** | One voice sustains or repeats a pitch while the other moves. | **Excellent**. Clear melodic differentiation. |
| **Similar Motion** | Both voices move in the same direction by different interval sizes. | **Good**. Safe if outer voices avoid direct 5ths/8ves. |
| **Parallel Motion** | Both voices move in the same direction by the exact same interval size. | **Conditional**. Perfect for 3rds & 6ths; **strictly forbidden** for 5ths, 8ves, and unisons. |

---

## 2. Non-Chord Tone (NCT) Taxonomy

Non-chord tones are pitches that do not belong to the underlying harmony. They create expressive tension, rhythmic vitality, and melodic contour.

Every NCT is systematically classified by three moments: **Approach**, **Dissonance Event**, and **Resolution / Departure**:

| Non-Chord Tone | Metric Placement | Approach Method | Resolution / Departure | Standard Abbreviation |
| --- | --- | --- | --- | --- |
| **Passing Tone (Unaccented)** | Weak beat / off-beat | By step | By step in the **same** direction | `PT` |
| **Passing Tone (Accented)** | Strong beat (on chord onset) | By step | By step in the **same** direction | `APT` |
| **Neighbor Tone (Upper)** | Weak beat | By step upward | By step downward to original pitch | `UNT` |
| **Neighbor Tone (Lower)** | Weak beat | By step downward | By step upward to original pitch | `LNT` |
| **Suspension** | Strong beat | Prepared as consonance on weak beat; held over | Downward by step | `SUS` (4-3, 7-6, 9-8) |
| **Retardation** | Strong beat | Prepared as consonance on weak beat; held over | Upward by step (often $\hat{7} \rightarrow \hat{1}$) | `RET` |
| **Appoggiatura** | Strong beat | By **leap** | Downward (or upward) by **step** in opposite direction | `APP` |
| **Escape Tone (Échappée)** | Weak beat | By **step** | By **leap** in opposite direction | `ET` |
| **Anticipation** | Weak beat | By step or leap | Sustained or re-struck as the subsequent chord tone | `ANT` |
| **Pedal Point** | Sustained through chord changes | Stationary pitch | Re-joins harmony as consonant factor | `PED` |
| **Neighbor Group (Cambiata)** | Weak beat | Step up, leap 3rd down | Step up to original pitch | `NG` |

### Detailed Mechanics of Key Dissonances

#### A. Suspensions (The 3-Phase Requirement)
A suspension must always proceed through three distinct rhythmic phases:
1. **Preparation**: Sounded on a metrically weak beat as a consonant member of the preceding chord.
2. **Suspension**: The note is tied or sustained into the subsequent chord on a metrically strong beat, becoming a sharp dissonance against the new bass.
3. **Resolution**: The suspended note moves downward by step to a consonant factor on the following weak beat.
- **Common Suspension Formulas**:
  - **4–3 Suspension**: The 4th above the bass resolves to the 3rd (standard over $\text{I}$ or $\text{V}$).
  - **7–6 Suspension**: The 7th above the bass resolves to the 6th (standard in first-inversion chords).
  - **9–8 Suspension**: The 9th above the bass resolves to the octave (root).
  - **2–3 Bass Suspension**: Occurs in the lowest voice; the bass itself is suspended and resolves downward by step.

**Annotation proof rule**: Name a suspension only after aligning the relevant voice with the bass across all three phases. The preparation must be sounding and consonant before the harmony changes; the same pitch must continue by a tie or written duration into the new harmony as a dissonance; and that same voice must then resolve by step. A note that merely moves from a chord tone to the expected resolution at the chord onset is not a suspension. If any phase is absent or cannot be established from the written rhythm, describe the motion without the suspension label.

#### B. Appoggiaturas
- Highly expressive, emotionally poignant accent dissonance.
- Approached by an expressive leap onto a strong beat, followed by a stepwise resolution in the opposite direction.
- Frequently used by Mozart, Haydn, and Chopin at expressive phrase climaxes and feminine cadential endings.

---

## 3. Formal & Phrase Architecture

General score analysis requires examining the hierarchical formal construction of a piece:

```text
Motivic Cell (1 bar) ──> Subphrase (2 bars) ──> Phrase (4 bars) ──> Period (8 bars)
```

### A. Period Structures (Antecedent – Consequent)
A **Period** consists of two complementary 4-bar phrases:
1. **Antecedent Phrase**: Ends with an inconclusive cadence, typically a **Half Cadence (HC)** on $\text{V}$ or an **Imperfect Authentic Cadence (IAC)**.
2. **Consequent Phrase**: Begins with parallel or contrasting material and concludes with a definitive, conclusive cadence, almost always a **Perfect Authentic Cadence (PAC)** on $\text{I}$.
- **Parallel Period**: The consequent phrase begins with identical or transposed melodic material from the antecedent phrase.
- **Contrasting Period**: The consequent phrase begins with distinctly different melodic material.

### B. Sentence Structures (Caplin / Schoenberg Model)
A **Sentence** is an 8-measure formal unit organized into three functional sections ($2 + 2 + 4$ bars):
1. **Presentation (mm. 1–4)**:
   - Basic Idea ($2$ bars): Initial melodic-rhythmic motive.
   - Repeat of Basic Idea ($2$ bars): Exact, harmonically transposed (e.g. tonic $\rightarrow$ dominant), or sequential restatement. No cadence terminates this section.
2. **Continuation (mm. 5–6)**:
   - **Fragmentation**: Breaking down the motive into 1-bar or 1-beat fragments.
   - **Acceleration**: Increase in surface rhythmic activity and harmonic rhythm.
3. **Cadential Drive (mm. 7–8)**:
   - Direct progression to a strong cadence (PAC or HC).

### C. Large-Scale Formal Models
- **Binary Form**: Two sections, each typically repeated ($\|: \text{A} :\|: \text{B} :\|$).
  - *Simple Binary*: Section A moves tonic $\rightarrow$ dominant; Section B explores related keys and cadences in tonic.
  - *Rounded Binary*: Section B concludes with an explicit restatement of Section A material in the tonic key ($\|: \text{A} :\|: \text{B A}' :\|$).
- **Ternary Form ($\text{A} - \text{B} - \text{A}$)**:
  - Section A: Self-contained tonal unit in the tonic key.
  - Section B: Contrasting episode in a related key (relative minor, dominant, parallel minor) with contrasting character.
  - Section A Return: Complete or decorated restatement of Section A in tonic.
- **Rondo Form**:
  - Recurring refrain ($\text{A}$) interspersed with contrasting episodes: $\text{A} - \text{B} - \text{A} - \text{C} - \text{A}$ (5-part) or $\text{A} - \text{B} - \text{A} - \text{C} - \text{A} - \text{B} - \text{A}$ (Sonata-Rondo).

---

## 4. Textural & Motivic Analysis

### A. Musical Textures
- **Monophony**: A single, unaccompanied melodic line (e.g. plainchant, solo flute intro).
- **Homophony**: A dominant melodic voice accompanied by subordinate chords or accompaniment figures (e.g. classical song, Mozart sonata with Alberti bass).
- **Homorhythm (Chordal)**: All voices move in identical rhythm note-for-note (e.g. strict hymn or 4-part chorale).
- **Polyphony (Counterpoint)**: Multiple independent melodic lines of equal rhythmic and motivic importance (e.g. Bach fugue, Renaissance motet).
- **Stratified Polyphony**: Texture divided into distinct functional layers (e.g. running bass line + middle harmony + singing chorale cantus firmus).

### B. Motivic Development Techniques
Composers develop small melodic motives (*Grundgestalt*) through these standard operations:
- **Repetition**: Exact restatement at the same pitch level.
- **Transposition / Sequence**: Restatement shifted up or down by a constant interval.
- **Inversion**: Flipping melodic intervals upside down (ascending becomes descending).
- **Retrograde**: Playing the pitches in reverse order from end to beginning.
- **Augmentation**: Multiplying note durations (e.g. eighths $\rightarrow$ quarters).
- **Diminution**: Dividing note durations (e.g. quarters $\rightarrow$ eighths).
- **Fragmentation**: Isolating a 2- or 3-note segment of the motive and repeating it.
- **Liquidation**: Systematically stripping away characteristic features of a motive until only generic scales or arpeggios remain leading into a cadence.

---

## 5. Formulating Analytical Summaries in Chorale

When returning analytical insights or adding annotations via the Chorale MCP server:

1. **Ground Every Claim in Exact Written Measures**:
   - Use markdown measure links: `[m. 5](#measure-5)` or `[mm. 5–8](#measure-5-8)`.
2. **Identify Voices Explicitly**:
   - Cite voice names (`Soprano`, `Alto`, `Tenor`, `Bass` or `RH`, `LH`) when discussing melodic lines or counterpoint.
3. **Structure Annotations by Kind**:
   - Use `kind: "voice-leading"` for suspensions, parallel motion checks, and voice crossings.
   - Use `kind: "form"` for phrase boundaries, antecedent/consequent designations, and cadences.
   - Use `kind: "analysis"` for motivic transformations and textural observations.

### Example: Adding Structured Analysis Annotations
```json
{
  "documentId": "score-1726000000000",
  "expectedRevision": 7,
  "notations": [
    {
      "startMeasure": 3,
      "endMeasure": 3,
      "kind": "voice-leading",
      "label": "4-3 Suspension in Alto",
      "body": "Alto prepares C5 on beat 2, suspends it over G bass on beat 3 forming a dissonant 4th, resolving down by step to B4 (3rd) on beat 4."
    },
    {
      "startMeasure": 1,
      "endMeasure": 8,
      "kind": "form",
      "label": "Parallel Period",
      "body": "Antecedent phrase (mm. 1-4) concludes on HC in m. 4; Consequent phrase (mm. 5-8) repeats opening motive and achieves PAC in m. 8."
    }
  ]
}
```
