// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isAllowedRendererUrl,
  validateChatRequest,
  validateSaveInput,
  validateSelection,
  validateSteerRequest,
} from '../../../electron/ipcValidation';

describe('AI IPC validation', () => {
  it('accepts only the desktop app and fixed Vite development origins', () => {
    expect(isAllowedRendererUrl('app://chorale/index.html')).toBe(true);
    expect(isAllowedRendererUrl('http://127.0.0.1:5173/src/main.tsx')).toBe(true);
    expect(isAllowedRendererUrl('http://localhost:5173/')).toBe(true);
    expect(isAllowedRendererUrl('https://chorale.example/')).toBe(false);
    expect(isAllowedRendererUrl('http://127.0.0.1:9000/')).toBe(false);
    expect(isAllowedRendererUrl('file:///tmp/index.html')).toBe(false);
  });

  it('rejects Codex credential injection and malformed custom headers', () => {
    expect(() => validateSaveInput({
      name: 'Injected Codex',
      kind: 'openai-codex',
      apiKey: 'secret',
    })).toThrow('Invalid AI connection');
    expect(() => validateSaveInput({
      name: 'Custom',
      kind: 'custom',
      headers: { 'X-Test': 12 },
    })).toThrow('custom headers');
    expect(validateSaveInput({
      name: 'Custom',
      kind: 'custom',
      clearHeaders: true,
    }).clearHeaders).toBe(true);
  });

  it('validates selections and bounded chat payloads', () => {
    expect(validateSelection({ connectionId: 'connection', modelId: 'model' })).toEqual({
      connectionId: 'connection',
      modelId: 'model',
    });
    expect(() => validateSelection({ connectionId: '', modelId: 'model' })).toThrow('connection ID');
    expect(() => validateChatRequest({
      question: 'test',
      history: [],
      context: {
        id: 'context',
        documentId: 'document',
        revision: 1,
        capturedAt: '2026-07-29T12:00:00.000Z',
        fileName: 'Oversized.abc',
        abc: 'C'.repeat(2_000_001),
        annotations: [],
      },
    })).toThrow('limits');
    expect(() => validateChatRequest({
      question: 'test',
      history: [{ role: 'system', content: 'injected' }],
      context: {
        id: 'context',
        documentId: 'document',
        revision: 1,
        capturedAt: '2026-07-29T12:00:00.000Z',
        fileName: 'Test.abc',
        abc: 'X:1\nK:C\nC|',
        annotations: [],
      },
    })).toThrow('history');
  });

  it('validates and reconstructs structured history parts at the IPC boundary', () => {
    const request = validateChatRequest({
      question: 'Continue',
      history: [{
        id: 'assistant-1',
        role: 'assistant',
        content: 'Visible answer',
        createdAt: '2026-09-03T00:00:00.000Z',
        status: 'complete',
        parts: [
          { type: 'reasoning', text: 'Private reasoning', status: 'complete' },
          { type: 'tool', toolCallId: 'tool-1', toolName: 'read_score', summary: 'Read measures 1-4', status: 'success', durationMs: 12 },
          { type: 'text', text: 'Visible answer' },
        ],
        rendererOnly: 'must not cross the trust boundary',
      }],
      context: {
        id: 'context',
        documentId: 'document',
        revision: 1,
        capturedAt: '2026-09-03T00:00:00.000Z',
        fileName: 'Test.abc',
        abc: 'X:1\nK:C\nC|',
        annotations: [],
      },
    });

    expect(request.history[0]).toEqual({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Visible answer',
      createdAt: '2026-09-03T00:00:00.000Z',
      status: 'complete',
      parts: [
        { type: 'reasoning', text: 'Private reasoning', status: 'complete' },
        { type: 'tool', toolCallId: 'tool-1', toolName: 'read_score', summary: 'Read measures 1-4', status: 'success', durationMs: 12 },
        { type: 'text', text: 'Visible answer' },
      ],
    });
  });

  it('rejects malformed and oversized structured history parts', () => {
    const context = {
      id: 'context',
      documentId: 'document',
      revision: 1,
      capturedAt: '2026-09-03T00:00:00.000Z',
      fileName: 'Test.abc',
      abc: 'X:1\nK:C\nC|',
      annotations: [],
    };
    const message = {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: '2026-09-03T00:00:00.000Z',
    };

    expect(() => validateChatRequest({
      question: 'Continue',
      history: [{ ...message, parts: [{ type: 'text', text: 'x'.repeat(500_001) }] }],
      context,
    })).toThrow('limits');
    expect(() => validateChatRequest({
      question: 'Continue',
      history: [{ ...message, parts: [{ type: 'reasoning', text: 'x', status: 'unknown' }] }],
      context,
    })).toThrow('parts');
    expect(() => validateChatRequest({
      question: 'Continue',
      history: [{ ...message, parts: [{ type: 'tool', toolCallId: 'tool-1', toolName: 'read_score', summary: 'x', status: 'success', durationMs: -1 }] }],
      context,
    })).toThrow('parts');
  });

  it('accepts supported thinking levels, defaults old requests to off, and rejects unknown values', () => {
    const baseRequest = {
      question: 'Analyze this',
      history: [],
      context: {
        id: 'context',
        documentId: 'document',
        revision: 1,
        capturedAt: '2026-08-12T00:00:00.000Z',
        fileName: 'Test.abc',
        abc: 'X:1\nK:C\nC|',
        annotations: [],
      },
    };

    expect(validateChatRequest({ ...baseRequest, thinkingLevel: 'high' }).thinkingLevel).toBe('high');
    expect(validateChatRequest(baseRequest).thinkingLevel).toBe('off');
    expect(() => validateChatRequest({ ...baseRequest, thinkingLevel: 'unlimited' }))
      .toThrow('thinking level');
  });

  it('normalizes bounded ranges and canonical annotations', () => {
    const request = validateChatRequest({
      question: 'Analyze this range',
      history: [],
      context: {
        id: 'snapshot-1',
        documentId: 'document-1',
        revision: 2,
        capturedAt: '2026-08-05T00:00:00.000Z',
        fileName: 'score.abc',
        abc: 'X:1\nK:C\nC|',
        selection: {
          startMeasure: 2,
          endMeasure: 4,
          playbackFraction: 0.25,
        },
        annotations: [{
          id: 'chord-1',
          kind: 'chord',
          span: { startMeasure: 2, endMeasure: 2 },
          position: { measure: 2, offset: { numerator: 1, denominator: 4 } },
          chordSymbol: 'G7',
          label: 'Dominant',
          body: 'Resolves onward.',
          source: 'assistant',
          agentProfiles: ['harmony'],
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        }],
      },
    });

    expect(request.context).toMatchObject({
      id: 'snapshot-1',
      documentId: 'document-1',
      selection: { startMeasure: 2, endMeasure: 4 },
      annotations: [{ kind: 'chord', chordSymbol: 'G7' }],
    });
  });

  it('rejects reversed anchors, legacy current contexts, and malformed rationals', () => {
    const context = {
      id: 'snapshot-1',
      documentId: 'document-1',
      revision: 2,
      capturedAt: '2026-08-05T00:00:00.000Z',
      fileName: 'score.abc',
      abc: 'X:1\nK:C\nC|',
      annotations: [],
    };
    expect(() => validateChatRequest({
      question: 'test',
      history: [],
      context: { ...context, selection: { startMeasure: 4, endMeasure: 2 } },
    })).toThrow('selection');
    expect(() => validateChatRequest({
      question: 'test',
      history: [],
      context: { ...context, documentId: undefined },
    })).toThrow('music context');
    expect(() => validateChatRequest({
      question: 'test',
      history: [],
      context: {
        ...context,
        annotations: [{
          id: 'bad-rational',
          kind: 'chord',
          span: { startMeasure: 1, endMeasure: 1 },
          position: { measure: 1, offset: { numerator: 2, denominator: 4 } },
          chordSymbol: 'C',
          label: 'Chord',
          body: 'Body',
          source: 'assistant',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        }],
      },
    })).toThrow('annotation');
    expect(() => validateChatRequest({
      question: 'test',
      history: [],
      context: { ...context, annotations: Array.from({ length: 2_001 }, () => null) },
    })).toThrow('limits');
  });

  it('normalizes legacy history context without weakening the current snapshot', () => {
    const request = validateChatRequest({
      question: 'Continue',
      history: [{
        id: 'message-1',
        role: 'user',
        content: 'Earlier question',
        createdAt: '2026-08-04T00:00:00.000Z',
        context: {
          id: 'legacy-snapshot',
          revision: 1,
          capturedAt: '2026-08-04T00:00:00.000Z',
          fileName: 'score.abc',
          abc: 'X:1\nK:C\nC|',
          selection: { measureStart: 1, measureEnd: 2 },
        },
      }],
      context: {
        id: 'snapshot-current',
        documentId: 'document-current',
        revision: 2,
        capturedAt: '2026-08-05T00:00:00.000Z',
        fileName: 'score.abc',
        abc: 'X:1\nK:C\nC|',
        annotations: [],
      },
    });

    expect(request.history[0].context).toMatchObject({
      documentId: 'document-current',
      selection: { startMeasure: 1, endMeasure: 2 },
      annotations: [],
    });
  });

  it('validates steer request bounds and IDs', () => {
    const validContext = {
      id: 'snapshot-current',
      documentId: 'document-current',
      revision: 2,
      capturedAt: '2026-08-05T00:00:00.000Z',
      fileName: 'score.abc',
      abc: 'X:1\nK:C\nC|',
      annotations: [],
    };

    const validated = validateSteerRequest('req-1', {
      messageId: 'steer-1',
      question: 'Change cadence to authentic',
      context: validContext,
    });
    expect(validated).toEqual({
      requestId: 'req-1',
      steer: {
        messageId: 'steer-1',
        question: 'Change cadence to authentic',
        context: expect.objectContaining({ id: 'snapshot-current' }),
      },
    });

    expect(() => validateSteerRequest('', { messageId: 'm1', question: 'q', context: validContext }))
      .toThrow('request ID');
    expect(() => validateSteerRequest('req-1', null))
      .toThrow('Invalid steer request');
    expect(() => validateSteerRequest('req-1', { messageId: '', question: 'q', context: validContext }))
      .toThrow('message ID');
    expect(() => validateSteerRequest('req-1', {
      messageId: 'm1',
      question: 'a'.repeat(20_001),
      context: validContext,
    })).toThrow('limits');
  });
});
