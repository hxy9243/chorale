# Musical Eras, Styles & Composer Profiles Directory

This directory provides concrete musical characteristics, harmonic vocabularies, rhythmic textures, accompaniment patterns, and ABC notation templates for emulating specific historical eras and composers in Chorale.

Individual style and composer profiles are modularized under the [`profiles/`](profiles/) directory.

---

## 1. Quick Style Comparison Matrix

| Composer / Style | Primary Texture | Harmonic Rhythm | Accompaniment Figure | Dynamic & Expressive Marks | Profile File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **J.S. Bach** (Baroque) | Dense Polyphony / 4-part SATB | Fast (every beat or half-beat) | Walking bass, motoric 16th streams | Terraced (`!p!`, `!f!`), no hairpins | [`profiles/bach.md`](profiles/bach.md) |
| **W.A. Mozart & J. Haydn** (Classical) | Homophonic / Cantabile line | Moderate (every 1–2 beats) | Alberti bass (`c g e g`), chordal pulses | Balanced, gradual (`!crescendo(!`, `!diminuendo)!`) | [`profiles/mozart-haydn.md`](profiles/mozart-haydn.md) |
| **L.v. Beethoven** (Heroic Early Romantic) | Dramatic Homophony / Motive | Variable (sudden expansions) | Driving tremolos, octaves, syncopations | Extreme (`!pp!` to `!ff!`), sudden `!sfz!` accents | [`profiles/beethoven.md`](profiles/beethoven.md) |
| **F. Chopin** (High Romantic) | Bel Canto Melodic Fioritura | Slow to moderate (per bar) | Sweeping wide arpeggios across 2–3 octaves | Intricate rubato, `!p!`, `!pp!`, `!espressivo!` | [`profiles/chopin.md`](profiles/chopin.md) |
| **Studio Ghibli** (Joe Hisaishi / Cinematic) | Lyrical Cantabile with Inner Arpeggios | Moderate (1–2 chords per bar) | Syncopated middle arpeggios, open root-fifth bass | Warm, expressive (`!p!`, `!mp!`, `!diminuendo)!`) | [`profiles/ghibli.md`](profiles/ghibli.md) |

---

## 2. Composer & Style Profile Directory

Consult the dedicated reference document for each style's melodic rules, harmonic syntax, voice layout, and standalone ABC templates:

1. **[Johann Sebastian Bach (`profiles/bach.md`)](profiles/bach.md)**  
   Baroque polyphonic motor, circle-of-fifths sequences, harmonic/melodic minor rules, 4–3 / 7–6 suspensions, continuous walking bass, and two-part keyboard invention template.

2. **[Wolfgang Amadeus Mozart & Joseph Haydn (`profiles/mozart-haydn.md`)](profiles/mozart-haydn.md)**  
   Classical periodic phrasing (antecedent/consequent), cantabile melody over Alberti bass, cadential $^{6}_{4}$ formulas, appoggiaturas, and piano sonata opening template.

3. **[Ludwig van Beethoven (`profiles/beethoven.md`)](profiles/beethoven.md)**  
   Motivic development and economy, sudden dynamic contrasts (`!pp!` to `!ff!`), weak-beat sforzandi (`!sfz!`), chromatic third-relation modulations, and dramatic motive template.

4. **[Frédéric Chopin (`profiles/chopin.md`)](profiles/chopin.md)**  
   Bel canto melodic ornamentations (fioriture), wide-spaced left-hand rolling arpeggios, rich chromatic voice leading, genre rules (Nocturne, Waltz, Mazurka), and Nocturne template.

5. **[Studio Ghibli / Joe Hisaishi (`profiles/ghibli.md`)](profiles/ghibli.md)**  
   Pastoral, nostalgic, and bittersweet storytelling; the Japanese "Royal Road" progression ($\text{IV} \rightarrow \text{V} \rightarrow \text{iii} \rightarrow \text{vi}$); stepwise descending basslines with slash chords; pentatonic cantabile themes; and two-clef grand staff piano template.

---

## 3. Emulation Invariants for Autonomous Agents

When composing in a specific composer's style:

1. **Composer Attribution (`C:` Field)**:
   - Always attribute the composer field `C:` (and the `create_new_file` `composer` parameter) to the current AI model name + reasoning effort level (e.g. `C:Gemini 3.8 Flash Medium`, `C:GPT-5.6 Sol High`).
   - Reflect the emulated style in the title or subtitle (e.g. `T:A Walk Through the Meadow\nT:In the style of Studio Ghibli`).
2. **Keyboard Clef Architecture**:
   - For piano pieces, use two clefs (Treble and Bass) grouped via `%%score { (1 2) | 3 }` (for 3 voices) or `%%score { RH LH }` (for 2 voices), bracketing the staves with a grand staff brace.
3. **Harmonic Consistency**:
   - Strictly follow the period-appropriate chord vocabulary, harmonic rhythm, and cadence resolutions defined in each profile file.
