import { describe, expect, it } from 'vitest';
import { abc2xml } from 'abc-utils';
import { decomposeDuration, normalizeMusicXml } from '../musicXmlNormalization';

const parseXml = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('decomposeDuration', () => {
  it('returns empty array for non-positive ticks or divisions', () => {
    expect(decomposeDuration(4, 0)).toEqual([]);
    expect(decomposeDuration(4, -5)).toEqual([]);
    expect(decomposeDuration(0, 8)).toEqual([]);
  });

  it('decomposes standard note durations without dots', () => {
    // divisions = 4 (quarter note = 4 ticks)
    expect(decomposeDuration(4, 16)).toEqual([{ type: 'whole', ticks: 16, dots: 0 }]);
    expect(decomposeDuration(4, 8)).toEqual([{ type: 'half', ticks: 8, dots: 0 }]);
    expect(decomposeDuration(4, 4)).toEqual([{ type: 'quarter', ticks: 4, dots: 0 }]);
    expect(decomposeDuration(4, 2)).toEqual([{ type: 'eighth', ticks: 2, dots: 0 }]);
    expect(decomposeDuration(4, 1)).toEqual([{ type: '16th', ticks: 1, dots: 0 }]);
  });

  it('decomposes dotted durations', () => {
    // 12 ticks in divisions=4 is 3 quarters (dotted half)
    expect(decomposeDuration(4, 12)).toEqual([{ type: 'half', ticks: 12, dots: 1 }]);
    // 6 ticks in divisions=4 is 1.5 quarters (dotted quarter)
    expect(decomposeDuration(4, 6)).toEqual([{ type: 'quarter', ticks: 6, dots: 1 }]);
  });

  it('decomposes composite durations into multiple standard rests', () => {
    // 10 ticks in divisions=4 -> half (8) + eighth (2)
    expect(decomposeDuration(4, 10)).toEqual([
      { type: 'half', ticks: 8, dots: 0 },
      { type: 'eighth', ticks: 2, dots: 0 },
    ]);
  });
});

