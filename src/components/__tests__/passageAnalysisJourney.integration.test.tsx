import { Agent } from '@earendil-works/pi-agent-core';
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSheetTools } from '../../../electron/ai/sheetTools';
import { SHEET_AGENT_SYSTEM_PROMPT } from '../../../electron/ai/systemPrompt';
import { createMusicContextSnapshot } from '../../agent/musicContext';
import { createScoreSnapshot } from '../../music/scoreSnapshot';
import { MarkdownMessage } from '../MarkdownMessage';

describe('passage analysis journey', () => {
  it('captures a snapshot, routes and reads it, then navigates the Markdown answer', async () => {
    const context = createMusicContextSnapshot({
      id: 'journey-snapshot',
      documentId: 'journey-document',
      revision: 4,
      capturedAt: '2026-08-05T00:00:00.000Z',
      fileName: 'Journey.abc',
      abc: 'X:1\nT:Journey\nM:4/4\nL:1/4\nK:C\nG A B c | C4 |]',
      selection: { startMeasure: 1, endMeasure: 2 },
      annotations: [],
    });
    const snapshot = createScoreSnapshot({
      snapshotId: context.id,
      documentId: context.documentId,
      revision: context.revision,
      abc: context.abc,
      annotations: context.annotations,
    });
    const routedProfiles: string[][] = [];
    const registry = createSheetTools(snapshot, {
      onProfileRoute: (profiles) => routedProfiles.push([...profiles]),
    });
    const faux = createFauxCore({
      api: 'chorale-journey',
      provider: 'chorale-journey',
      models: [{ id: 'journey-model' }],
    });
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall('select_analysis_profile', { profiles: ['harmony'] }, { id: 'route' }),
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage(
        fauxToolCall(
          'read_measure_range',
          { startMeasure: 1, endMeasure: 2 },
          { id: 'read' },
        ),
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage('The dominant resolves in [mm. 1–2](#measure-1-2).'),
    ]);
    const calledTools: string[] = [];
    const agent = new Agent({
      initialState: {
        systemPrompt: SHEET_AGENT_SYSTEM_PROMPT,
        model: faux.getModel(),
        tools: [...registry.tools],
      },
      streamFn: faux.streamSimple,
    });
    agent.subscribe((event) => {
      if (event.type === 'tool_execution_start') calledTools.push(event.toolName);
    });

    await agent.prompt('Explain the selected cadence.');

    expect(context.selection).toEqual({ startMeasure: 1, endMeasure: 2 });
    expect(snapshot.snapshotId).toBe(context.id);
    expect(calledTools).toEqual(['select_analysis_profile', 'read_measure_range']);
    expect(routedProfiles).toEqual([['harmony']]);
    const finalMessage = agent.state.messages.at(-1);
    expect(finalMessage?.role).toBe('assistant');
    const markdown = finalMessage?.role === 'assistant'
      ? finalMessage.content.find((part) => part.type === 'text')?.text || ''
      : '';
    const onNavigateMeasure = vi.fn();
    render(
      <MarkdownMessage
        content={markdown}
        totalMeasures={snapshot.measures.length}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mm. 1–2' }));
    expect(onNavigateMeasure).toHaveBeenCalledWith({ startMeasure: 1, endMeasure: 2 });
  });
});
