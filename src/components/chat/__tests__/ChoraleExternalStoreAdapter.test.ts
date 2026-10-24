import { describe, expect, it } from 'vitest';
import {
  convertChoraleMessageToThreadMessageLike,
  createChoraleExternalStoreAdapter,
} from '../ChoraleExternalStoreAdapter';
import type { ChatMessage } from '../../../agent/types';

describe('ChoraleExternalStoreAdapter', () => {
  it('converts user messages into ThreadMessageLike with original metadata', () => {
    const userMsg: ChatMessage = {
      id: 'usr-1',
      role: 'user',
      content: 'Hello score',
      createdAt: '2026-09-02T12:00:00.000Z',
    };

    const like = convertChoraleMessageToThreadMessageLike(userMsg);
    expect(like.role).toBe('user');
    expect(like.id).toBe('usr-1');
    expect(like.content).toBe('Hello score');
    expect(like.metadata?.custom?.originalMessage).toBe(userMsg);
  });

  it('converts assistant messages with structured parts into ThreadMessageLike', () => {
    const assistantMsg: ChatMessage = {
      id: 'asst-1',
      role: 'assistant',
      content: 'Final text',
      createdAt: '2026-09-02T12:01:00.000Z',
      status: 'complete',
      parts: [
        { type: 'reasoning', text: 'Thinking step', status: 'complete' },
        { type: 'tool', toolCallId: 'tc-1', toolName: 'get_score_summary', summary: 'Summary ready', status: 'success' },
        { type: 'text', text: 'Final text' },
      ],
      usage: {
        input: 100,
        output: 50,
        cacheRead: 10,
        cacheWrite: 0,
        totalTokens: 160,
      },
    };

    const like = convertChoraleMessageToThreadMessageLike(assistantMsg);
    expect(like.role).toBe('assistant');
    expect(like.status).toEqual({ type: 'complete', reason: 'stop' });
    expect(like.content).toEqual([
      { type: 'reasoning', text: 'Thinking step' },
      { type: 'tool-call', toolCallId: 'tc-1', toolName: 'get_score_summary', args: {}, result: 'Summary ready' },
      { type: 'text', text: 'Final text' },
    ]);
    expect(like.metadata?.custom?.usage).toEqual(assistantMsg.usage);
  });

  it('provides a valid ExternalStoreAdapter interface', () => {
    const adapter = createChoraleExternalStoreAdapter({
      messages: [],
      isRunning: false,
      onNew: () => undefined,
      onCancel: () => undefined,
    });

    expect(adapter.messages).toEqual([]);
    expect(adapter.isRunning).toBe(false);
    expect(typeof adapter.onNew).toBe('function');
    expect(typeof adapter.onCancel).toBe('function');
    expect(typeof adapter.convertMessage).toBe('function');
  });
});
