# Score-scan evaluation sources

`bwv269.musicxml` is the pickup and first four measures of Bach BWV 269,
exported from the local music21 10.5.0 corpus (`bach/bwv269`) on 2026-10-24.
It preserves all four parts. Bach's composition is public domain; music21's
corpus distribution and source attribution remain applicable:
https://www.music21.org/music21docs/about/referenceCorpus.html

The scan smoke also uses the repository's BWV 371 ABC (first printed system),
Für Elise MusicXML (first eight measures) and Moonlight Sonata MusicXML (first
four measures). The piano excerpts are converted to ABC and rendered by abcjs.
The evaluator compares recognition to the exact ABC used for those renders,
then scores subsequent recognition-MusicXML-to-ABC conversion independently.
This does not measure the earlier reference-MusicXML-to-ABC rendering step.

These clean generated pages test integration and bounded musical behavior.
They do not establish accuracy on photographs or historical scans, and pooled
pitch/onset/duration counts do not certify correct voices, ties or notation.
