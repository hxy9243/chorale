import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { detectStaves } from './staffDetection';

export type InspectedScorePage = {
  page: number;
  kind: 'music' | 'no-staves' | 'unknown';
  thumbnail?: string;
};

const screenCanvas = (canvas: HTMLCanvasElement, page: number): InspectedScorePage => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Page previews are unavailable.');
  const staves = detectStaves(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  const thumbnail = document.createElement('canvas');
  const thumbnailScale = Math.min(160 / canvas.width, 220 / canvas.height);
  thumbnail.width = Math.max(1, Math.round(canvas.width * thumbnailScale));
  thumbnail.height = Math.max(1, Math.round(canvas.height * thumbnailScale));
  thumbnail.getContext('2d')!.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const dataUrl = thumbnail.toDataURL('image/jpeg', 0.7);
  thumbnail.width = thumbnail.height = 0;
  return { page, kind: staves ? 'music' : 'no-staves', thumbnail: dataUrl };
};

export const inspectScorePages = async (file: File, signal: AbortSignal): Promise<InspectedScorePage[]> => {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a PDF or PNG smaller than 20 MB.');
  signal.throwIfAborted();
  if (/\.png$/i.test(file.name)) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    try {
      signal.throwIfAborted();
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Choose a PNG smaller than 40 megapixels.');
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.ceil(bitmap.width * scale); canvas.height = Math.ceil(bitmap.height * scale);
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return [screenCanvas(canvas, 1)];
    } finally { bitmap.close(); canvas.width = canvas.height = 0; }
  }
  if (!/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF or PNG file.');
  const pdfjs = await import('pdfjs-dist');
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({
    data,
    wasmUrl: new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href,
    useSystemFonts: true,
    // No external fonts, character maps, attachments or document scripts.
    disableFontFace: true,
    stopAtErrors: true,
    maxImageSize: 40_000_000,
  });
  const abort = () => { void task.destroy().catch(() => {}); };
  let timedOut = false;
  const timeout = window.setTimeout(() => { timedOut = true; abort(); }, 60_000);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 60) throw new Error('Page preview supports up to 60 pages. Split this PDF or enter page numbers manually.');
    const pages: InspectedScorePage[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      signal.throwIfAborted();
      const canvas = document.createElement('canvas');
      try {
        const source = await pdf.getPage(page);
        const original = source.getViewport({ scale: 1 });
        const viewport = source.getViewport({ scale: Math.min(3, 1600 / Math.max(original.width, original.height)) });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        // PDF.js can resolve rendering after replacing a failed image with null.
        // Such a page must not be mistaken for a blank cover or text page.
        const operators = await source.getOperatorList();
        const decodedImages: Promise<boolean>[] = [];
        for (let index = 0; index < operators.fnArray.length; index++) {
          if (![pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintImageXObjectRepeat].includes(operators.fnArray[index])) continue;
          const id: unknown = operators.argsArray[index][0];
          if (typeof id !== 'string') continue;
          const objects = id.startsWith('g_') ? source.commonObjs : source.objs;
          // Subscribe before rendering: large images may be released afterwards.
          decodedImages.push(new Promise((resolve) => objects.get(id, (image: unknown) => resolve(Boolean(image)))));
        }
        const [, decoded] = await Promise.all([
          source.render({ canvas, viewport, background: 'white' }).promise,
          Promise.all(decodedImages),
        ]);
        if (decoded.some((image) => !image)) throw new Error('A page image could not be decoded.');
        pages.push(screenCanvas(canvas, page));
        source.cleanup();
      } catch (error) {
        signal.throwIfAborted();
        if (timedOut) throw new Error('Page preview timed out.');
        // A renderer failure must not become a confident non-music decision.
        pages.push({ page, kind: 'unknown' });
        console.warn('Could not inspect score page', page, error instanceof Error ? error.name : 'Error');
      } finally { canvas.width = canvas.height = 0; }
    }
    return pages;
  } catch (error) {
    if (timedOut) throw new Error('Page preview timed out. Enter page numbers manually.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
};
