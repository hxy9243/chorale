import { convertMusicXmlToAbc } from '@educandu/abc-tools';
import JSZip from 'jszip';

/**
 * Ensures DOMParser is available (polyfilled for Vitest/Node environments if needed)
 */
function getDOMParser(): DOMParser {
  if (typeof window !== 'undefined' && window.DOMParser) {
    return new window.DOMParser();
  }
  // If in Node/test environment without global window
  if (typeof globalThis !== 'undefined' && (globalThis as any).DOMParser) {
    return new (globalThis as any).DOMParser();
  }
  throw new Error('DOMParser is not available in the current environment.');
}

/**
 * Extract raw MusicXML string from a file buffer or text.
 * Handles both plain XML (.xml, .musicxml) and zipped MusicXML (.mxl).
 */
export async function extractMusicXml(fileOrBuffer: File | ArrayBuffer | string): Promise<string> {
  if (typeof fileOrBuffer === 'string') {
    return fileOrBuffer;
  }

  const arrayBuffer = fileOrBuffer instanceof File
    ? await fileOrBuffer.arrayBuffer()
    : fileOrBuffer;

  // Try unzipping as MXL archive
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // 1. Look for META-INF/container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (containerFile) {
      const containerXml = await containerFile.async('text');
      const parser = getDOMParser();
      const doc = parser.parseFromString(containerXml, 'text/xml');
      const rootfile = doc.querySelector('rootfile');
      const fullPath = rootfile?.getAttribute('full-path');

      if (fullPath && zip.file(fullPath)) {
        return await zip.file(fullPath)!.async('text');
      }
    }

    // 2. Fallback: find any file ending with .xml in the zip root or subfolder
    const xmlFiles = Object.keys(zip.files).filter(
      (path) => (path.endsWith('.xml') || path.endsWith('.musicxml')) && !path.startsWith('META-INF')
    );

    if (xmlFiles.length > 0) {
      return await zip.file(xmlFiles[0])!.async('text');
    }
  } catch (_e) {
    // If not a valid zip archive, attempt parsing as plain text string
  }

  // Fallback to text decoding
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(arrayBuffer);
}

/**
 * Converts MusicXML string into ABC notation string.
 */
export function parseMusicXmlToAbc(xmlContent: string): string {
  if (!xmlContent || !xmlContent.trim()) {
    throw new Error('Empty MusicXML content provided.');
  }

  // Polyfill window.DOMParser if running in Node environment during Vitest runs
  if (typeof window !== 'undefined' && !window.DOMParser && (globalThis as any).DOMParser) {
    window.DOMParser = (globalThis as any).DOMParser;
  }

  try {
    const output: any = convertMusicXmlToAbc(xmlContent);
    const abc = typeof output === 'string' ? output : output?.result || String(output || '');

    if (!abc || !abc.trim()) {
      return '% Error converting MusicXML to ABC notation.';
    }
    return abc;
  } catch (error: any) {
    console.error('MusicXML to ABC conversion error:', error);
    throw new Error(`Failed to convert MusicXML to ABC: ${error?.message || error}`);
  }
}
