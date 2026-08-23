import { useCallback, useState } from 'react';
import { exportToMusicXml, suggestExportFileName } from '../music/musicXmlExport';
import { saveTextFile } from '../utils/fileSave';
import type { FileDocument } from '../types/document';

export type ScoreExportStatus = 'idle' | 'exporting' | 'success' | 'error';

export type ScoreExportState = Readonly<{
  status: ScoreExportStatus;
  message: string | null;
}>;

const INITIAL_STATE: ScoreExportState = { status: 'idle', message: null };

export const useScoreExport = () => {
  const [state, setState] = useState<ScoreExportState>(INITIAL_STATE);

  const exportDocument = useCallback(async (
    document: FileDocument,
    format: 'musicxml' = 'musicxml',
  ) => {
    setState({ status: 'exporting', message: null });
    try {
      const contents = exportToMusicXml({
        abcSource: document.abcSource,
        fallbackTitle: document.scoreInfo.title || document.name,
      });
      const suggestedName = suggestExportFileName(document.name, format);
      const result = await saveTextFile({ suggestedName, contents });
      if (result.saved) {
        setState({ status: 'success', message: result.path ?? suggestedName });
      } else {
        setState(INITIAL_STATE);
      }
      return result;
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Export failed.',
      });
      return { saved: false };
    }
  }, []);

  const dismissStatus = useCallback(() => setState(INITIAL_STATE), []);

  return { exportState: state, exportDocument, dismissStatus };
};
