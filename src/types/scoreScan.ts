export type ScoreScanRequest = {
  name: string;
  bytes: ArrayBuffer;
  pages: string;
};

export type ScoreScanResult = {
  jobId: string;
  sourceName: string;
  sourceFolder: string;
  musicXml: string;
  pages: number[];
  images: { page: number; dataUrl: string }[];
  warnings: string[];
  elapsedMs: number;
};

export type ScoreScanBridge = {
  status(): Promise<{ available: boolean; message: string }>;
  scan(request: ScoreScanRequest): Promise<ScoreScanResult>;
  cancel(): Promise<void>;
  openSourceFolder(jobId: string): Promise<void>;
};
