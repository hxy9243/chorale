# Page screening trial — 23 October 2026

Implemented in `feat/pdf-score-import-mvp`, based on the snapshot of
`restore-electron-chat`. This tests page selection separately from note accuracy.

## Local PDFs inspected

All four PDFs currently in `/home/kevin/Downloads/music` were rendered and
visually inspected, page by page. Every page contains musical notation:

| PDF | Pages | Music pages | Non-music pages found |
| --- | ---: | ---: | ---: |
| IMSLP00465-Chopin_-_2_Nocturnes,_Op_37.pdf | 8 | 8 | 0 |
| IMSLP02821-Debussy-L066.pdf | 11 | 11 | 0 |
| Raindrops.pdf | 5 | 5 | 0 |
| op17-4.pdf | 4 | 4 | 0 |

The final page-screening test retained all 28 as music candidates. At most five
are selected for recognition per job; additional music pages remain visible and
can be selected for another job. The originals were read, never modified.

## Mixed pages

A generated five-page PDF contains a cover, editorial prose, a blank page, a
known melody, and publication prose. Only original page 4 is selected. The real
Audiveris job receives `[4]`, produces a reviewable score with source page 4,
and retains an exact copy of the complete five-page PDF. Manual inclusion and
omission of the cover also work. No score is created by page screening or by
reviewing a candidate.

## Failure handling and limits

PDF.js 6 requires local image decoders even for old CCITT scans. The worker,
decoders, fallbacks and licenses are bundled with the app and served in local
development. Image decode failure must produce **Check page**, not a confident
non-music classification. A deliberately broken embedded image is used to test
that distinction.

This is a heuristic for horizontal five-line staff notation. Faint, rotated or
unusual notation can require manual selection. The page chooser shows all page
numbers, thumbnails, selection and omissions. It previews at most 60 PDF pages;
a preview failure allows manual numeric selection. Recognition remains limited
to five selected pages per job.

This feature does not fix Debussy's recognition accuracy. Its pages remain music
candidates; an incomplete recognition export is still rejected as an error.
See [the recognition trial](score-scan-trial-results.md).

## Reproduce

```sh
npm run build
npm run build:electron
CHORALE_EXPECT_ALL_MUSIC=1 npm run smoke:scan-pages -- /home/kevin/Downloads/music
```

The smoke uses an isolated profile and library. Local screenshots, manifests and
results are written beneath `.local/page-inspection/`. Playwright disables the
Electron sandbox during automated testing, and the report records that fact.

## Validation

- 227 service tests passed. All 911 unit tests passed with two workers. An initial
  concurrent run hit two existing timing checks (playback readiness and a
  500 ms presentation budget); both passed in the complete, quieter rerun.
- All 24 scanner/page-selection focused tests passed.
- TypeScript, lint and browser/desktop builds passed. Lint retains existing
  unrelated warnings. The development decoder route was also checked.
- Final corpus/preview and broken-image evidence:
  `.local/page-inspection/2026-10-24T03-56-30-459Z/results.json`.
- The complete page-screening smoke passed with real recognition of original
  page 4, exact preservation of the full PDF, all 28 local music pages retained
  as candidates, and the broken-image manual-review check.
- The existing PDF/PNG import smoke passed: both melody inputs matched all 16
  reference notes; the Bach excerpt matched 76/77, with the existing one-note
  recognition loss. Review, explicit import, persistence, reload and cancel
  passed. Evidence: `.local/scan-trial/2026-10-24T03-54-27-796Z/REPORT.md`.
