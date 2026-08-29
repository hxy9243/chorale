import { describe, expect, it } from 'vitest';
import { formatPrompt, toAgentHistory } from '../promptUtils';
import type { ChatMessage, MusicContextSnapshot } from '../types';
import type { Model } from '@earendil-works/pi-ai';

describe('promptUtils', () => {
  const sampleSnapshot: MusicContextSnapshot = {
    id: 'snap-1',
    documentId: 'doc-1',
    fileName: 'test.abc',
    revision: 3,
    capturedAt: '2026-08-03T00:00:00.000Z',
    abc: 'X:1\nT:Test Tune\nK:C\nCDEF|',
    annotations: [],
  };

  it('formats prompt with music context correctly', () => {
    const formatted = formatPrompt('What is the key?', sampleSnapshot);
    expect(formatted).toContain('[CHORALE_MUSIC_CONTEXT]');
    expect(formatted).toContain('file="test.abc"');
    expect(formatted).toContain('revision=3');
    expect(formatted).toContain('scoreSummary: title="Test Tune", globalKey="C" (C major (0 sharps/flats)), meter="4/4", totalMeasures=1, voices=[voice-1]');
    expect(formatted).toContain('abc:\nX:1\nT:Test Tune\nK:C\nCDEF|');
    expect(formatted).toContain('User question: What is the key?');
  });

  it('formats prompt with active selection and inherited active key', () => {
    const multiMeasureSnapshot: MusicContextSnapshot = {
      id: 'snap-2',
      documentId: 'doc-2',
      fileName: 'chorale.abc',
      revision: 1,
      capturedAt: '2026-08-03T00:00:00.000Z',
      abc: [
        'X:1',
        'T:Chorale in G',
        'M:4/4',
        'L:1/4',
        'K:G',
        '[V:S] G A B c | d e f g |',
        '[V:A] D E F G | A B c d |',
        '[K:D] [V:S] d e f g | a b c\' d\' |',
        '[V:A] F G A B | c d e f |',
      ].join('\n'),
      selection: { startMeasure: 3, endMeasure: 4 },
      annotations: [{
        id: 'ann-1',
        kind: 'chord',
        span: { startMeasure: 3, endMeasure: 3 },
        position: { measure: 3, offset: { numerator: 0, denominator: 1 } },
        chordSymbol: 'D',
        romanNumeral: 'I',
        label: 'Tonic in D',
        body: 'Resolution to D major.',
        source: 'assistant',
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      }],
    };

    const formatted = formatPrompt('Analyze the harmony in mm. 3-4', multiMeasureSnapshot);
    expect(formatted).toContain('selection: mm. 3–4 | activeKey="D" (D major (2 sharps: F#, C#)) | activeMeter="4/4"');
    expect(formatted).toContain('selectedMeasuresAbc:');
    expect(formatted).toContain('[m. 3]');
    expect(formatted).toContain('[m. 4]');
    expect(formatted).toContain('existingAnnotationsInSelection:');
    expect(formatted).toContain('- [m. 3] chord: D (I) - Tonic in D');

    // Token count estimation (roughly 4 chars per token)
    const estimatedTokens = Math.ceil(formatted.length / 4);
    expect(estimatedTokens).toBeLessThan(1000);
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

  it('formats each historical message from its own captured score context', () => {
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
    const historicalContext: MusicContextSnapshot = {
      id: 'snap-history',
      documentId: 'doc-1',
      fileName: 'changing-score.abc',
      revision: 1,
      capturedAt: '2026-08-03T00:00:00.000Z',
      abc: 'X:1\nT:Original\nK:C\nC E G c |',
      selection: { startMeasure: 1, endMeasure: 1 },
      annotations: [],
    };
    const editedContext: MusicContextSnapshot = {
      ...historicalContext,
      id: 'snap-edited',
      revision: 2,
      capturedAt: '2026-08-03T00:01:00.000Z',
      abc: 'X:1\nT:Edited\nK:G\nG B d g |',
    };
    const messages: ChatMessage[] = [
      {
        id: 'msg-history',
        role: 'user',
        content: 'What key is this?',
        createdAt: historicalContext.capturedAt,
        context: historicalContext,
        status: 'complete',
      },
      {
        id: 'msg-edited',
        role: 'user',
        content: 'What key is it now?',
        createdAt: editedContext.capturedAt,
        context: editedContext,
        status: 'complete',
      },
    ];

    const history = toAgentHistory(messages, mockModel);
    const historicalPrompt = (history[0] as { content: string }).content;
    const editedPrompt = (history[1] as { content: string }).content;
    expect(historicalPrompt).toContain('revision=1');
    expect(historicalPrompt).toContain('globalKey="C"');
    expect(historicalPrompt).toContain('C E G c |');
    expect(historicalPrompt).not.toContain('globalKey="G"');
    expect(historicalPrompt).not.toContain('G B d g |');
    expect(editedPrompt).toContain('revision=2');
    expect(editedPrompt).toContain('globalKey="G"');
    expect(editedPrompt).toContain('G B d g |');
    expect(editedPrompt).not.toContain('globalKey="C"');
    expect(editedPrompt).not.toContain('C E G c |');
  });
});
