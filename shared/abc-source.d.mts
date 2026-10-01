export function isNotationOffset(abc: string, offset: number): boolean;
export function prepareAbcWithMap(abc: string): {
  prepared: string;
  toOriginalOffset: (offset: number) => number;
};
export function createVoiceResolver(abc: string, toOriginalOffset?: (offset: number) => number):
  (voice: readonly { el_type?: string; startChar?: number }[], slot: number) => string;
export function collectVoiceContextFields(abc: string): {
  headerKey: string;
  fields: { type: 'voice' | 'key'; voiceId: string; value: string; offset: number }[];
};

export function stripAbcComment(line: string): string;
