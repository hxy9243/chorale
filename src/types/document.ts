import type { RationalDuration } from '../music/rational';

export type { RationalDuration } from '../music/rational';

export type FileId = string;
export type ChatThreadId = string;
export type AnnotationId = string;
export type RevisionNumber = number;

export type MusicalPosition = {
  measure: number;
  offset: RationalDuration;
};

export type MeasureSpan = {
  startMeasure: number;
  endMeasure: number;
};

export type ScoreAnchor = MeasureSpan & {
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

export type AgentProfileId = 'general' | 'harmony' | 'voice-leading' | 'form-phrase';

export type AnnotationKind = 'chord' | 'modulation' | 'voice-leading' | 'explanation';

export type AnnotationBase = {
  id: AnnotationId;
  span: MeasureSpan;
  label: string;
  body: string;
  source: 'user' | 'assistant';
  agentProfiles?: AgentProfileId[];
  createdAt: string;
  updatedAt: string;
};

export type ChordAnnotation = AnnotationBase & {
  kind: 'chord';
  position: MusicalPosition;
  chordSymbol: string;
  romanNumeral?: string;
};

export type RangeAnnotation = AnnotationBase & {
  kind: 'modulation' | 'voice-leading' | 'explanation';
};

export type Annotation = ChordAnnotation | RangeAnnotation;

export type ProposalState =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'outdated'
  | 'unavailable';

export type AnnotationProposal = {
  id: string;
  runId: string;
  documentId: FileId;
  sourceRevision: RevisionNumber;
  state: ProposalState;
  annotation: Annotation;
};

export type ScoreChangeProposal = {
  id: string;
  runId: string;
  documentId: FileId;
  sourceRevision: RevisionNumber;
  state: ProposalState;
  kind?: 'replace-measures' | 'replace-score';
  span: MeasureSpan;
  summary: string;
  /** Selected-range ABC for replace-measures; complete ABC source for replace-score. */
  replacementAbc: string;
  validation: { status: 'valid' | 'invalid'; errors: string[] };
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

export type EditCategory = 'origin' | 'metadata' | 'body' | 'annotation';
export type EditActionType = 'add' | 'edit' | 'delete' | 'initial';

export type EditHistoryEntry = {
  id: string;
  revision: RevisionNumber;
  timestamp: string;
  category: EditCategory;
  actionType: EditActionType;
  summary: string;
  details?: string;
  abcSource: string;
  scoreInfo: ScoreInfo;
  annotations: Annotation[];
  annotationKind?: AnnotationKind;
  metadataField?: string;
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
  history?: EditHistoryEntry[];
  historyIndex?: number;
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
