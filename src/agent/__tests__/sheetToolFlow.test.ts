// @vitest-environment node
import { Agent } from '@earendil-works/pi-agent-core';
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { describe, expect, it } from 'vitest';
import { createScoreSnapshot } from '../../music/scoreSnapshot';
import { createSheetTools } from '../../../electron/ai/sheetTools';
import { SHEET_AGENT_SYSTEM_PROMPT } from '../../../electron/ai/systemPrompt';

describe('passage analysis tool flow', () => {
  it('routes a passage question, reads the score, then produces the final answer', async () => {
    const snapshot = createScoreSnapshot({
      snapshotId: 'snapshot-flow',
      documentId: 'document-flow',
      revision: 1,
      abc: 'X:1\nT:Cadence\nM:4/4\nL:1/4\nK:C\nG A B c | C4 |]',
      annotations: [],
    });
    const registry = createSheetTools(snapshot);
    const faux = createFauxCore({
      api: 'chorale-tool-flow',
      provider: 'chorale-tool-flow',
      models: [{ id: 'tool-flow-model' }],
    });
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall(
          'select_analysis_profile',
          { profiles: ['harmony'] },
          { id: 'tool-route' },
        ),
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage(
        fauxToolCall(
          'read_measure_range',
          { startMeasure: 1, endMeasure: 2 },
          { id: 'tool-read' },
        ),
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage('The dominant resolves to tonic in [mm. 1–2](#measure-1-2).'),
    ]);
    const events: Array<{ type: string; toolName?: string }> = [];
    const agent = new Agent({
      initialState: {
        systemPrompt: SHEET_AGENT_SYSTEM_PROMPT,
        model: faux.getModel(),
        tools: [...registry.tools],
      },
      streamFn: faux.streamSimple,
    });
    agent.subscribe((event) => {
      if (event.type === 'tool_execution_start') {
        events.push({ type: event.type, toolName: event.toolName });
      } else if (
        event.type === 'message_update'
        && event.assistantMessageEvent.type === 'text_delta'
      ) {
        events.push({ type: 'final-text' });
      }
    });

    await agent.prompt('How does this cadence resolve?');

    expect(events.filter(({ type }) => type === 'tool_execution_start')).toEqual([
      { type: 'tool_execution_start', toolName: 'select_analysis_profile' },
      { type: 'tool_execution_start', toolName: 'read_measure_range' },
    ]);
    expect(events.findIndex(({ toolName }) => toolName === 'read_measure_range'))
      .toBeLessThan(events.findIndex(({ type }) => type === 'final-text'));
    expect(registry.state.selectedProfiles).toEqual(['harmony']);
    expect(faux.state.callCount).toBe(3);
    expect(agent.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{
        type: 'text',
        text: 'The dominant resolves to tonic in [mm. 1–2](#measure-1-2).',
      }],
    });
  });
});
