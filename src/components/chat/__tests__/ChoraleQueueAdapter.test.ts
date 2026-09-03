import { describe, expect, it, vi } from 'vitest';
import type { AppendMessage } from '@assistant-ui/react';
import { createChoraleQueueAdapter } from '../ChoraleQueueAdapter';
import type { MusicContextSnapshot, QueuedChatMessage } from '../../../agent/types';

const dummyContext: MusicContextSnapshot = {
  id: 'ctx-1',
  documentId: 'doc-1',
  revision: 1,
  capturedAt: '2026-09-02T12:00:00.000Z',
  fileName: 'score.abc',
  abc: 'X:1\nK:C\nC4|',
  annotations: [],
};

const makeAppendMessage = (text: string): AppendMessage => ({
  role: 'user',
  createdAt: new Date(),
  metadata: { custom: {} },
  content: [{ type: 'text', text }],
} as unknown as AppendMessage);

describe('ChoraleQueueAdapter', () => {
  it('enqueues into FIFO queue and steer lanes with immutable context snapshot', () => {
    let pending: QueuedChatMessage[] = [];
    const onQueueChange = vi.fn((next) => {
      pending = next;
    });

    const adapter = createChoraleQueueAdapter({
      fileId: 'doc-1',
      threadId: 't-1',
      pendingMessages: pending,
      onQueueChange,
      getMusicContext: () => dummyContext,
    });

    adapter.enqueue(makeAppendMessage('Follow-up prompt'));
    expect(onQueueChange).toHaveBeenCalledOnce();
    expect(pending).toHaveLength(1);
    expect(pending[0].lane).toBe('queue');
    expect(pending[0].prompt).toBe('Follow-up prompt');
    expect(pending[0].context).toEqual(dummyContext);

    const steerAdapter = createChoraleQueueAdapter({
      fileId: 'doc-1',
      threadId: 't-1',
      pendingMessages: pending,
      onQueueChange,
      getMusicContext: () => dummyContext,
    });

    steerAdapter.steer(makeAppendMessage('Priority steer'));
    expect(pending).toHaveLength(2);
    expect(pending[1].lane).toBe('steer');
    expect(pending[1].prompt).toBe('Priority steer');
  });

  it('supports edit, remove, and reorder operations', () => {
    let pending: QueuedChatMessage[] = [
      { id: 'q-1', prompt: 'First', lane: 'queue', createdAt: '2026-09-02T12:00:00.000Z', context: dummyContext },
      { id: 'q-2', prompt: 'Second', lane: 'queue', createdAt: '2026-09-02T12:01:00.000Z', context: dummyContext },
    ];
    const onQueueChange = vi.fn((next) => {
      pending = next;
    });

    const adapter = createChoraleQueueAdapter({
      fileId: 'doc-1',
      threadId: 't-1',
      pendingMessages: pending,
      onQueueChange,
      getMusicContext: () => dummyContext,
    });

    adapter.edit('q-1', makeAppendMessage('Edited First'));
    expect(pending[0].prompt).toBe('Edited First');

    adapter.reorder('q-2', 'up');
    expect(pending[0].id).toBe('q-2');
    expect(pending[1].id).toBe('q-1');

    adapter.remove('q-1');
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('q-2');
  });

  it('runNext prioritizes steer items and pops in FIFO order', () => {
    let pending: QueuedChatMessage[] = [
      { id: 'q-1', prompt: 'First Queue', lane: 'queue', createdAt: '2026-09-02T12:00:00.000Z', context: dummyContext },
      { id: 'q-2', prompt: 'First Steer', lane: 'steer', createdAt: '2026-09-02T12:01:00.000Z', context: dummyContext },
      { id: 'q-3', prompt: 'Second Queue', lane: 'queue', createdAt: '2026-09-02T12:02:00.000Z', context: dummyContext },
    ];
    const onQueueChange = vi.fn((next) => {
      pending = next;
    });

    const adapter = createChoraleQueueAdapter({
      fileId: 'doc-1',
      threadId: 't-1',
      pendingMessages: pending,
      onQueueChange,
      getMusicContext: () => dummyContext,
    });

    const first = adapter.runNext();
    expect(first?.id).toBe('q-2'); // steer lane prioritized
    expect(pending).toHaveLength(2);

    const secondAdapter = createChoraleQueueAdapter({
      fileId: 'doc-1',
      threadId: 't-1',
      pendingMessages: pending,
      onQueueChange,
      getMusicContext: () => dummyContext,
    });
    const second = secondAdapter.runNext();
    expect(second?.id).toBe('q-1'); // FIFO order
  });
});
