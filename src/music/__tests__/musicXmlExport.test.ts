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

    expect(lowerStaffNotes).toHaveLength(2);
    expect(lowerStaffNotes.every((note) => note.getElementsByTagName('alter').length === 0)).toBe(true);
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
