import { describe, expect, it } from 'vitest';
import { formatPrompt, toAgentHistory } from '../promptUtils';
import type { ChatMessage, MusicContextSnapshot } from '../types';
import type { Model } from '@earendil-works/pi-ai';

describe('promptUtils', () => {
  const sampleSnapshot: MusicContextSnapshot = {
    id: 'snap-1',
    fileName: 'test.abc',
    revision: 3,
    capturedAt: '2026-08-03T00:00:00.000Z',
    abc: 'X:1\nT:Test Tune\nK:C\nCDEF|',
  };

  it('formats prompt with music context correctly', () => {
    const formatted = formatPrompt('What is the key?', sampleSnapshot);
    expect(formatted).toContain('[CHORALE_MUSIC_CONTEXT]');
    expect(formatted).toContain('file="test.abc"');
    expect(formatted).toContain('revision=3');
    expect(formatted).toContain('abc:\nX:1\nT:Test Tune\nK:C\nCDEF|');
    expect(formatted).toContain('User question: What is the key?');
  });

  it('converts chat messages to agent history format', () => {
    const mockModel: Model<'openai-responses'> = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      api: 'openai-responses',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    };

    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        createdAt: '2026-08-03T00:00:00.000Z',
        status: 'complete',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        createdAt: '2026-08-03T00:00:05.000Z',
        status: 'complete',
      },
    ];

    const history = toAgentHistory(messages, mockModel);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });
});
