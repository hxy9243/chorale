import { convertMusicXmlToAbc } from '@educandu/abc-tools';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

/**
 * Extracts MusicXML string from a file buffer, path, or string.
 * Supports plain MusicXML (.xml, .musicxml) and compressed MusicXML (.mxl).
 */
export const extractMusicXmlString = async (input) => {
  let buffer;
  if (typeof input === 'string') {
    if (input.trim().startsWith('<') || input.includes('score-partwise') || input.includes('score-timewise')) {
      return input;
    }
    // Path on disk
    buffer = await readFile(input);
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    buffer = input;
  } else {
    throw new Error('Unsupported MusicXML input type.');
  }

  // Check if zipped MXL archive
  try {
    const zip = await JSZip.loadAsync(buffer);
    const container = zip.file('META-INF/container.xml');
    if (container) {
      const containerText = await container.async('text');
      const rootMatch = containerText.match(/full-path="([^"]+)"/);
      if (rootMatch && zip.file(rootMatch[1])) {
        return await zip.file(rootMatch[1]).async('text');
      }
    }

    // Fallback: find first .xml or .musicxml file in zip
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if ((relativePath.endsWith('.xml') || relativePath.endsWith('.musicxml')) && !relativePath.startsWith('META-INF')) {
        return await file.async('text');
      }
    }
  } catch {
    // Not a zip file, parse as utf-8 string
  }

  return Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(input);
};

/**
 * Converts a MusicXML string or file into ABC notation.
 */
export const musicXmlToAbc = async (input) => {
  const xmlContent = await extractMusicXmlString(input);
  const abcResult = convertMusicXmlToAbc(xmlContent);
  return typeof abcResult === 'string' ? abcResult : (abcResult?.abc || String(abcResult));
};
