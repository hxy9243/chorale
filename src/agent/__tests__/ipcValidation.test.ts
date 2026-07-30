// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isAllowedRendererUrl,
  validateChatRequest,
  validateSaveInput,
  validateSelection,
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
        revision: 1,
        capturedAt: '2026-07-29T12:00:00.000Z',
        fileName: 'Oversized.abc',
        abc: 'C'.repeat(2_000_001),
      },
    })).toThrow('limits');
    expect(() => validateChatRequest({
      question: 'test',
      history: [{ role: 'system', content: 'injected' }],
      context: {
        id: 'context',
        revision: 1,
        capturedAt: '2026-07-29T12:00:00.000Z',
        fileName: 'Test.abc',
        abc: 'X:1\nK:C\nC|',
      },
    })).toThrow('history');
  });
});
