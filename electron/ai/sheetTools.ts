import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type { AgentProfileId, AnnotationKind } from '../../src/types/document';
import type { ScoreSnapshot } from '../../src/music/scoreSnapshot';
import { selectAnalysisProfiles } from './agentProfiles';

export type SheetToolErrorCode =
  | 'profile_required'
  | 'invalid_range'
  | 'range_too_large'
  | 'measure_not_found';

export class SheetToolValidationError extends Error {
  readonly code: SheetToolErrorCode;
  readonly details: Readonly<Record<string, number | string>>;

  constructor(
    code: SheetToolErrorCode,
    message: string,
    details: Readonly<Record<string, number | string>> = {},
  ) {
    super(JSON.stringify({ error: { code, message, details } }));
    this.name = 'SheetToolValidationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export type SheetToolRunState = {
  selectedProfiles: readonly AgentProfileId[];
};

export type CreateSheetToolsOptions = Readonly<{
  onProfileRoute?: (profiles: readonly AgentProfileId[]) => void;
}>;

const ProfileIdSchema = Type.Union([
  Type.Literal('general'),
  Type.Literal('harmony'),
  Type.Literal('voice-leading'),
  Type.Literal('form-phrase'),
]);

const AnnotationKindSchema = Type.Union([
  Type.Literal('chord'),
  Type.Literal('modulation'),
  Type.Literal('voice-leading'),
  Type.Literal('explanation'),
]);

const jsonResult = <Details>(details: Details) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(details) }],
  details,
});

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('The response was stopped.', 'AbortError');
};

export const createSheetTools = (
  snapshot: ScoreSnapshot,
  options: CreateSheetToolsOptions = {},
): Readonly<{ tools: readonly AgentTool[]; state: SheetToolRunState }> => {
  const state: SheetToolRunState = { selectedProfiles: Object.freeze([]) };

  const requireProfile = () => {
    if (state.selectedProfiles.length === 0) {
      throw new SheetToolValidationError(
        'profile_required',
        'Call select_analysis_profile before reading passage-specific score data.',
      );
    }
  };

  const selectProfileTool: AgentTool<typeof SelectProfileParameters> = {
    name: 'select_analysis_profile',
    label: 'Select analysis profile',
    description: 'Select one or more predefined analysis profiles before inspecting the score.',
    parameters: SelectProfileParameters,
    executionMode: 'sequential',
    execute: async (_toolCallId, params, signal) => {
      throwIfAborted(signal);
      const profiles = selectAnalysisProfiles(params.profiles);
      state.selectedProfiles = Object.freeze(profiles.map(({ id }) => id));
      options.onProfileRoute?.(state.selectedProfiles);
      return jsonResult({
        profiles: profiles.map(({ id, name, prompt }) => ({ id, name, prompt })),
      });
    },
  };

  const getScoreSummaryTool: AgentTool<typeof EmptyParameters> = {
    name: 'get_score_summary',
    label: 'Read score summary',
    description: 'Read score metadata, written-measure count, and declared voices.',
    parameters: EmptyParameters,
    execute: async (_toolCallId, _params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      return jsonResult({
        title: snapshot.title,
        composer: snapshot.composer,
        key: snapshot.key,
        meter: snapshot.meter,
        tempoText: snapshot.tempoText,
        totalMeasures: snapshot.measureIndex.size,
        voices: snapshot.voices,
      });
    },
  };

  const readMeasureRangeTool: AgentTool<typeof ReadMeasureRangeParameters> = {
    name: 'read_measure_range',
    label: 'Read measure range',
    description: 'Read up to 32 continuous written measures with normalized events and ABC slices.',
    parameters: ReadMeasureRangeParameters,
    execute: async (_toolCallId, params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      const { startMeasure, endMeasure } = params;
      if (endMeasure < startMeasure) {
        throw new SheetToolValidationError('invalid_range', 'endMeasure must be at least startMeasure.', {
          startMeasure,
          endMeasure,
        });
      }
      if (endMeasure - startMeasure + 1 > 32) {
        throw new SheetToolValidationError('range_too_large', 'Read at most 32 continuous measures.', {
          startMeasure,
          endMeasure,
          maximumMeasures: 32,
        });
      }

      const measures = [];
      for (let measureNumber = startMeasure; measureNumber <= endMeasure; measureNumber += 1) {
        const measure = snapshot.measureIndex.get(measureNumber);
        if (!measure) {
          throw new SheetToolValidationError('measure_not_found', 'Requested measure is outside the score.', {
            measure: measureNumber,
            totalMeasures: snapshot.measureIndex.size,
          });
        }
        measures.push(measure);
      }
      return jsonResult({ startMeasure, endMeasure, measures });
    },
  };

  const getAnnotationsTool: AgentTool<typeof GetAnnotationsParameters> = {
    name: 'get_annotations',
    label: 'Read annotations',
    description: 'Read canonical annotations intersecting an optional written-measure range.',
    parameters: GetAnnotationsParameters,
    execute: async (_toolCallId, params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      const startMeasure = params.startMeasure ?? 1;
      const endMeasure = params.endMeasure ?? snapshot.measureIndex.size;
      if (endMeasure < startMeasure) {
        throw new SheetToolValidationError('invalid_range', 'endMeasure must be at least startMeasure.', {
          startMeasure,
          endMeasure,
        });
      }

      const kinds = params.kinds as AnnotationKind[] | undefined;
      const annotations = new Map<string, ScoreSnapshot['annotations'][number]>();
      for (let measureNumber = startMeasure; measureNumber <= endMeasure; measureNumber += 1) {
        if (!snapshot.measureIndex.has(measureNumber)) {
          throw new SheetToolValidationError('measure_not_found', 'Requested measure is outside the score.', {
            measure: measureNumber,
            totalMeasures: snapshot.measureIndex.size,
          });
        }
        for (const annotation of snapshot.annotationIndex.get(measureNumber) || []) {
          if (!kinds || kinds.includes(annotation.kind)) annotations.set(annotation.id, annotation);
        }
      }
      return jsonResult({ annotations: [...annotations.values()] });
    },
  };

  return Object.freeze({
    state,
    tools: Object.freeze([
      selectProfileTool,
      getScoreSummaryTool,
      readMeasureRangeTool,
      getAnnotationsTool,
    ]),
  });
};

const SelectProfileParameters = Type.Object({
  profiles: Type.Array(ProfileIdSchema, { minItems: 1, maxItems: 4 }),
}, { additionalProperties: false });

const EmptyParameters = Type.Object({}, { additionalProperties: false });

const ReadMeasureRangeParameters = Type.Object({
  startMeasure: Type.Integer({ minimum: 1 }),
  endMeasure: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });

const GetAnnotationsParameters = Type.Object({
  startMeasure: Type.Optional(Type.Integer({ minimum: 1 })),
  endMeasure: Type.Optional(Type.Integer({ minimum: 1 })),
  kinds: Type.Optional(Type.Array(AnnotationKindSchema, { minItems: 1, maxItems: 4 })),
}, { additionalProperties: false });
