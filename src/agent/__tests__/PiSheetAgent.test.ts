import { describe, expect, it } from 'vitest';
import { PiSheetAgent } from '../PiSheetAgent';
import type { ChatMessage, MusicContextSnapshot } from '../types';

const snapshot: MusicContextSnapshot = {
  id: 'snapshot-7',
  revision: 7,
  capturedAt: '2026-07-23T12:00:00.000Z',
  fileName: 'Unsaved study.abc',
  abc: [
    'X:1',
    'T:Unsaved Waltz',
    'M:3/4',
    'K:Dm',
    '|: D2 F | A2 d :|',
  ].join('\n'),
};

describe('PiSheetAgent', () => {
  it('streams a Pi SDK response grounded in the current ABC snapshot', async () => {
    const agent = new PiSheetAgent({ tokensPerSecond: 10_000 });
    const deltas: string[] = [];

    const response = await agent.send(
      [],
      'What am I looking at?',
      snapshot,
      { onDelta: (delta) => deltas.push(delta) },
      new AbortController().signal,
    );

    expect(deltas.length).toBeGreaterThan(1);
    expect(response).toContain('Unsaved Waltz');
    expect(response).toContain('revision 7');
    expect(response).toContain('key Dm');
    expect(response).toContain('meter 3/4');
  });

  it('reconstructs prior conversation history before the next Pi turn', async () => {
    const history: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'What is the meter?',
        createdAt: '2026-07-23T12:00:01.000Z',
        context: snapshot,
        status: 'complete',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'The meter is 3/4.',
        createdAt: '2026-07-23T12:00:02.000Z',
        status: 'complete',
      },
    ];
    const agent = new PiSheetAgent({ tokensPerSecond: 10_000 });

    const response = await agent.send(
      history,
      'And what key?',
      { ...snapshot, revision: 8 },
      { onDelta: () => undefined },
      new AbortController().signal,
    );

    expect(response).toContain('turn 2');
    expect(response).toContain('revision 8');
  });

  it('aborts the Pi stream without delivering later deltas', async () => {
    const agent = new PiSheetAgent({ tokensPerSecond: 20 });
    const controller = new AbortController();
    const deltas: string[] = [];

    const response = agent.send(
      [],
      'Give me a detailed explanation.',
      snapshot,
      {
        onDelta: (delta) => {
          deltas.push(delta);
          controller.abort();
        },
      },
      controller.signal,
    );

    await expect(response).rejects.toMatchObject({ name: 'AbortError' });
    const deliveredAtStop = deltas.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(deltas).toHaveLength(deliveredAtStop);
  });
});
