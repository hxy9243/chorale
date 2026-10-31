import type { AISelection } from '../agent/aiTypes';
import type { MusicContextSnapshot } from '../agent/types';
import type { Annotation, MusicalPosition } from '../types/document';

export const ANALYSIS_LENSES = ['chords', 'modulation', 'cadences', 'non-chord-tones', 'voice-leading'] as const;
export type AnalysisLens = typeof ANALYSIS_LENSES[number];
export type AnalysisPreferences = { lenses: AnalysisLens[]; autoRefresh: boolean };
export type AnalysisDisplay = { labels: 'both' | 'symbols' | 'roman'; functionColors: boolean };
export const DEFAULT_ANALYSIS_PREFERENCES: AnalysisPreferences = { lenses: [], autoRefresh: true };
export type AnalysisEvidence = MusicalPosition & { voiceId: string };
export type AnalysisFinding = { lens: AnalysisLens; annotation: Annotation; evidence: AnalysisEvidence[] };
export type AnalysisResult = {
  version: 1;
  fingerprint: string;
  selection: AISelection;
  modelName: string;
  providerName: string;
  revision: number;
  updatedAt: string;
  coverage: Partial<Record<AnalysisLens, number[]>>;
  findings: AnalysisFinding[];
  summaries: string[];
  diagnostics: string[];
  reconciled?: boolean;
};
export type AnalysisState = {
  documentId: string;
  preferences: AnalysisPreferences;
  status: 'idle' | 'running' | 'current' | 'partial' | 'stopped' | 'error';
  runId?: string;
  fingerprint?: string;
  totalMeasures: number;
  completedMeasures: number;
  message?: string;
  result?: AnalysisResult;
};
export type AnalysisRequest = { context: MusicContextSnapshot; force?: boolean };
export const isAnalysisLens = (value: unknown): value is AnalysisLens => (
  typeof value === 'string' && ANALYSIS_LENSES.includes(value as AnalysisLens)
);
export const validateAnalysisPreferences = (value: unknown): AnalysisPreferences => {
  if (!value || typeof value !== 'object') throw new Error('Invalid analysis preferences.');
  const input = value as AnalysisPreferences;
  if (!Array.isArray(input.lenses) || input.lenses.length > ANALYSIS_LENSES.length
    || !input.lenses.every(isAnalysisLens) || typeof input.autoRefresh !== 'boolean') {
    throw new Error('Invalid analysis preferences.');
  }
  return { lenses: [...new Set(input.lenses)].sort(), autoRefresh: input.autoRefresh };
};
