import type {
  ChoraleFilesBridge,
  SaveTextFileRequest,
  SaveTextFileResult,
} from '../types/fileBridge';

export type { ChoraleFilesBridge, SaveTextFileRequest, SaveTextFileResult };

export const saveTextFile = async (
  request: SaveTextFileRequest,
): Promise<SaveTextFileResult> => {
  const bridge: ChoraleFilesBridge | undefined = window.choraleFiles;
  if (bridge) {
    return bridge.saveTextFile(request);
  }

  const blob = new Blob([request.contents], { type: 'application/vnd.recordare.musicxml+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = request.suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { saved: true };
};
