import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { AIEvent } from '../../src/agent/aiTypes';

type ToolStartEvent = Extract<AgentEvent, { type: 'tool_execution_start' }>;
type ToolDoneEvent = Extract<AgentEvent, { type: 'tool_execution_end' }>;

const integer = (value: unknown) => Number.isSafeInteger(value) ? value as number : undefined;

export const summarizeToolStart = (event: ToolStartEvent): string => {
  if (event.toolName === 'select_analysis_profile') return 'Choosing analysis focus';
  if (event.toolName === 'get_score_summary') return 'Reading score summary';
  if (event.toolName === 'read_measure_range') {
    const start = integer(event.args?.startMeasure);
    const end = integer(event.args?.endMeasure);
    return start !== undefined && end !== undefined
      ? `Reading ${start === end ? `m. ${start}` : `mm. ${start}–${end}`}`
      : 'Reading measure range';
  }
  if (event.toolName === 'get_annotations') return 'Reading score annotations';
  return 'Using score tool';
};

export const summarizeToolDone = (event: ToolDoneEvent): string => {
  if (event.isError) return 'Tool could not complete';
  if (event.toolName === 'select_analysis_profile') return 'Analysis focus selected';
  if (event.toolName === 'get_score_summary') return 'Score summary ready';
  if (event.toolName === 'read_measure_range') {
    const count = Array.isArray(event.result?.details?.measures)
      ? event.result.details.measures.length
      : undefined;
    return count === undefined ? 'Measure range ready' : `Read ${count} measure${count === 1 ? '' : 's'}`;
  }
  if (event.toolName === 'get_annotations') {
    const count = Array.isArray(event.result?.details?.annotations)
      ? event.result.details.annotations.length
      : undefined;
    return count === undefined ? 'Annotations ready' : `Found ${count} annotation${count === 1 ? '' : 's'}`;
  }
  return 'Score tool complete';
};

export const projectToolLifecycleEvent = (
  requestId: string,
  event: ToolStartEvent | ToolDoneEvent,
): Extract<AIEvent, { type: 'tool-start' | 'tool-done' }> => (
  event.type === 'tool_execution_start'
    ? {
        type: 'tool-start',
        requestId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        summary: summarizeToolStart(event),
      }
    : {
        type: 'tool-done',
        requestId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: event.isError ? 'error' : 'success',
        summary: summarizeToolDone(event),
      }
);
