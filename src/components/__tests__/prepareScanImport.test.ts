import { afterEach, describe, expect, it, vi } from 'vitest';
import abcjs from 'abcjs';
import { prepareScanImport, scanImportError } from '../../utils/prepareScanImport';
import * as xmlParser from '../../utils/xmlParser';
import { exportToMusicXml } from '../../music/musicXmlExport';
import type { ScoreScanResult } from '../../types/scoreScan';
const abc = 'X:1\nT:Title\nM:4/4\nL:1/4\nK:C\nC D E F|]';
const result: ScoreScanResult = { jobId: 'test-id', sourceName: 'Piano.pdf', sourceFolder: '/tmp/import', musicXml: exportToMusicXml({ abcSource: abc }), pages: [1], images: [], warnings: [], elapsedMs: 1 };
afterEach(() => vi.restoreAllMocks());
describe('automatic scan validation', () => {
  it('validates playable notes and renderer compatibility before returning an editable score with provenance', () => {
    const prepared = prepareScanImport(result);
    expect(prepared.title).toBe('Piano');
    expect(prepared.abc).toContain('% Chorale scan job: test-id');
    expect(prepared.abc).toContain('% Chorale scan source: /tmp/import');
  });
  it('uses the workspace invisible-rest triplet compatibility path', () => {
    const source = 'X:1\nT:Triplet\nM:4/4\nL:1/8\nK:E\n(3xAB c6|]';
    vi.spyOn(xmlParser, 'parseMusicXmlForImport').mockReturnValue({ abc: source, warnings: [] });
    expect(prepareScanImport(result).abc).toContain('(3xAB');
  });
  it('rejects renderer and conversion failures while preserving a clear recovery message', () => {
    vi.spyOn(abcjs, 'renderAbc').mockImplementation(() => { throw new Error('Unsupported notation'); });
    expect(() => prepareScanImport(result)).toThrow();
    expect(scanImportError(new Error('Malformed ABC: invalid chord'))).toContain('original and MusicXML are preserved');
  });
});
