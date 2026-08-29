import { randomUUID } from 'node:crypto';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type {
  AgentProfileId,
  AnnotationKind,
  AnnotationProposal,
  ScoreAnchor,
  ScoreChangeProposal,
} from '../../src/types/document';
import {
  describeKeySignature,
  type ScoreSnapshot,
} from '../../src/music/scoreSnapshot';
import { validateAnnotation } from '../../src/music/documentSchema';
import { selectAnalysisProfiles } from './agentProfiles';
import {
  applyMeasureMutation,
  applyWholeScoreReplacement,
} from '../../src/music/scoreDrafting';

export type SheetToolErrorCode =
  | 'profile_required'
  | 'invalid_range'
  | 'range_too_large'
  | 'measure_not_found'
  | 'invalid_proposals'
  | 'proposal_limit'
  | 'range_not_read'
  | 'invalid_replacement';

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
  proposedCount: number;
  scoreProposalCount: number;
  readRanges: Set<string>;
  readMeasures: Set<number>;
};

export type CreateSheetToolsOptions = Readonly<{
  onProfileRoute?: (profiles: readonly AgentProfileId[]) => void;
  onProposalCreated?: (proposal: AnnotationProposal) => void;
  onScoreProposalCreated?: (proposal: ScoreChangeProposal) => void;
  selection?: Readonly<ScoreAnchor>;
  runId?: string;
  createId?: () => string;
  now?: () => string;
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
  const state: SheetToolRunState = {
    selectedProfiles: Object.freeze([]),
    proposedCount: 0,
    scoreProposalCount: 0,
    readRanges: new Set<string>(),
    readMeasures: new Set<number>(),
  };
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

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
    description: 'Read score metadata, key signature accidentals, written-measure count, and declared voices.',
    parameters: EmptyParameters,
    execute: async (_toolCallId, _params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      const keyInfo = describeKeySignature(snapshot.key);
      return jsonResult({
        title: snapshot.title,
        composer: snapshot.composer,
        key: snapshot.key,
        keySignature: keyInfo.description,
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
    description: 'Read continuous written measures as ABC slices with active key and meter context.',
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

      const startMeasureData = snapshot.measureIndex.get(startMeasure);
      const measures = [];
      for (let measureNumber = startMeasure; measureNumber <= endMeasure; measureNumber += 1) {
        const measure = snapshot.measureIndex.get(measureNumber);
        if (!measure) {
          throw new SheetToolValidationError('measure_not_found', 'Requested measure is outside the score.', {
            measure: measureNumber,
            totalMeasures: snapshot.measureIndex.size,
          });
        }
        measures.push({
          measureNumber: measure.measureNumber,
          abcSlice: measure.abcSlice,
          activeKey: measure.activeKey,
          activeMeter: measure.activeMeter,
          ...(measure.keyChange ? { keyChange: measure.keyChange } : {}),
          ...(measure.meterChange ? { meterChange: measure.meterChange } : {}),
        });
        state.readMeasures.add(measureNumber);
      }
      state.readRanges.add(`${startMeasure}:${endMeasure}`);
      return jsonResult({
        startMeasure,
        endMeasure,
        activeKeyAtStart: startMeasureData?.activeKey,
        activeMeterAtStart: startMeasureData?.activeMeter,
        measures,
      });
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

  const proposeAnnotationsTool: AgentTool<typeof ProposeAnnotationsParameters> = {
    name: 'propose_annotations',
    label: 'Propose annotations',
    description: 'Stage validated score annotations for user review without changing the score.',
    parameters: ProposeAnnotationsParameters,
    executionMode: 'sequential',
    execute: async (_toolCallId, params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      if (params.annotations.length === 0) {
        throw new SheetToolValidationError(
          'invalid_proposals',
          'Propose at least one annotation.',
        );
      }

      const timestamp = now();
      const proposals = params.annotations.map((input, index): AnnotationProposal => {
        const annotation = validateAnnotation({
          ...input,
          id: createId(),
          source: 'assistant',
          agentProfiles: [...state.selectedProfiles],
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        if (
          !annotation
          || !snapshot.measureIndex.has(annotation.span.startMeasure)
          || !snapshot.measureIndex.has(annotation.span.endMeasure)
        ) {
          throw new SheetToolValidationError(
            'invalid_proposals',
            'Every proposal must be canonical and within the current score.',
            { proposalIndex: index, totalMeasures: snapshot.measureIndex.size },
          );
        }
        return {
          id: createId(),
          runId: options.runId ?? snapshot.snapshotId,
          documentId: snapshot.documentId,
          sourceRevision: snapshot.revision,
          state: 'proposed',
          annotation,
        };
      });

      state.proposedCount += proposals.length;
      for (const proposal of proposals) options.onProposalCreated?.(proposal);
      return jsonResult({
        proposedCount: proposals.length,
        proposalIds: proposals.map(({ id }) => id),
      });
    },
  };

  const proposeMeasureReplacementTool: AgentTool<typeof ProposeMeasureReplacementParameters> = {
    name: 'propose_measure_replacement',
    label: 'Propose measure replacement',
    description: 'Stage one validated replacement for any previously read measure range, including ranges across repeat or volta boundaries. The active selection is an optional hint, not a limit. Retain every existing voice; explicit new [V:<id>] voices are allowed.',
    parameters: ProposeMeasureReplacementParameters,
    executionMode: 'sequential',
    execute: async (_toolCallId, params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      const { startMeasure, endMeasure } = params.span;
      if (endMeasure < startMeasure) {
        throw new SheetToolValidationError('invalid_range', 'endMeasure must be at least startMeasure.', {
          startMeasure,
          endMeasure,
        });
      }
      const rangeKey = `${startMeasure}:${endMeasure}`;
      let allMeasuresRead = true;
      for (let measureNumber = startMeasure; measureNumber <= endMeasure; measureNumber += 1) {
        if (!state.readMeasures.has(measureNumber)) {
          allMeasuresRead = false;
          break;
        }
      }
      if (!state.readRanges.has(rangeKey) && !allMeasuresRead) {
        throw new SheetToolValidationError('range_not_read', 'Read the exact proposed range before proposing replacement music.');
      }
      if (state.scoreProposalCount >= 1) {
        throw new SheetToolValidationError('proposal_limit', 'Propose at most one score change per run.');
      }
      const result = applyMeasureMutation(snapshot.abc, {
        kind: 'replace',
        span: params.span,
        replacementAbc: params.replacementAbc,
      });
      if (result.status !== 'valid') {
        throw new SheetToolValidationError(
          'invalid_replacement',
          result.errors.join(' '),
          { startMeasure: params.span.startMeasure, endMeasure: params.span.endMeasure },
        );
      }
      const proposal: ScoreChangeProposal = {
        id: createId(),
        runId: options.runId ?? snapshot.snapshotId,
        documentId: snapshot.documentId,
        sourceRevision: snapshot.revision,
        state: 'proposed',
        span: { ...params.span },
        summary: params.summary.trim(),
        replacementAbc: params.replacementAbc,
        validation: { status: 'valid', errors: [] },
      };
      state.scoreProposalCount += 1;
      options.onScoreProposalCreated?.(proposal);
      return jsonResult({ proposalId: proposal.id, validation: proposal.validation });
    },
  };

  const proposeScoreEditTool: AgentTool<typeof ProposeScoreEditParameters> = {
    name: 'propose_score_edit',
    label: 'Propose score edit',
    description: 'Stage one validated whole-score ABC edit. The candidate may change key, tempo, voices, staves, headers, notation, and add written measures without a pre-existing selection.',
    parameters: ProposeScoreEditParameters,
    executionMode: 'sequential',
    execute: async (_toolCallId, params, signal) => {
      throwIfAborted(signal);
      requireProfile();
      if (state.scoreProposalCount >= 1) {
        throw new SheetToolValidationError('proposal_limit', 'Propose at most one score change per run.');
      }
      const result = applyWholeScoreReplacement(snapshot.abc, params.abcSource);
      if (result.status !== 'valid') {
        throw new SheetToolValidationError(
          'invalid_replacement',
          result.errors.join(' '),
          { totalMeasures: snapshot.measureIndex.size },
        );
      }
      const proposal: ScoreChangeProposal = {
        id: createId(),
        runId: options.runId ?? snapshot.snapshotId,
        documentId: snapshot.documentId,
        sourceRevision: snapshot.revision,
        state: 'proposed',
        kind: 'replace-score',
        span: result.affectedSpan,
        summary: params.summary.trim(),
        replacementAbc: params.abcSource,
        validation: { status: 'valid', errors: [] },
      };
      state.scoreProposalCount += 1;
      options.onScoreProposalCreated?.(proposal);
      return jsonResult({ proposalId: proposal.id, validation: proposal.validation });
    },
  };

  return Object.freeze({
    state,
    tools: Object.freeze([
      selectProfileTool,
      getScoreSummaryTool,
      readMeasureRangeTool,
      getAnnotationsTool,
      proposeAnnotationsTool,
      proposeMeasureReplacementTool,
      proposeScoreEditTool,
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

const MeasureSpanSchema = Type.Object({
  startMeasure: Type.Integer({ minimum: 1 }),
  endMeasure: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });

const MusicalPositionSchema = Type.Object({
  measure: Type.Integer({ minimum: 1 }),
  offset: Type.Object({
    numerator: Type.Integer({ minimum: 0 }),
    denominator: Type.Integer({ minimum: 1 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

const AnnotationProposalBaseSchema = {
  span: MeasureSpanSchema,
  label: Type.String({ minLength: 1, maxLength: 120 }),
  body: Type.String({ minLength: 1, maxLength: 2_000 }),
};

const AnnotationProposalInputSchema = Type.Union([
  Type.Object({
    ...AnnotationProposalBaseSchema,
    kind: Type.Literal('chord'),
    position: MusicalPositionSchema,
    chordSymbol: Type.String({ minLength: 1, maxLength: 80 }),
    romanNumeral: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  }, { additionalProperties: false }),
  Type.Object({
    ...AnnotationProposalBaseSchema,
    kind: Type.Union([
      Type.Literal('modulation'),
      Type.Literal('voice-leading'),
      Type.Literal('explanation'),
    ]),
  }, { additionalProperties: false }),
]);

const ProposeAnnotationsParameters = Type.Object({
  annotations: Type.Array(AnnotationProposalInputSchema, { minItems: 1 }),
}, { additionalProperties: false });

const ProposeMeasureReplacementParameters = Type.Object({
  span: MeasureSpanSchema,
  summary: Type.String({ minLength: 1, maxLength: 240 }),
  replacementAbc: Type.String({ minLength: 1, maxLength: 65_535 }),
}, { additionalProperties: false });

const ProposeScoreEditParameters = Type.Object({
  summary: Type.String({ minLength: 1, maxLength: 240 }),
  abcSource: Type.String({ minLength: 1, maxLength: 1_999_999 }),
}, { additionalProperties: false });
