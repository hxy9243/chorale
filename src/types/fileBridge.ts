export type SaveTextFileRequest = Readonly<{
  suggestedName: string;
  contents: string;
}>;

export type SaveTextFileResult = Readonly<{
  saved: boolean;
  path?: string;
}>;

export type ChoraleFilesBridge = {
  saveTextFile: (request: SaveTextFileRequest) => Promise<SaveTextFileResult>;
};
