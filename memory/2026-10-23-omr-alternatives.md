# Debug report: Debussy recognition alternatives

- Symptom: the user supplied a comparison screenshot showing a substantially
  incorrect Debussy transcription and asked how the pipeline works and to try
  other options.
- Root cause: incorrect Audiveris MusicXML precedes ABC conversion. A second,
  independent limitation was reproduced: abcjs TripletElem cannot anchor a
  triplet beginning with an invisible rest. `(3xAB c6` crashes; the visible-rest
  control `(3zAB c6` renders. Different MusicXML-to-ABC converters reproduce it.
- Changes: no production fix or engine switch. Experiments and their outputs
  remain isolated under `.local/omr-alternatives/`. The source PDF, existing
  documents and original worktree were preserved.
- Evidence: homr 0.7/model396 and development model465 both complete on the
  supplied page, but fail opening triplet timing. Stable homr matches all 24
  opening pitch counts; development matches 23 with 3 extras. This count ignores
  order, voice, onset and duration. Oemer was interrupted during segmentation
  with exit 143 and produced no MusicXML; its accuracy remains unevaluated.
- Alternative: a separate 107-measure MusicXML edition from MuseTrainer renders
  in MuseScore, but full ABC conversion triggers the reproduced display issue.
  It is not the output of recognizing the supplied PDF.
- Regression evidence: minimal ABC reproduction and visible-rest control are
  saved as experiment artifacts, without adding a passing-test workaround for
  an unfixed upstream bug. Full existing checks passed: 227 service / 911 unit
  tests, TypeScript and lint with inherited warnings.
- Related: [full comparison](../docs/score-scan-alternatives.md), prior
  [partial-export investigation](2026-10-23-debussy-scan.md).
- Status: DONE_WITH_CONCERNS. The requested investigation and alternatives
  trials are complete; no tested automatic route provides a faithful page.
