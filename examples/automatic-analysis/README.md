# Automatic analysis examples

Import these ABC files through Chorale's **Import score** action or MCP `import_file`.
In the desktop app, choose a default model under **Settings → API providers →
Default sheet analysis model**, open **Analysis**, and enable the relevant lenses.
Each new score starts with analysis off. Results remain suggestions until you
choose **Keep as annotation**.

| File | Measures | Suggested lenses |
| --- | ---: | --- |
| `01-cadences.abc` | 8 | Chords; Cadences & phrases |
| `02-non-chord-tones.abc` | 4 | Chords; Non-chord tones |
| `03-suspensions.abc` | 4 | Chords; Non-chord tones |
| `04-voice-leading.abc` | 4 | Voice-leading |

These are AI-authored diagnostic fixtures from the local automatic-analysis
pilot completed on 2026-10-28: `control-01`, `control-03`, `control-04`, and
`control-06`, respectively. The SATB fixture was originally attributed to
GPT-6 Astra High. The other fixtures were authored during the Codex evaluation;
their original source does not record a model/effort attribution. Titles and
source metadata were added for browsing, and the first three bass voices use
bass clefs; pitches and rhythms are unchanged.

They are deliberately small studies, may contain voice-leading problems, and
are not style exemplars or independently adjudicated benchmarks. A successful
analysis of these familiar controls does not establish accuracy on real music.
The current automatic voice-leading scan lacks explicit voice-order/profile
configuration, so crossing, overlap and range coverage is limited.
