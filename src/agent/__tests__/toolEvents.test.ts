// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { projectToolLifecycleEvent } from '../../../electron/ai/toolEvents';

describe('renderer-safe tool event projection', () => {
  it('preserves request and tool-call correlation with compact start summaries', () => {
    expect(projectToolLifecycleEvent('request-1', {
      type: 'tool_execution_start',
      toolCallId: 'call-1',
      toolName: 'read_measure_range',
      args: {
        startMeasure: 3,
        endMeasure: 7,
        abc: 'secret score payload',
        apiKey: 'secret credential',
      },
    })).toEqual({
      type: 'tool-start',
      requestId: 'request-1',
      toolCallId: 'call-1',
      toolName: 'read_measure_range',
      summary: 'Reading mm. 3–7',
    });
  });

  it('summarizes successful and failed results without forwarding result payloads', () => {
    const success = projectToolLifecycleEvent('request-1', {
      type: 'tool_execution_end',
      toolCallId: 'call-2',
      toolName: 'read_measure_range',
      result: {
        details: { measures: [{ abcSlice: 'private ABC' }, { abcSlice: 'private ABC' }] },
        content: [{ type: 'text', text: 'private result' }],
      },
      isError: false,
    });
    const failure = projectToolLifecycleEvent('request-1', {
      type: 'tool_execution_end',
      toolCallId: 'call-3',
      toolName: 'get_annotations',
      result: { details: { apiKey: 'private' }, content: [] },
      isError: true,
    });

    expect(success).toEqual({
      type: 'tool-done',
      requestId: 'request-1',
      toolCallId: 'call-2',
      toolName: 'read_measure_range',
      status: 'success',
      summary: 'Read 2 measures',
    });
    expect(failure).toEqual({
      type: 'tool-done',
      requestId: 'request-1',
      toolCallId: 'call-3',
      toolName: 'get_annotations',
      status: 'error',
      summary: 'Tool could not complete',
    });
    expect(JSON.stringify([success, failure])).not.toContain('private');
  });
});
