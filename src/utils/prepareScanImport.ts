import type { ScoreScanResult } from '../types/scoreScan';
import { extractScore } from '../music/scoreSnapshot';
import { parseMusicXmlForImport } from './xmlParser';
import { parseAbcHeaderMetadata, updateAbcHeaderMetadata } from './abcMetadata';
import { renderPlaybackScore } from './abcAudio';

export const prepareScanImport = (result: ScoreScanResult) => {
  const converted = parseMusicXmlForImport(result.musicXml);
  const metadata = parseAbcHeaderMetadata(converted.abc);
  const fallback = result.sourceName.replace(/\.(pdf|png)$/i, '');
  const title = !metadata.title || /^(Title|Untitled(?: score)?|source)$/i.test(metadata.title) ? fallback : metadata.title;
  const abc = updateAbcHeaderMetadata(converted.abc, { title });
  const score = extractScore(abc);
  const notes = score.measures.flatMap((measure) => measure.events).reduce((sum, event) => sum + (event.type === 'note' ? event.pitches?.length || 0 : 0), 0);
  if (!notes) throw new Error('No playable notes were recognized. Your original file is preserved.');
  const rendered = renderPlaybackScore(document.createElement('div'), abc);
  if (!rendered.length) throw new Error('The recognized score could not be displayed. Your original and MusicXML are preserved.');
  const folder = result.sourceFolder.replace(/[\r\n]/g, ' ');
  const warnings = [...result.warnings, ...converted.warnings].map((warning) => `% Scan warning: ${warning.replace(/[\r\n]/g, ' ')}`).join('\n');
  return { title, abc: `% Chorale scan job: ${result.jobId}\n% Chorale scan source: ${folder}\n${warnings ? warnings + '\n' : ''}${abc}` };
};

export const scanImportError = (failure: unknown): string => {
  const message = failure instanceof Error ? failure.message : 'Import failed. Please try another page.';
  return (/Malformed ABC|Failed to convert MusicXML/.test(message)
    ? 'The recognized music could not be converted. Your original and MusicXML are preserved in the source folder.'
    : message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
};
