import { describe, expect, it } from 'vitest';
import { exportToMusicXml, ScoreExportError, suggestExportFileName } from '../musicXmlExport';

const SIMPLE_MELODY = `X:1
T:Simple Scale
C:Test Composer
M:4/4
L:1/4
Q:1/4=100
K:C
C D E F|G A B c|]`;

const MULTI_VOICE = `X:1
T:Duet
M:3/4
L:1/8
K:G
V:1
B2AG AB|c4 B2|
V:2 clef=bass
z4 z2|D2E2 F2|`;

const parseXml = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('exportToMusicXml', () => {
  it('produces a valid score-partwise MusicXML document for a simple melody', () => {
    const xml = exportToMusicXml({ abcSource: SIMPLE_MELODY });
    const doc = parseXml(xml);

    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe('score-partwise');
    expect(doc.getElementsByTagName('score-part').length).toBeGreaterThan(0);
    expect(doc.getElementsByTagName('note').length).toBeGreaterThan(0);
  });

  it('carries title and composer metadata into the document', () => {
    const xml = exportToMusicXml({
      abcSource: SIMPLE_MELODY,
      fallbackTitle: 'Fallback Title',
    });
    const doc = parseXml(xml);

    expect(doc.getElementsByTagName('work-title')[0]?.textContent).toBe('Simple Scale');
    expect(doc.getElementsByTagName('creator')[0]?.textContent).toBe('Test Composer');
  });

  it('uses the fallback title when the ABC header has none', () => {
    const xml = exportToMusicXml({
      abcSource: 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F|]',
      fallbackTitle: 'Untitled Export',
    });
    const doc = parseXml(xml);

    expect(doc.getElementsByTagName('work-title')[0]?.textContent).toBe('Untitled Export');
  });

  it('emits one part per voice with rests preserved', () => {
    const xml = exportToMusicXml({ abcSource: MULTI_VOICE });
    const doc = parseXml(xml);

    expect(doc.getElementsByTagName('score-part')).toHaveLength(2);
    expect(doc.getElementsByTagName('rest').length).toBeGreaterThan(0);
  });

  it('emits ties and chords from the source notation', () => {
    const xml = exportToMusicXml({
      abcSource: 'X:1\nM:4/4\nL:1/4\nK:Dm\n"C7"C2EG [CEG]|D-D F G A|]',
    });
    const doc = parseXml(xml);

    expect(doc.querySelectorAll('tie[type="start"]')).toHaveLength(1);
    expect(doc.querySelectorAll('tie[type="stop"]')).toHaveLength(1);
    expect(doc.querySelectorAll('tied[type="start"]')).toHaveLength(1);
    expect(doc.querySelectorAll('tied[type="stop"]')).toHaveLength(1);
    expect(doc.getElementsByTagName('chord').length).toBeGreaterThan(0);
    expect(doc.getElementsByTagName('harmony').length).toBeGreaterThan(0);
  });

  it('preserves exact triplet timing and nominal note types', () => {
    const xml = exportToMusicXml({
      abcSource: 'X:1\nM:4/4\nL:1/8\nK:C\n(3CDE F2 G2 A2|]',
    });
    const doc = parseXml(xml);
    const divisions = Number(doc.getElementsByTagName('divisions')[0]?.textContent);
    const tripletNotes = Array.from(doc.getElementsByTagName('note')).slice(0, 3);

    expect(divisions % 3).toBe(0);
    for (const note of tripletNotes) {
      expect(note.getElementsByTagName('duration')[0]?.textContent).toBe(String(divisions / 3));
      expect(note.getElementsByTagName('type')[0]?.textContent).toBe('eighth');
      expect(note.getElementsByTagName('actual-notes')[0]?.textContent).toBe('3');
      expect(note.getElementsByTagName('normal-notes')[0]?.textContent).toBe('2');
    }
  });

  it('keeps accidental state independent across grand-staff staves', () => {
    const xml = exportToMusicXml({
      abcSource: `X:1
M:4/4
L:1/4
%%score { 1 | 2 }
V:1 clef=treble
V:2 clef=bass
K:C
[V:1] ^C C |
[V:2] C C |`,
    });
    const doc = parseXml(xml);
    const notes = Array.from(doc.getElementsByTagName('note'));
    const lowerStaffNotes = notes.filter(
      (note) => note.getElementsByTagName('staff')[0]?.textContent === '2',
    );

    const lowerStaffPitchedNotes = lowerStaffNotes.filter(
      (note) => note.getElementsByTagName('pitch').length > 0,
    );

    expect(lowerStaffPitchedNotes).toHaveLength(2);
    expect(lowerStaffPitchedNotes.every((note) => note.getElementsByTagName('alter').length === 0)).toBe(true);
    // Incomplete 2-beat measure in 4/4 is padded with rests to complete the 4-beat meter
    expect(lowerStaffNotes.some((note) => note.getElementsByTagName('rest').length > 0)).toBe(true);
  });

  it('normalizes multi-staff scores by padding silent staves with whole-measure rests', () => {
    const xml = exportToMusicXml({
      abcSource: `X:1
T:Sparse Multi-Staff
M:3/4
L:1/4
%%score { 1 | 2 | 3 }
V:1
C D E | F G A | B c d | e f g |
V:2
C D E | F G A | | e f g |
V:3 clef=bass
C,, D,, E,, | | | e,, f,, g,, |`,
    });
    const doc = parseXml(xml);

    // Find all measures in the part
    const part = doc.getElementsByTagName('part')[0];
    const measures = Array.from(part.getElementsByTagName('measure'));
    expect(measures).toHaveLength(4);

    // Measure 3: Staff 3 is silent -> must contain whole-measure rest for voice 3 on staff 3
    const m3 = measures[2];
    const m3Notes = Array.from(m3.getElementsByTagName('note'));
    const staff3Rest = m3Notes.find(
      (n) => n.getElementsByTagName('staff')[0]?.textContent === '3'
        && n.querySelector('rest[measure="yes"]') !== null,
    );
    expect(staff3Rest).toBeDefined();
    expect(staff3Rest?.getElementsByTagName('duration')[0]?.textContent).toBe('12');

    // Measure 4: Staff 2 and Staff 3 are silent -> must contain whole-measure rests
    const m4 = measures[3];
    const m4Notes = Array.from(m4.getElementsByTagName('note'));
    const staff2Rest = m4Notes.find(
      (n) => n.getElementsByTagName('staff')[0]?.textContent === '2'
        && n.querySelector('rest[measure="yes"]') !== null,
    );
    const m4Staff3Rest = m4Notes.find(
      (n) => n.getElementsByTagName('staff')[0]?.textContent === '3'
        && n.querySelector('rest[measure="yes"]') !== null,
    );
    expect(staff2Rest).toBeDefined();
    expect(m4Staff3Rest).toBeDefined();
  });

  it('normalizes multi-part SATB scores with resting voices', () => {
    const xml = exportToMusicXml({
      abcSource: `X:1
T:SATB Choral Score
M:4/4
L:1/4
V:S name="Soprano"
C D E F | G A B c | c B A G | F E D C |
V:A name="Alto"
C D E F | | | F E D C |
V:T name="Tenor" clef=bass
| | c B A G | F E D C |
V:B name="Bass" clef=bass
C,, D,, E,, F,, | | | C,, D,, E,, F,, |`,
    });
    const doc = parseXml(xml);
    const parts = Array.from(doc.getElementsByTagName('part'));
    expect(parts).toHaveLength(4);

    // Every part must have 4 measures
    for (const p of parts) {
      const partMeasures = Array.from(p.getElementsByTagName('measure'));
      expect(partMeasures).toHaveLength(4);
    }

    // Alto part (part 2): missing measures 3 and 4 are padded with whole-measure rests
    const altoPart = parts[1];
    const altoMeasures = Array.from(altoPart.getElementsByTagName('measure'));
    expect(altoMeasures).toHaveLength(4);
    expect(altoMeasures[2].querySelector('rest[measure="yes"]')).not.toBeNull();
    expect(altoMeasures[3].querySelector('rest[measure="yes"]')).not.toBeNull();
    expect(altoMeasures[2].querySelector('duration')?.textContent).toBe('16');
  });

  it('throws ScoreExportError for empty input', () => {
    expect(() => exportToMusicXml({ abcSource: '   ' })).toThrow(ScoreExportError);
  });

  it('throws ScoreExportError when the score has headers but no musical content', () => {
    expect(() => exportToMusicXml({ abcSource: 'X:1\nT:Empty\nK:C\n' })).toThrow(
      'No musical content was found — nothing to export.',
    );
  });
});

describe('suggestExportFileName', () => {
  it('appends the extension to the sanitized document name', () => {
    expect(suggestExportFileName('My Song', 'musicxml')).toBe('My Song.musicxml');
  });

  it('strips filesystem-hostile characters and collapses whitespace', () => {
    expect(suggestExportFileName('  a/b:c*d? "x"  ', 'musicxml')).toBe('a b c d x.musicxml');
  });

  it('falls back to "score" when nothing usable remains', () => {
    expect(suggestExportFileName('///', 'musicxml')).toBe('score.musicxml');
  });
});
