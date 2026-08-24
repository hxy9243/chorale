import { abc2xml } from 'abc-utils';

export class ScoreExportError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ScoreExportError';
    this.cause = cause;
  }
}

export type ScoreExportInput = Readonly<{
  abcSource: string;
  fallbackTitle?: string;
}>;

const HOSTILE_FILENAME_CHARS = /[\\/:*?"<>|]/;

const sanitizeFileName = (name: string): string => (
  name
    .split('')
    .map((character) => {
      if (HOSTILE_FILENAME_CHARS.test(character) || character.charCodeAt(0) < 32) return ' ';
      return character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'score'
);

export const suggestExportFileName = (documentName: string, extension: string): string => (
  `${sanitizeFileName(documentName)}.${extension}`
);

export const exportToMusicXml = ({ abcSource, fallbackTitle }: ScoreExportInput): string => {
  if (!abcSource.trim()) {
    throw new ScoreExportError('The score is empty — nothing to export.');
  }
  let xml: string;
  try {
    const result = abc2xml(abcSource, { fallbackTitle });
    xml = result.xml;
  } catch (error) {
    if (error instanceof ScoreExportError) throw error;
    throw new ScoreExportError(
      'The score could not be converted to MusicXML.',
      error,
    );
  }
  if (!xml.trim()) {
    throw new ScoreExportError('MusicXML conversion produced no output.');
  }
  if (!/<note(?:\s|>)/.test(xml)) {
    throw new ScoreExportError('No musical content was found — nothing to export.');
  }
  return xml;
};
