export type ScoreScanEngine = 'copisteria' | 'audiveris';

export type ScoreScanStatus = {
  available: boolean;
  message: string;
  engines?: { id: ScoreScanEngine; available: boolean; message: string }[];
};

export type ScoreScanRequest = {
  name: string;
  bytes: ArrayBuffer;
  pages: string;
  engine?: ScoreScanEngine;
};

export type ScoreScanResult = {
  engine?: ScoreScanEngine;
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
  status(): Promise<ScoreScanStatus>;
  scan(request: ScoreScanRequest): Promise<ScoreScanResult>;
  start(request: ScoreScanRequest): Promise<ScoreImportJob>;
  listJobs(): Promise<ScoreImportJob[]>;
  result(jobId: string): Promise<ScoreScanResult>;
  fail(jobId: string, message: string): Promise<void>;
  dismiss(jobId: string): Promise<void>;
  cancel(jobId?: string): Promise<void>;
  openSourceFolder(jobId: string): Promise<void>;
};

export type ScoreImportJob = {
  id: string;
  title: string;
  sourceName: string;
  engine: ScoreScanEngine;
  pages: number[];
  state: 'queued' | 'importing' | 'recognized' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  error?: string;
  sourceAvailable: boolean;
};
