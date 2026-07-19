import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { extractMusicXml, parseMusicXmlToAbc } from '../xmlParser';

describe('xmlParser utils', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

  describe('extractMusicXml', () => {
    it('should return string unchanged if passed a plain text string', async () => {
      const result = await extractMusicXml(sampleXml);
      expect(result).toBe(sampleXml);
    });

    it('should extract MusicXML from a compressed .mxl JSZip buffer', async () => {
      const zip = new JSZip();
      const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`;
      zip.folder('META-INF')?.file('container.xml', containerXml);
      zip.file('score.xml', sampleXml);

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const extracted = await extractMusicXml(buffer);

      expect(extracted).toContain('<score-partwise');
      expect(extracted).toContain('<step>C</step>');
    });
  });

  describe('parseMusicXmlToAbc', () => {
    it('should convert valid MusicXML into ABC string format', () => {
      const abc = parseMusicXmlToAbc(sampleXml);
      expect(abc).toBeDefined();
      expect(abc.length).toBeGreaterThan(0);
      expect(abc).toMatch(/X:|T:|M:|K:/);
    });

    it('should throw an error for empty MusicXML string', () => {
      expect(() => parseMusicXmlToAbc('')).toThrow('Empty MusicXML content provided.');
    });
  });
});
