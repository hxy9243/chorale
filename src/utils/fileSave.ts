import type {
  ChoraleFilesBridge,
  SavePdfFileRequest,
  SavePdfFileResult,
  SaveTextFileRequest,
  SaveTextFileResult,
} from '../types/fileBridge';

export type {
  ChoraleFilesBridge,
  SavePdfFileRequest,
  SavePdfFileResult,
  SaveTextFileRequest,
  SaveTextFileResult,
};

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

export const savePdfFile = async (
  request: SavePdfFileRequest,
): Promise<SavePdfFileResult> => {
  const bridge: ChoraleFilesBridge | undefined = window.choraleFiles;
  if (bridge && typeof bridge.savePdfFile === 'function') {
    return bridge.savePdfFile(request);
  }


  // Web fallback: use hidden iframe to trigger browser print
  if (typeof document !== 'undefined') {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(request.html);
        doc.close();
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        return { saved: false, initiated: true };
      }
    } catch {
      return { saved: false };
    } finally {
      setTimeout(() => {
        iframe.remove();
      }, 1000);
    }
  }

  return { saved: false };
};

