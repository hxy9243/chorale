export type FileId = string;
export type ChatThreadId = string;
export type AnnotationId = string;
export type RevisionNumber = number;

export type ScoreAnchor = {
  startMeasure: number;
  endMeasure: number;
  beat?: number;
  voiceId?: string;
  abcOffset?: number;
  playbackSeconds?: number;
  playbackFraction?: number;
  label?: string;
};


export type ScoreInfo = {
  title?: string;
  subtitle?: string;
  composer?: string;
  key?: string;
  meter?: string;
  tempoText?: string;
  measures?: number;
};

export type Annotation = {
  id: AnnotationId;
  kind: 'analysis' | 'harmony' | 'phrase' | 'comment' | 'edit-note';
  label: string;
  body: string;
  anchor: ScoreAnchor;
  createdAt: string;
  updatedAt: string;
  source: 'user' | 'assistant';
};

export type ScoreVersion = {
  revision: RevisionNumber;
  abcSource: string;
  createdAt: string;
  reason: 'import' | 'manual-edit' | 'tool-apply' | 'restore';
};

export type ChatThreadSummary = {
  id: ChatThreadId;
  title: string;
  messageCount: number;
  updatedAt: string;
};

export type FileDocument = {
  id: FileId;
  name: string;
  sourceType: 'musicxml' | 'mxl' | 'xml' | 'abc';
  abcSource: string;
  revision: RevisionNumber;
  scoreInfo: ScoreInfo;
  annotations: Annotation[];
  chats: ChatThreadSummary[];
  versions: ScoreVersion[];
  createdAt: string;
  updatedAt: string;
};


export type BuildResult = {
  fileId: FileId;
  revision: RevisionNumber;
  validation: 'valid' | 'invalid';
  errors: Array<{ message: string; line?: number; column?: number }>;
  renderedTuneCount: number;
  hasPlayback: boolean;
};
