declare module '@educandu/abc-tools' {
  export function convertMusicXmlToAbc(xmlString: string, options?: any): { result: string; warningMessage?: string } | string;
  export function transposeAbc(abcString: string, steps: number): string;
}
