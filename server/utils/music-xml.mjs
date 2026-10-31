import { convertMusicXmlToAbc } from '@educandu/abc-tools';
import JSZip from 'jszip';
import { DOMParser } from 'linkedom/worker';
import { SaxesParser } from 'saxes';
import { readFile } from 'node:fs/promises';

/**
 * Extracts MusicXML string from a file buffer, path, or string.
 * Supports plain MusicXML (.xml, .musicxml) and compressed MusicXML (.mxl).
 */
export const extractMusicXmlString = async (input) => {
  let buffer;
  if (typeof input === 'string') {
    if (input.trim().startsWith('<')) {
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
      const rootPath = new DOMParser().parseFromString(containerText, 'text/xml')
        .getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
      if (rootPath && zip.file(rootPath)) {
        return await zip.file(rootPath).async('text');
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

  return Buffer.from(buffer).toString('utf8');
};

/**
 * Converts a MusicXML string or file into ABC notation.
 */
export const musicXmlToAbc = async (input) => {
  const xmlContent = await extractMusicXmlString(input);
  // LinkeDOM supplies query selectors for the converter but recovers malformed
  // XML. Reject truncated or mismatched input before that recovery can hide it.
  new SaxesParser({ xmlns: true }).write(xmlContent).close();
  const root = new DOMParser().parseFromString(xmlContent, 'text/xml').documentElement;
  if (!['score-partwise', 'score-timewise'].includes(root?.localName)) {
    throw new Error('Expected a MusicXML score document.');
  }
  // abc-tools' public converter expects window.DOMParser. Keep its browser
  // adapter strictly synchronous and restore the host's globals even on error.
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { value: { DOMParser }, configurable: true });
    const converted = convertMusicXmlToAbc(xmlContent);
    if (typeof converted.result !== 'string' || !converted.result.trim()) {
      throw new Error('MusicXML conversion did not produce ABC notation.');
    }
    return converted.result;
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  }
};
