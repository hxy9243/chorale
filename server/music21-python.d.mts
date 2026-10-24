export function analyzeMusic21Python(payload: {
  abcSource: string; code: string; startMeasure?: number; endMeasure?: number;
  documentId?: string; revision?: number;
}, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
