# Debug report: Debussy PDF recognition

Date: 2026-10-23 (America/Vancouver)

## Symptom

The user scanned page 1 of `IMSLP02821-Debussy-L066.pdf` and the recognized
score did not match the page. The supplied file has 11 pages; its first page is
music, not a cover. Its embedded page image is a 2550 x 3300, one-bit scan at
approximately 253 DPI.

Source SHA-256:
`ac2a2adc39b7776cdd6296f90381c220fbdfe76eadd3c709188147e543d90a31`.
The retained original matches the supplied PDF's checksum. Investigation used
this retained copy after the original Downloads path became unavailable.

## Root cause

There are two distinct problems:

1. **Recognition failure before Chorale conversion.** The page visibly has a
   four-sharp key signature and common time. The saved Audiveris MusicXML
   instead starts with one sharp on one staff and two on the other, and has no
   `<time>` element at all. The engine reports a missing clef and unresolved
   rhythms. It detects 16 raw measures but exports only 15. During measure 5,
   `PartwiseBuilder` logs `Error visiting Measure{#5}` followed by a
   `java.lang.NullPointerException` involving a missing chord time offset.
2. **The MVP accepted a partial export as a success.** The engine still exits
   zero and writes pitched notes to MusicXML. The native bridge only checked
   process status and the presence of pitched notes, so it marked the job
   recognized. The subsequent converter produces `M:none`, `K:G`, seven ABC
   voices and an overlapping-note discard warning; it cannot reconstruct the
   original music from already incorrect input.

This is not a wrong-page selection or a cover-page problem. Page identity and
the source checksum were checked. The score's cross-staff writing, clef changes
and rhythmic complexity are likely contributing difficulties, but the precise
internal recognition errors have not been repaired.

## Hypothesis test

To test whether PDF resampling was the main problem, the original embedded first
page was extracted losslessly and recognized as PNG. That recovered common time
and removed the missing-clef warning, but the initial key still had only two
sharps and measure 5 still failed export. Rhythms remained unresolved across
multiple systems. This alternative is not a usable conversion and was not
adopted as an automatic fallback.

## Fix

`electron/scoreScan.ts` now rejects a result when Audiveris logs a measure-export
exception, even if it exits successfully and writes an MXL file. It also rejects
an absent explicit time signature rather than silently offering unmetered ABC.
Unmetered scan results are outside the supported MVP scope.

Original bytes, partial MusicXML, recognition project, logs and a failed
manifest remain available. The existing renderer displays the rejection through
its error flow without creating a document. Existing imported scores are not
automatically rewritten.

## Regression tests

`src/agent/__tests__/scoreScan.test.ts` includes two new cases:

- A recognizer exits zero and writes pitched notes but logs the real measure
  export failure. The importer must reject it and preserve partial output.
- A recognizer writes pitched notes without a time signature. The importer must
  reject it rather than presenting `M:none` as a successful scan.

Both tests failed on the original code (the promises resolved) and passed after
the fix. The scan-specific native and UI suites then passed 14 tests.

## Evidence and verification

Investigation artifacts are under `.local/debussy-investigation/`, including the
first-page image, binarized source, current ABC, conversion warnings, extracted
original PNG, lossless-image trial, and red/green regression logs.

The user's saved job inspected for diagnosis is
`.local/scan-demo-library/imports/ab1e1ce7-eee0-4205-816f-72492b6d6680/`.
Another saved scan of the same bytes showed the same major failures.

Fresh real-PDF reproduction with the corrected code again triggered the native
measure-export failure. This time the promise rejected with `The scanner could
not finish exporting this page`, and the manifest was recorded as `failed`, not
`recognized`. The checksum still matched the original supplied PDF. This run is
saved at `.local/debussy-investigation/verified-jobs/a24e955d-0291-4a6d-874f-e02f7e4f5585/`
and summarized in `.local/debussy-investigation/verification.json`.

Verification completed:

- 227 service tests and 901 unit/UI tests passed (1,128 total).
- 14 scan-specific tests passed, including both new regressions.
- TypeScript, lint, browser build and desktop build passed. Lint reports only
  inherited warnings outside the changed scanner code.
- The already-running trial window was not restarted or its current score
  rewritten. Restart it to load the new native rejection checks.

## Related and status

The earlier positive results used clean pages rendered from known ABC. They
showed that the pipeline can work, not that it is reliable on scanned editions.
This real example invalidates treating those results as a general recognition
quality estimate.

Status: **DONE_WITH_CONCERNS**. The incorrect success classification is fixed
and verified against the real PDF. Recognition accuracy for this page remains
unresolved; neither tested input path produced a faithful editable score.
