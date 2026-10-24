# Debussy scan: recognition alternatives

Date: 2026-10-23, America/Vancouver.

## Conclusion

The current automatic importer does not faithfully transcribe this page. A
successful process, exported file or passing application test is not evidence
of musical accuracy. Two local homr variants improve pitch recognition over
Audiveris, but neither gets the opening triplet timing right. They are not a
validated replacement engine for Chorale.

## How the current importer works

1. PDF.js previews pages and screens for staves. This chooses pages; it does not
   read the musical content.
2. Audiveris loads the selected page images, locates staves, classifies symbols,
   connects notes/chords, and infers voices and rhythm. It exports MusicXML.
3. `@educandu/abc-tools` converts MusicXML to ABC.
4. abcjs renders and plays the ABC in Chorale.

See [Audiveris's documented recognition steps](https://audiveris.github.io/audiveris/_pages/explanation/steps/README/).
MusicXML errors cannot be recovered by reformatting the ABC. For this PDF the
saved Audiveris export already contains incorrect keys and missing time data,
and ends after a measure-export exception. The importer now rejects that partial
result; rejection does not repair recognition.

## Input and comparison method

The source is `IMSLP02821-Debussy-L066.pdf`, SHA-256
`ac2a2adc39b7776cdd6296f90381c220fbdfe76eadd3c709188147e543d90a31`.
The original first-page image was extracted losslessly. Both neural models ran
locally on the same 2550 × 3300 image. No score was uploaded.

The opening has four sharps, common time and 24 pitched events across its first
two bars. Pitches were checked against the scan and a separate editable edition,
with [Mutopia's source](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1777)
as another reference. Pitch counts below pool hands/voices and ignore onset,
duration and order; they are **not** complete-note accuracy measurements.
The diagnostic exact-event comparison includes written bar, onset, pitch and
duration, but pools voices. No whole-piece accuracy percentage is claimed.

## Actual trials

| Option | Result on this page |
| --- | --- |
| Audiveris 5.11.0 PDF baseline | Opening keys 1 and 2 sharps instead of 4; missing meter; partial export. The preserved baseline contains 197 pitched notes in 15 exported measures. |
| Audiveris lossless PNG (prior trial) | Recovers common time, but still wrong key and partial export. |
| Audiveris first-system crop (new trial) | Still fails export. Cropping alone does not rescue the recognizer. |
| homr 0.7.0, model 396 | Completes in 64.45 s on CPU with four ONNX threads. Correct initial 4-sharp key and 4/4. All 24 opening pitch values/counts match, but durations, onsets and hand assignments are wrong. Exports 234 pitched notes / 16 measures. |
| homr development commit `b549203bb030cb031d8b73ae3918f35638713cc2`, model 465 | Completes in 59.38 s under the same CPU limit. Correct initial key/meter; 23/24 opening pitch counts match with 3 extra pitch events. Triplet timing remains wrong. Exports 242 pitched notes / 16 measures. |
| Oemer 0.1.8 | CPU inference was attempted with official ONNX models and `--without-deskew`. The process ended with signal/exit 143 during segmentation, before producing MusicXML. No accuracy verdict is possible. |

[homr](https://github.com/liebharc/homr) combines structural segmentation with a
transformer recognizer. [Oemer](https://github.com/BreezeWhite/oemer) combines
segmentation, symbol classification and music-building rules. Their different
approaches were worth testing, but neither the successful homr exports nor note
counts establish a faithful transcription. The stable homr result visibly has
sixteenth/eighth-note rhythms where the opening requires triplets.

The Oemer trial used Python 3.12, NumPy 1.26.4, OpenCV 4.11, ONNX Runtime 1.22.1
and scikit-learn 1.8. It was kept separate from homr and the app. Its preliminary
missing-typing dependency was resolved before inference; the signal termination
is distinct from that initial setup error. There is no evidence here identifying
why that signal occurred, and it must not be called an OOM or recognition error.

## A second problem: ABC compatibility

A separate MusicXML edition renders sensibly in MuseScore Studio 4.7.4. Converting
its complete score or first 16 bars into ABC, however, produces triplets starting
with invisible rests, such as `(3xAB`. abcjs 6.6.4 crashes in `TripletElem` because
the invisible rest has no notehead anchor. A tiny independent reproduction fails
with `(3xAB c6` and succeeds with `(3zAB c6`. The workspace already had a
temporary-anchor workaround that preserved stored ABC and hid the rest glyph,
but the new scan preview bypassed it. The stability patch now routes scan
validation and preview through that shared path and contains score failures
inside the score pane. See the [patch report](../memory/2026-10-23-score-render-crash.md).

The packaged Python xml2abc fork (version 139, with only Python 3.12 ElementTree
API compatibility changes in the isolated copy) produces the same problematic
construct. Changing converter alone does not solve it.

The first two reference bars convert and render without this crash, with only
unsupported pedal-mark warnings. A MusicXML → ABC → MusicXML check matches all
24 opening pitch/onset/duration events. A broader roundtrip check is not a clean
measure of import quality: the ABC exporter introduces additional discrepancies
around clef-only key fields, so its full-page counts are retained as diagnostics,
not attributed entirely to the import converter.

## Practical alternatives

A separate full, editable edition is available from the
[MuseTrainer public-domain library](https://github.com/kevinkorfmann/musicxml_library)
([direct MXL download](https://musetrainer.github.io/library/scores/Arabesque_L._66_No._1_in_E_Major.mxl)).
It has 107 measures and renders in MuseScore. It is a different edition with
editorial differences, not a transcription of the supplied historical PDF, and
has not been certified note-for-note across the entire work. After the stability
patch its complete converted ABC rendered in Chorale, and its first 16 measures
passed scan review, import and reload in an isolated desktop smoke. Recognition
was replaced with the reference MusicXML for that check; it does not establish
accurate recognition of the supplied PDF.

[PlayScore](https://www.playscore.co/how-to-use-ps2/) and
[ScanScore](https://scan-score.com/en/) advertise PDF recognition and MusicXML
export. They were researched, not tested or purchased: PlayScore's PDF/export
features require a subscription; ScanScore lists Mac/Windows and an emailed
trial. No account was created and no score was sent to those services.

For Chorale, the architectural direction suggested by these trials is to keep
MusicXML as the editable source and render it directly, with scanner choice and
manual correction available. Converting all recognized piano music immediately
to ABC adds another fidelity and compatibility boundary. This is a proposed
follow-up, not an implemented architecture change.

## Evidence and validation

All raw models, inputs, outputs, command logs, comparison scripts and images are
under ignored `.local/omr-alternatives/` in the MVP worktree:

- `experiment.json`: source hashes and engine identities.
- `comparison-results.json`: pitch counts and diagnostic exact-event matches.
- `homr-output/` and `homr-latest-output/`: raw MusicXML, source image, run duration
  and detection previews. These are experimental, incorrect recognition outputs.
- `Arabesque-reference.musicxml` / `.mxl`: the separate full editable edition.
- `opening-comparison.jpg`: scan, homr output and reference edition, with labels.
- `triplet-*-repro.abc` and render reports: minimal compatibility evidence.

The app's source and current library were not changed for these experiments.
The full repository checks passed again: 227 service tests, 911 unit tests,
TypeScript and lint (inherited warnings remain). These checks validate software
behavior, not transcription accuracy.
