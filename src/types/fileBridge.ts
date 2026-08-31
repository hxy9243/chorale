export type SaveTextFileRequest = Readonly<{
  suggestedName: string;
  contents: string;
}>;

export type SaveTextFileResult = Readonly<{
  saved: boolean;
  path?: string;
}>;

export type SavePdfFileRequest = Readonly<{
  suggestedName: string;
  html: string;
  landscape?: boolean;
}>;

export type SavePdfFileResult = Readonly<{
  saved: boolean;
  path?: string;
  initiated?: boolean;
}>;

export type ChoraleFilesBridge = {
  saveTextFile: (request: SaveTextFileRequest) => Promise<SaveTextFileResult>;
  savePdfFile: (request: SavePdfFileRequest) => Promise<SavePdfFileResult>;
};