describe('normalizeMusicXml', () => {
  it('returns unchanged string for empty or non-xml input', () => {
    expect(normalizeMusicXml('')).toBe('');
    expect(normalizeMusicXml('   ')).toBe('   ');
    expect(normalizeMusicXml('<invalid><xml')).toBe('<invalid><xml');
  });

  it('preserves an already complete single-voice measure', () => {
    const rawXml = abc2xml('X:1\nM:4/4\nL:1/4\nK:C\nC D E F|]').xml;
    const normalized = normalizeMusicXml(rawXml);
    const doc = parseXml(normalized);

    const notes = Array.from(doc.getElementsByTagName('note'));
    expect(notes).toHaveLength(4);
    expect(notes.every((n) => n.querySelector('pitch') !== null)).toBe(true);
  });

  it('pads empty measures in silent staves with whole-measure rests', () => {
    const rawXml = abc2xml(`X:1
T:Sparse 3-Staff Score
M:3/4
L:1/4
%%score { 1 | 2 | 3 }
V:1
C D E | F G A | B c d | e f g |
V:2
C D E | F G A | | e f g |
V:3 clef=bass
C,, D,, E,, | | | e,, f,, g,, |`).xml;

    const normalized = normalizeMusicXml(rawXml);
    const doc = parseXml(normalized);
    const measures = Array.from(doc.getElementsByTagName('measure'));
    expect(measures).toHaveLength(4);

    // Measure 3: Staff 3 must have a whole-measure rest of duration 12
    const m3 = measures[2];
    const m3Notes = Array.from(m3.getElementsByTagName('note'));
    const staff3Rest = m3Notes.find(
      (n) => n.getElementsByTagName('staff')[0]?.textContent === '3'
        && n.querySelector('rest[measure="yes"]') !== null,
    );
    expect(staff3Rest).toBeDefined();
    expect(staff3Rest?.querySelector('duration')?.textContent).toBe('12');

    // Measure 4: Staves 2 and 3 must have whole-measure rests
    const m4 = measures[3];
    const m4Notes = Array.from(m4.getElementsByTagName('note'));
    const staff2Rest = m4Notes.find(
      (n) => n.getElementsByTagName('staff')[0]?.textContent === '2'
        && n.querySelector('rest[measure="yes"]') !== null,
    );
    const staff3RestM4 = m4Notes.find(
      (n) => n.getElementsByTagName('staff')[0]?.textContent === '3'
        && n.querySelector('rest[measure="yes"]') !== null,
    );
    expect(staff2Rest).toBeDefined();
    expect(staff3RestM4).toBeDefined();
    expect(staff2Rest?.querySelector('duration')?.textContent).toBe('12');
    expect(staff3RestM4?.querySelector('duration')?.textContent).toBe('12');
  });

  it('pads partially filled measures with durational rests to complete meter duration', () => {
    const rawXml = abc2xml(`X:1
T:Partial Voice Score
M:3/4
L:1/4
%%score { 1 | 2 }
V:1
C D E | F G A |
V:2
C | F G |`).xml;

    const normalized = normalizeMusicXml(rawXml);
    const doc = parseXml(normalized);
    const measures = Array.from(doc.getElementsByTagName('measure'));

    // Measure 1: Voice 2 had only 1 quarter note (4 ticks). Needs 2 quarters (8 ticks -> half rest)
    const m1Notes = Array.from(measures[0].getElementsByTagName('note'));
    const voice2RestsM1 = m1Notes.filter(
      (n) => n.getElementsByTagName('voice')[0]?.textContent === '2'
        && n.querySelector('rest') !== null,
    );
    expect(voice2RestsM1).toHaveLength(1);
    expect(voice2RestsM1[0].querySelector('type')?.textContent).toBe('half');
    expect(voice2RestsM1[0].querySelector('duration')?.textContent).toBe('8');

    // Measure 2: Voice 2 had 2 quarter notes (8 ticks). Needs 1 quarter (4 ticks -> quarter rest)
    const m2Notes = Array.from(measures[1].getElementsByTagName('note'));
    const voice2RestsM2 = m2Notes.filter(
      (n) => n.getElementsByTagName('voice')[0]?.textContent === '2'
        && n.querySelector('rest') !== null,
    );
    expect(voice2RestsM2).toHaveLength(1);
    expect(voice2RestsM2[0].querySelector('type')?.textContent).toBe('quarter');
    expect(voice2RestsM2[0].querySelector('duration')?.textContent).toBe('4');
  });

  it('correctly tracks meter changes across measures', () => {
    const rawXml = abc2xml(`X:1
T:Meter Change Score
M:4/4
L:1/4
%%score { 1 | 2 }
V:1
C D E F | [M:3/4] G A B | [M:2/4] c d |
V:2 clef=bass
C,2 | | G,2 |`).xml;

    const normalized = normalizeMusicXml(rawXml);
    const doc = parseXml(normalized);
    const measures = Array.from(doc.getElementsByTagName('measure'));
    expect(measures).toHaveLength(3);

    // Measure 1 (4/4): Voice 2 has 8 ticks -> needs half rest of 8 ticks
    const m1V2Rests = Array.from(measures[0].getElementsByTagName('note')).filter(
      (n) => n.getElementsByTagName('voice')[0]?.textContent === '2' && n.querySelector('rest'),
    );
    expect(m1V2Rests).toHaveLength(1);
    expect(m1V2Rests[0].querySelector('duration')?.textContent).toBe('8');

    // Measure 2 (3/4): Voice 2 has 8 ticks -> needs quarter rest of 4 ticks
    const m2V2Rests = Array.from(measures[1].getElementsByTagName('note')).filter(
      (n) => n.getElementsByTagName('voice')[0]?.textContent === '2' && n.querySelector('rest'),
    );
    expect(m2V2Rests).toHaveLength(1);
    expect(m2V2Rests[0].querySelector('duration')?.textContent).toBe('4');

    // Measure 3 (2/4): Voice 2 is empty -> needs whole-measure rest of 8 ticks
    const m3V2Rests = Array.from(measures[2].getElementsByTagName('note')).filter(
      (n) => n.getElementsByTagName('voice')[0]?.textContent === '2' && n.querySelector('rest[measure="yes"]'),
    );
    expect(m3V2Rests).toHaveLength(1);
    expect(m3V2Rests[0].querySelector('duration')?.textContent).toBe('8');
  });

  it('properly sequences backups between voices and removes trailing backups', () => {
    const rawXml = abc2xml(`X:1
M:3/4
L:1/4
%%score { 1 | 2 }
V:1
C D E | F G A |
V:2
C D E | |`).xml;

    const normalized = normalizeMusicXml(rawXml);
    const doc = parseXml(normalized);
    const measures = Array.from(doc.getElementsByTagName('measure'));

    for (const m of measures) {
      // Backups should only exist between voice 1 and voice 2
      const backups = Array.from(m.getElementsByTagName('backup'));
      expect(backups).toHaveLength(1);
      expect(backups[0].querySelector('duration')?.textContent).toBe('12');

      // The last element in the measure should not be a backup
      const lastChild = m.lastElementChild;
      expect(lastChild?.tagName.toLowerCase()).not.toBe('backup');
    }
  });

  it('preserves chord notes without counting them towards voice duration', () => {
    const rawXml = abc2xml(`X:1
M:4/4
L:1/4
%%score { 1 | 2 }
V:1
[CEG]4 |
V:2
C4 |`).xml;

    const normalized = normalizeMusicXml(rawXml);
    const doc = parseXml(normalized);
    const m1 = doc.getElementsByTagName('measure')[0];
    const notes = Array.from(m1.getElementsByTagName('note'));

    // Voice 1 has 3 notes for the triad [CEG], 2 have <chord/>
    const v1Notes = notes.filter((n) => n.getElementsByTagName('voice')[0]?.textContent === '1');
    expect(v1Notes).toHaveLength(3);
    const chordNotes = v1Notes.filter((n) => n.querySelector('chord') !== null);
    expect(chordNotes).toHaveLength(2);

    // No rests should have been added since [CEG]4 is 16 ticks (full 4/4 measure)
    const rests = notes.filter((n) => n.querySelector('rest') !== null);
    expect(rests).toHaveLength(0);
  });
});
